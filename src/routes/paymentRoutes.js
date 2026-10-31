import { notifyUser } from "../services/notificationService.js";
import { User } from "../models/userModel.js";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { Payment } from "../models/paymentModel.js";
import { verifyJWT } from "../middlewares/authMiddleware.js";
import { requireRole } from "../middlewares/roleMiddleware.js";
import { validateBody } from "../validations/schemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import {
  paymentConfiguration,
  validSignature,
  createPaymentOrder,
  verifyCheckout,
  applyCapturedPayment,
  gatewayRequest,
} from "../services/paymentService.js";
const r = Router();
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const token = z
  .string()
  .regex(/^[A-Za-z0-9_]+$/)
  .max(100);
r.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET)
      throw new ApiError(503, "Webhook configuration is incomplete");
    if (
      !req.rawBody ||
      !validSignature(
        req.rawBody,
        req.get("x-razorpay-signature"),
        process.env.RAZORPAY_WEBHOOK_SECRET,
      )
    )
      throw new ApiError(400, "Invalid webhook signature");
    const gateway = req.body.payload?.payment?.entity;
    if (["payment.captured", "order.paid"].includes(req.body.event)) {
      if (!gateway) throw new ApiError(400, "Payment entity missing");
      const payment = await Payment.findOne({ orderId: gateway.order_id });
      if (!payment)
        throw new ApiError(
          503,
          "Order binding is not available yet; retry delivery",
        );
      await applyCapturedPayment(payment, gateway);
    } else if (req.body.event === "payment.failed" && gateway) {
      await Payment.updateOne(
        { orderId: gateway.order_id, status: { $ne: "paid" } },
        {
          $set: {
            lastError:
              "The latest payment attempt failed. Retry the same order.",
          },
        },
      );
    }
    res.json({ received: true });
  }),
);
r.use(verifyJWT);
r.get(
  "/configuration",
  asyncHandler(async (req, res) =>
    res.json(
      new ApiResponse(200, paymentConfiguration(), "Payment availability"),
    ),
  ),
);
r.get(
  "/",
  asyncHandler(async (req, res) => {
    const scope =
      req.user.roles.includes("admin") && req.query.all === "true"
        ? {}
        : { $or: [{ customerId: req.user._id }, { providerId: req.user._id }] };
    const payments = await Payment.find(scope)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("customerId providerId", "name")
      .lean();
    res.json(new ApiResponse(200, payments, "Payment records"));
  }),
);
r.use(
  rateLimit({
    windowMs: 600000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.user._id),
  }),
);
r.post(
  "/orders",
  requireRole("athlete"),
  validateBody(z.object({ requestId: objectId })),
  asyncHandler(async (req, res) =>
    res.json(
      new ApiResponse(
        200,
        await createPaymentOrder(req.user._id, req.body.requestId),
        "Payment order ready",
      ),
    ),
  ),
);
r.post(
  "/verify",
  requireRole("athlete"),
  validateBody(
    z.object({
      requestId: objectId,
      razorpay_order_id: token,
      razorpay_payment_id: token,
      razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
    }),
  ),
  asyncHandler(async (req, res) => {
    const result = await verifyCheckout(req.user._id, req.body);
    res
      .status(result.status === "paid" ? 200 : 202)
      .json(new ApiResponse(200, result, "Payment checked"));
  }),
);
r.post(
  "/:id/refresh",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id))
      throw new ApiError(404, "Payment not found");
    const payment = await Payment.findOne({
      _id: req.params.id,
      ...(req.user.roles.includes("admin")
        ? {}
        : {
            $or: [{ customerId: req.user._id }, { providerId: req.user._id }],
          }),
    });
    if (!payment) throw new ApiError(404, "Payment not found");
    if (!payment.orderId)
      throw new ApiError(
        409,
        "The gateway order needs merchant reconciliation",
      );
    const attempts = await gatewayRequest(
      `/orders/${encodeURIComponent(payment.orderId)}/payments`,
    );
    const captured = attempts.items?.find((item) => item.status === "captured");
    const result = captured
      ? await applyCapturedPayment(payment, captured)
      : payment;
    res.json(new ApiResponse(200, result, "Payment status refreshed"));
  }),
);
r.post(
  "/:id/support",
  validateBody(z.object({ message: z.string().trim().min(5).max(2000) })),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id))
      throw new ApiError(404, "Payment not found");
    const payment = await Payment.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [{ customerId: req.user._id }, { providerId: req.user._id }],
      },
      {
        $set: {
          supportMessage: req.body.message,
          supportRequestedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!payment) throw new ApiError(404, "Payment not found");
    const admins = await User.find({ roles: "admin" }).select("_id");
    await Promise.all(
      admins.map((user) =>
        notifyUser(user._id, `payment-support:${payment._id}`, {
          type: "marketplace",
          title: "A payment support request",
          body: `${payment.title}: a participant requested help.`,
          href: "/marketplace/payments",
        }),
      ),
    );
    res.json(new ApiResponse(200, null, "Payment help request recorded"));
  }),
);
r.post(
  "/:id/reconcile",
  requireRole("admin"),
  validateBody(z.object({ orderId: token })),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id))
      throw new ApiError(404, "Payment not found");
    const payment = await Payment.findById(req.params.id);
    if (!payment) throw new ApiError(404, "Payment not found");
    const order = await gatewayRequest(
      `/orders/${encodeURIComponent(req.body.orderId)}`,
    );
    if (
      order.receipt !== String(payment._id) ||
      order.amount !== payment.amount ||
      order.currency !== payment.currency
    )
      throw new ApiError(
        400,
        "Gateway order does not match this payment record",
      );
    if (payment.orderId && payment.orderId !== order.id)
      throw new ApiError(409, "A different gateway order is already bound");
    payment.orderId = order.id;
    if (payment.status !== "paid") payment.status = "created";
    await payment.save();
    const attempts = await gatewayRequest(
      `/orders/${encodeURIComponent(order.id)}/payments`,
    );
    const captured = attempts.items?.find((item) => item.status === "captured");
    const result = captured
      ? await applyCapturedPayment(payment, captured)
      : payment;
    res.json(new ApiResponse(200, result, "Payment reconciled"));
  }),
);
export default r;
