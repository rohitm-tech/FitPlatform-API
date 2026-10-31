import { Router } from "express";
import mongoose from "mongoose";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import QRCode from "qrcode";
import { z } from "zod";
import { Gym } from "../models/gymModel.js";
import { GymMembership } from "../models/gymMembershipModel.js";
import { KioskRequest } from "../models/kioskRequestModel.js";
import { KioskSession } from "../models/kioskSessionModel.js";
import { CheckIn } from "../models/checkInModel.js";
import { verifyJWT } from "../middlewares/authMiddleware.js";
import { authRateLimiter } from "../middlewares/rateLimitMiddleware.js";
import { validateBody } from "../validations/schemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { config } from "../config/env.js";
const r = Router();
const deviceSchema = z.object({
  gymId: z.string().regex(/^[a-f0-9]{24}$/i),
  deviceId: z.string(),
  deviceToken: z.string().min(20),
});
async function device(body) {
  const gym = await Gym.findById(body.gymId);
  const d = gym?.kioskDevices.find(
    (d) => d.deviceId === body.deviceId && !d.revokedAt,
  );
  if (!d || !(await bcrypt.compare(body.deviceToken, d.tokenHash)))
    throw new ApiError(401, "Device authentication failed");
  return gym;
}
r.post(
  "/request",
  authRateLimiter,
  validateBody(deviceSchema),
  asyncHandler(async (req, res) => {
    await device(req.body);
    const token = crypto.randomBytes(24).toString("hex");
    const request = await KioskRequest.create({
      gymId: req.body.gymId,
      deviceId: req.body.deviceId,
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 120000),
    });
    const url = `${config.FRONTEND_URL}/kiosk-approve/${request._id}?token=${token}`;
    res.json(
      new ApiResponse(
        201,
        {
          requestId: request._id,
          qr: await QRCode.toDataURL(url),
          expiresAt: request.expiresAt,
        },
        "Scan with your phone",
      ),
    );
  }),
);
r.post(
  "/status/:id",
  validateBody(deviceSchema),
  asyncHandler(async (req, res) => {
    await device(req.body);
    const request = await KioskRequest.findOne({
      _id: req.params.id,
      gymId: req.body.gymId,
      deviceId: req.body.deviceId,
      expiresAt: { $gt: new Date() },
    }).populate({
      path: "sessionId",
      populate: { path: "athleteId", select: "name" },
    });
    if (!request) throw new ApiError(410, "QR code expired");
    const s = request.sessionId;
    res.json(
      new ApiResponse(
        200,
        s
          ? { sessionId: s._id, athlete: s.athleteId, expiresAt: s.expiresAt }
          : null,
        "Session status",
      ),
    );
  }),
);
r.post(
  "/approve/:id",
  verifyJWT,
  validateBody(z.object({ token: z.string().length(48) })),
  asyncHandler(async (req, res) => {
    const request = await KioskRequest.findOne({
      _id: req.params.id,
      tokenHash: crypto
        .createHash("sha256")
        .update(req.body.token)
        .digest("hex"),
      expiresAt: { $gt: new Date() },
    });
    if (!request || request.sessionId)
      throw new ApiError(410, "QR code expired or already used");
    const gym = await Gym.findById(request.gymId);
    if (
      !gym?.kioskDevices.some(
        (d) => d.deviceId === request.deviceId && !d.revokedAt,
      )
    )
      throw new ApiError(401, "Device revoked");
    const membership = await GymMembership.exists({
      gymId: request.gymId,
      userId: req.user._id,
      status: "active",
    });
    if (!membership)
      throw new ApiError(403, "An active gym membership is required");
    const claimed = await KioskRequest.findOneAndUpdate(
      { _id: request._id, sessionId: { $exists: false } },
      { $set: { sessionId: new mongoose.Types.ObjectId() } },
      { new: true },
    );
    if (!claimed) throw new ApiError(409, "QR code already used");
    await KioskSession.create({
      _id: claimed.sessionId,
      gymId: request.gymId,
      deviceId: request.deviceId,
      athleteId: req.user._id,
      expiresAt: new Date(Date.now() + 90000),
    });
    await CheckIn.create({
      gymId: request.gymId,
      athleteId: req.user._id,
      source: "kiosk",
    });
    res.json(
      new ApiResponse(200, null, "Check-in approved. Continue on the kiosk."),
    );
  }),
);
export default r;
