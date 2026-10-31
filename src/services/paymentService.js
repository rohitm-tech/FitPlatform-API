import crypto from "node:crypto";
import { Payment } from "../models/paymentModel.js";
import { MarketRequest, MarketListing } from "../models/marketplaceModel.js";
import { User } from "../models/userModel.js";
import { CoachAthlete } from "../models/coachAthleteModel.js";
import { ApiError } from "../utils/apiError.js";
import { notifyUser } from "./notificationService.js";
export function paymentConfiguration() {
  const key = process.env.RAZORPAY_KEY_ID || "";
  const configured = !!(
    key &&
    process.env.RAZORPAY_KEY_SECRET &&
    process.env.RAZORPAY_WEBHOOK_SECRET
  );
  const enabled =
    configured &&
    process.env.PAYMENTS_ENABLED === "true" &&
    /^rzp_(test|live)_/.test(key);
  return {
    enabled,
    mode: enabled
      ? key.startsWith("rzp_test_")
        ? "test"
        : "live"
      : "disabled",
    reason: enabled
      ? ""
      : "Online payments are not enabled yet. Your accepted request is saved; no money has been charged.",
  };
}
export function validSignature(message, signature, secret) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature || "")) return false;
  const expected = crypto.createHmac("sha256", secret).update(message).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export async function gatewayRequest(path, body) {
  try {
    const response = await fetch("https://api.razorpay.com/v1" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`,
          ).toString("base64"),
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(25000),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new ApiError(
        502,
        "The payment provider could not complete this request.",
      );
      error.uncertain = response.status >= 500;
      throw error;
    }
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const wrapped = new ApiError(
      502,
      "Payment provider connection interrupted. The order will be checked before another attempt.",
    );
    wrapped.uncertain = true;
    throw wrapped;
  }
}
export async function createPaymentOrder(customerId, requestId) {
  await Payment.init();
  const settings = paymentConfiguration();
  if (!settings.enabled) throw new ApiError(503, settings.reason);
  const request = await MarketRequest.findOne({
    _id: requestId,
    customerId,
    status: "accepted",
  });
  if (!request)
    throw new ApiError(
      409,
      "The provider must accept your request before payment.",
    );
  const listing = await MarketListing.findById(request.listingId);
  const provider = await User.findById(request.providerId).select("roles");
  if (
    !listing ||
    listing.status !== "published" ||
    !provider ||
    !provider.roles.some((role) =>
      ["coach", "gym_owner", "admin"].includes(role),
    )
  )
    throw new ApiError(
      409,
      "The offering is unavailable. No payment can be started.",
    );
  if (request.isDemo && settings.mode === "live")
    throw new ApiError(
      409,
      "Demo listings cannot be charged in live mode. Create and approve a real offering first.",
    );
  if (request.currency !== "INR" || request.priceMinor < 100)
    throw new ApiError(
      400,
      "Online payments require an INR package of at least INR 1.",
    );
  let payment;
  try {
    payment = await Payment.findOneAndUpdate(
      { requestId: request._id },
      {
        $setOnInsert: {
          requestId: request._id,
          customerId,
          providerId: request.providerId,
          amount: request.priceMinor,
          currency: request.currency,
          title: request.titleSnapshot,
          mode: settings.mode,
        },
      },
      { upsert: true, new: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    payment = await Payment.findOne({ requestId: request._id });
  }
  if (payment.status === "paid") return { alreadyPaid: true, payment };
  if (payment.mode !== settings.mode)
    throw new ApiError(
      409,
      "This request has an order in a different payment mode. Contact the platform admin before continuing.",
    );
  if (payment.orderId) return checkoutData(payment);
  if (
    payment.status === "reconcile_required" ||
    (payment.orderAttemptedAt &&
      (!payment.createLeaseUntil || payment.createLeaseUntil < new Date()))
  )
    throw new ApiError(
      409,
      "The previous order is being reconciled. Contact the platform admin before retrying.",
    );
  const claimed = await Payment.findOneAndUpdate(
    {
      _id: payment._id,
      orderId: { $exists: false },
      orderAttemptedAt: { $exists: false },
    },
    {
      $set: {
        orderAttemptedAt: new Date(),
        createLeaseUntil: new Date(Date.now() + 45000),
      },
    },
    { new: true },
  );
  if (!claimed)
    throw new ApiError(
      409,
      "Your payment order is being prepared. Please wait.",
    );
  try {
    const order = await gatewayRequest("/orders", {
      amount: payment.amount,
      currency: payment.currency,
      receipt: String(payment._id),
      partial_payment: false,
      notes: {
        paymentRecordId: String(payment._id),
        requestId: String(request._id),
      },
    });
    if (
      order.amount !== payment.amount ||
      order.currency !== payment.currency ||
      !/^order_[A-Za-z0-9]+$/.test(order.id)
    )
      throw Object.assign(
        new ApiError(502, "Payment order verification failed."),
        { uncertain: true },
      );
    payment = await Payment.findByIdAndUpdate(
      payment._id,
      { $set: { orderId: order.id }, $unset: { createLeaseUntil: 1 } },
      { new: true },
    );
    return checkoutData(payment);
  } catch (error) {
    await Payment.updateOne(
      { _id: payment._id },
      error.uncertain
        ? {
            $set: {
              status: "reconcile_required",
              lastError: "Order creation needs merchant reconciliation",
            },
            $unset: { createLeaseUntil: 1 },
          }
        : { $unset: { createLeaseUntil: 1, orderAttemptedAt: 1 } },
    );
    throw error;
  }
}
export function checkoutData(payment) {
  return {
    paymentRecordId: String(payment._id),
    keyId: process.env.RAZORPAY_KEY_ID,
    orderId: payment.orderId,
    amount: payment.amount,
    currency: payment.currency,
    title: payment.title,
    mode: payment.mode,
  };
}
export async function applyCapturedPayment(payment, gateway) {
  if (
    gateway.status !== "captured" ||
    gateway.order_id !== payment.orderId ||
    gateway.amount !== payment.amount ||
    gateway.currency !== payment.currency ||
    !/^pay_[A-Za-z0-9]+$/.test(gateway.id || "")
  )
    throw new ApiError(400, "The captured payment does not match this order.");
  if (payment.paymentId && payment.paymentId !== gateway.id)
    throw new ApiError(
      409,
      "A different payment is already recorded for this order",
    );
  await Payment.updateOne(
    { _id: payment._id },
    {
      $set: {
        status: "paid",
        paymentId: gateway.id,
        paidAt: payment.paidAt || new Date(),
        lastError: "",
      },
    },
  );
  if (payment.fulfilled) return Payment.findById(payment._id);
  const request = await MarketRequest.findById(payment.requestId);
  const listing = request
    ? await MarketListing.findById(request.listingId)
    : null;
  const provider = await User.findById(payment.providerId).select("roles");
  if (
    !request ||
    request.status !== "accepted" ||
    !listing ||
    listing.status !== "published" ||
    !provider ||
    !provider.roles.some((role) =>
      ["coach", "gym_owner", "admin"].includes(role),
    )
  ) {
    await Payment.updateOne(
      { _id: payment._id },
      { $set: { fulfillment: "needs_review" } },
    );
    const admins = await User.find({ roles: "admin" }).select("_id");
    await Promise.all(
      admins.map((admin) =>
        notifyUser(admin._id, `payment-review:${payment._id}`, {
          type: "marketplace",
          title: "A captured payment needs attention",
          body: "The offering or access changed before fulfilment. Review the merchant transaction.",
          href: "/marketplace/payments",
        }),
      ),
    );
    return Payment.findById(payment._id);
  }
  let fulfillment = "provider_delivery";
  if ((request.categorySnapshot || listing.category) === "coaching") {
    if (!provider.roles.includes("coach")) {
      await Payment.updateOne(
        { _id: payment._id },
        { $set: { fulfillment: "needs_review" } },
      );
      return Payment.findById(payment._id);
    }
    await CoachAthlete.init();
    await CoachAthlete.findOneAndUpdate(
      { coachId: payment.providerId, athleteId: payment.customerId },
      {
        $set: { status: "active" },
        $setOnInsert: {
          coachId: payment.providerId,
          athleteId: payment.customerId,
        },
      },
      { upsert: true },
    );
    fulfillment = "coaching_active";
  }
  await MarketRequest.updateOne(
    { _id: request._id },
    { $set: { paymentStatus: "paid", paymentRecordId: payment._id } },
  );
  await Payment.updateOne(
    { _id: payment._id },
    { $set: { fulfilled: true, fulfillment } },
  );
  await Promise.all([
    notifyUser(payment.customerId, `payment-paid:${payment._id}`, {
      type: "marketplace",
      title:
        payment.mode === "test"
          ? "Test payment confirmed"
          : "Payment confirmed",
      body:
        fulfillment === "coaching_active"
          ? "Your coaching relationship is active. Your coach can now assign sessions."
          : "Your provider has been notified to arrange delivery.",
      href: "/marketplace/requests",
    }),
    notifyUser(payment.providerId, `payment-paid:${payment._id}`, {
      type: "marketplace",
      title: "A package payment was confirmed",
      body: `${payment.title}: ${payment.mode === "test" ? "test " : ""}payment captured. Arrange the next step with your athlete.`,
      href: "/marketplace/requests?view=provider",
    }),
  ]);
  return Payment.findById(payment._id);
}
export async function verifyCheckout(customerId, body) {
  const payment = await Payment.findOne({
    requestId: body.requestId,
    customerId,
  });
  if (!payment || payment.orderId !== body.razorpay_order_id)
    throw new ApiError(404, "Payment order not found");
  if (
    !validSignature(
      `${payment.orderId}|${body.razorpay_payment_id}`,
      body.razorpay_signature,
      process.env.RAZORPAY_KEY_SECRET,
    )
  )
    throw new ApiError(400, "Payment signature could not be verified");
  const gateway = await gatewayRequest(
    `/payments/${encodeURIComponent(body.razorpay_payment_id)}`,
  );
  if (
    gateway.order_id !== payment.orderId ||
    gateway.amount !== payment.amount ||
    gateway.currency !== payment.currency
  )
    throw new ApiError(400, "Payment details do not match the order");
  if (gateway.status === "captured")
    return {
      status: "paid",
      payment: await applyCapturedPayment(payment, gateway),
    };
  if (gateway.status === "authorized")
    return {
      status: "processing",
      message: "Payment is authorised. Waiting for capture confirmation.",
    };
  throw new ApiError(
    409,
    "Payment has not been captured. You can retry checkout.",
  );
}
