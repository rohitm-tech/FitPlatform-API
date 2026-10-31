import { Router } from "express";
import { z } from "zod";
import { verifyJWT } from "../middlewares/authMiddleware.js";
import { validateBody } from "../validations/schemas.js";
import { CoachAthlete } from "../models/coachAthleteModel.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
const r = Router();
r.use(verifyJWT);
r.get(
  "/invitations",
  asyncHandler(async (req, res) =>
    res.json(
      new ApiResponse(
        200,
        await CoachAthlete.find({
          athleteId: req.user._id,
          status: "invited",
        }).populate("coachId", "name email"),
        "Invitations fetched",
      ),
    ),
  ),
);
r.patch(
  "/invitations/:id",
  validateBody(z.object({ accept: z.boolean() })),
  asyncHandler(async (req, res) => {
    const link = await CoachAthlete.findOne({
      _id: req.params.id,
      athleteId: req.user._id,
      status: "invited",
    });
    if (!link) throw new ApiError(404, "Invitation not found");
    link.status = req.body.accept ? "active" : "ended";
    await link.save();
    res.json(new ApiResponse(200, link, "Invitation updated"));
  }),
);
export default r;
