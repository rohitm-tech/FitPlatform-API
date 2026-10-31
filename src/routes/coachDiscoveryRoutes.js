import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { CoachProfile } from "../models/coachProfileModel.js";
import { User } from "../models/userModel.js";
import { MarketListing } from "../models/marketplaceModel.js";
import { verifyJWT } from "../middlewares/authMiddleware.js";
import { requireRole } from "../middlewares/roleMiddleware.js";
import { validateBody } from "../validations/schemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { SPORTS } from "../constants/sports.js";
import { findCity, nearestCity } from "../constants/locations.js";
const r = Router();
r.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = { isPublic: true };
    if (req.query.specialty)
      query.specialties = String(req.query.specialty).slice(0, 80);
    if (req.query.available === "true") query.acceptingAthletes = true;
    const profiles = await CoachProfile.find(query)
      .populate({ path: "coachId", match: { roles: "coach" }, select: "name" })
      .sort({ updatedAt: -1 })
      .lean();
    const q = String(req.query.q || "")
      .trim()
      .toLowerCase();
    const visible = profiles.filter(
      (p) =>
        p.coachId &&
        (!q ||
          `${p.coachId.name} ${p.headline} ${p.location} ${p.specialties.join(" ")}`
            .toLowerCase()
            .includes(q)),
    );
    const packages = await MarketListing.find({
      providerId: { $in: visible.map((p) => p.coachId._id) },
      category: "coaching",
      status: "published",
    })
      .select("providerId priceMinor currency slug title billing duration")
      .lean();
    res.json(
      new ApiResponse(
        200,
        visible.map((profile) => ({
          ...profile,
          packages: packages.filter(
            (p) => String(p.providerId) === String(profile.coachId._id),
          ),
        })),
        "Coach directory",
      ),
    );
  }),
);
r.get(
  "/me",
  verifyJWT,
  requireRole("coach"),
  asyncHandler(async (req, res) =>
    res.json(
      new ApiResponse(
        200,
        await CoachProfile.findOne({ coachId: req.user._id }).lean(),
        "Your coach profile",
      ),
    ),
  ),
);
r.put(
  "/me",
  verifyJWT,
  requireRole("coach"),
  validateBody(
    z.object({
      headline: z.string().trim().min(5).max(120),
      bio: z.string().trim().min(20).max(3000),
      specialties: z.array(z.string().trim().min(1).max(60)).min(1).max(8),
      location: z.string().trim().max(100).default(""),
      languages: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
      experienceYears: z.number().int().min(0).max(60).optional(),
      remoteAvailable: z.boolean(),
      acceptingAthletes: z.boolean(),
      isPublic: z.boolean(),
      sport: z.enum(SPORTS).optional(),
      latitude: z.number().min(-90).max(90).nullable().optional(),
      longitude: z.number().min(-180).max(180).nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { latitude, longitude, ...fields } = req.body;
    const update = { ...fields };
    const unset = {};
    if (latitude != null && longitude != null) {
      update.point = { type: "Point", coordinates: [longitude, latitude] };
    } else if (latitude === null && longitude === null) {
      unset.point = "";
    }
    update.city =
      (latitude != null && longitude != null
        ? nearestCity(latitude, longitude)
        : null) ||
      findCity(fields.location)?.name ||
      "";
    const profile = await CoachProfile.findOneAndUpdate(
      { coachId: req.user._id },
      {
        $set: update,
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      },
      { upsert: true, new: true, runValidators: true },
    );
    res.json(new ApiResponse(200, profile, "Coach profile saved"));
  }),
);
r.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id))
      throw new ApiError(404, "Coach not found");
    const coach = await User.findOne({
      _id: req.params.id,
      roles: "coach",
    }).select("name");
    const profile = await CoachProfile.findOne({
      coachId: req.params.id,
      isPublic: true,
    }).lean();
    if (!coach || !profile)
      throw new ApiError(404, "Coach profile is unavailable");
    const packages = await MarketListing.find({
      providerId: coach._id,
      status: "published",
      category: { $in: ["coaching", "plan"] },
    })
      .select("-sellerLicenceRef -reviewNote -licenceReviewedBy")
      .populate("providerId", "name")
      .lean();
    res.json(
      new ApiResponse(
        200,
        { ...profile, coachId: coach, packages },
        "Coach profile",
      ),
    );
  }),
);
export default r;
