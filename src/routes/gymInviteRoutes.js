import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { GymInvite } from "../models/gymInviteModel.js";
import { Gym } from "../models/gymModel.js";
import { User } from "../models/userModel.js";
import { GymMembership } from "../models/gymMembershipModel.js";
import { verifyJWT } from "../middlewares/authMiddleware.js";
import { requireRole } from "../middlewares/roleMiddleware.js";
import { validateBody } from "../validations/schemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { config } from "../config/env.js";
const r = Router();
r.use(verifyJWT);
r.post(
  "/",
  requireRole("gym_owner"),
  validateBody(
    z.object({
      email: z.string().trim().email(),
      role: z.enum(["athlete", "coach"]),
    }),
  ),
  asyncHandler(async (req, res) => {
    const gym = await Gym.findOne({ ownerId: req.user._id });
    if (!gym) throw new ApiError(404, "Gym not found");
    const token = crypto.randomBytes(24).toString("hex");
    await GymInvite.create({
      gymId: gym._id,
      email: req.body.email.toLowerCase(),
      role: req.body.role,
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 7 * 864e5),
    });
    res
      .status(201)
      .json(
        new ApiResponse(
          201,
          { url: `${config.FRONTEND_URL}/join-gym?token=${token}` },
          "Share this invitation with the member. Expires in 7 days.",
        ),
      );
  }),
);
r.post(
  "/accept",
  validateBody(z.object({ token: z.string().length(48) })),
  asyncHandler(async (req, res) => {
    const invite = await GymInvite.findOne({
      tokenHash: crypto
        .createHash("sha256")
        .update(req.body.token)
        .digest("hex"),
      email: req.user.email,
      expiresAt: { $gt: new Date() },
    });
    if (!invite)
      throw new ApiError(404, "Invitation expired or belongs to another email");
    if (invite.role === "coach" && !req.user.roles.includes("coach"))
      throw new ApiError(
        403,
        "A platform admin must approve coach access first",
      );
    if (req.user.gymId && String(req.user.gymId) !== String(invite.gymId))
      throw new ApiError(409, "Leave your current gym before joining another");
    await User.findByIdAndUpdate(req.user._id, {
      $set: { gymId: invite.gymId },
    });
    if (invite.role === "athlete")
      await GymMembership.findOneAndUpdate(
        { gymId: invite.gymId, userId: req.user._id },
        { $set: { status: "active", startDate: new Date() } },
        { upsert: true },
      );
    await GymInvite.deleteOne({ _id: invite._id });
    res.json(new ApiResponse(200, null, "Gym invitation accepted"));
  }),
);
export default r;
