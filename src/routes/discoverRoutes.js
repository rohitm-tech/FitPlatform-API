import { Router } from "express";
import { z } from "zod";
import { CoachProfile } from "../models/coachProfileModel.js";
import { MarketListing } from "../models/marketplaceModel.js";
import { Place } from "../models/placeModel.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import {
  BENGALURU,
  KINDS,
  SPORTS,
  assembleDiscover,
} from "../services/discoverService.js";
import { locationDirectory, nearestCity } from "../constants/locations.js";

const r = Router();
const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(50).default(8),
  kind: z.enum(KINDS).default("coach"),
  sport: z.enum(["all", ...SPORTS]).default("all"),
  q: z.string().max(80).optional().default(""),
  origin: z.enum(["device", "demo", "profile"]).optional(),
  label: z.string().trim().max(60).optional(),
  accepting: z.enum(["true", "false"]).optional(),
});

r.get("/locations", (req, res) => {
  res.json(
    new ApiResponse(
      200,
      { cities: locationDirectory(), sports: SPORTS },
      "Catalogue cities",
    ),
  );
});

r.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success)
      throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid search");
    const input = parsed.data;
    const hasPoint = input.lat != null && input.lng != null;
    const source =
      hasPoint && (input.origin === "device" || input.origin === "profile")
        ? input.origin
        : "demo";
    const origin = {
      lat: hasPoint ? input.lat : BENGALURU.lat,
      lng: hasPoint ? input.lng : BENGALURU.lng,
      label:
        source === "device"
          ? "you"
          : source === "profile"
            ? input.label || "your area"
            : BENGALURU.label,
      source,
    };

    const profiles = await CoachProfile.find({ isPublic: true })
      .populate({ path: "coachId", match: { roles: "coach" }, select: "name" })
      .lean();
    const visible = profiles.filter((profile) => profile.coachId);
    const packages = await MarketListing.find({
      providerId: { $in: visible.map((profile) => profile.coachId._id) },
      category: "coaching",
      status: "published",
    })
      .select("providerId priceMinor currency billing category")
      .lean();
    const coaches = visible.map((profile) => ({
      ...profile,
      packages: packages.filter(
        (item) => String(item.providerId) === String(profile.coachId._id),
      ),
    }));
    const places = await Place.find().lean();
    const discovered = assembleDiscover({
      coaches,
      places,
      origin,
      radiusKm: input.radiusKm,
      kind: input.kind,
      sport: input.sport,
      q: input.q,
      acceptingOnly: input.accepting === "true",
    });
    res.json(
      new ApiResponse(
        200,
        {
          origin,
          radiusKm: input.radiusKm,
          kind: input.kind,
          sport: input.sport,
          catalogueCity: nearestCity(origin.lat, origin.lng) || BENGALURU.label,
          ...discovered,
        },
        "Training near you",
      ),
    );
  }),
);

export default r;
