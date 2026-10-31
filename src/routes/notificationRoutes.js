import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { verifyJWT } from "../middlewares/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { Notification } from "../models/notificationModel.js";
import { validateBody } from "../validations/schemas.js";
import { syncNotifications } from "../services/notificationService.js";
const r = Router();
r.use(verifyJWT);
r.get(
  "/",
  asyncHandler(async (req, res) => {
    await syncNotifications(req.user);
    const query = { recipientId: req.user._id };
    if (req.query.unread === "true") query.readAt = null;
    if (req.query.before) {
      if (!mongoose.isValidObjectId(req.query.before))
        throw new ApiError(400, "Invalid notification cursor");
      query._id = { $lt: req.query.before };
    }
    const [items, unreadCount] = await Promise.all([
      Notification.find(query).sort({ _id: -1 }).limit(21).lean(),
      Notification.countDocuments({ recipientId: req.user._id, readAt: null }),
    ]);
    const more = items.length > 20;
    const visible = items.slice(0, 20);
    res.json(
      new ApiResponse(
        200,
        {
          items: visible,
          unreadCount,
          nextCursor: more ? String(visible.at(-1)._id) : null,
        },
        "Notifications loaded",
      ),
    );
  }),
);
r.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    await Notification.updateMany(
      { recipientId: req.user._id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    res.json(new ApiResponse(200, null, "All notifications marked as read"));
  }),
);
r.patch(
  "/:id",
  validateBody(z.object({ read: z.boolean() })),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id))
      throw new ApiError(404, "Notification not found");
    const item = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user._id },
      { $set: { readAt: req.body.read ? new Date() : null } },
      { new: true },
    );
    if (!item) throw new ApiError(404, "Notification not found");
    res.json(new ApiResponse(200, item, "Notification updated"));
  }),
);
export default r;
