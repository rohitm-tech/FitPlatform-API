import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Place } from "../models/placeModel.js";
import { PlaceEnquiry } from "../models/placeEnquiryModel.js";
import { verifyJWT } from "../middlewares/authMiddleware.js";
import { validateBody } from "../validations/schemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";

const r = Router();

const todayInBengaluru = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );

r.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id))
      throw new ApiError(404, "Place not found");
    const place = await Place.findById(req.params.id).lean();
    if (!place) throw new ApiError(404, "Place not found");
    const [lng, lat] = place.point.coordinates;
    res.json(
      new ApiResponse(
        200,
        {
          ...place,
          lat,
          lng,
          priceUnit: place.priceMinor === 0 ? "none" : place.priceUnit,
        },
        "Place",
      ),
    );
  }),
);

r.post(
  "/:id/enquiries",
  verifyJWT,
  validateBody(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
      startTime: z.string().regex(/^\d{2}:\d{2}$/, "Choose a start time"),
      note: z.string().trim().max(500).optional().default(""),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id))
      throw new ApiError(404, "Place not found");
    const place = await Place.findById(req.params.id).lean();
    if (!place) throw new ApiError(404, "Place not found");
    if (req.body.date < todayInBengaluru())
      throw new ApiError(400, "Choose today or a later date.");
    const enquiry = await PlaceEnquiry.create({
      placeId: place._id,
      userId: req.user._id,
      date: req.body.date,
      startTime: req.body.startTime,
      note: req.body.note,
      priceMinor: place.priceMinor,
      currency: place.currency,
      isDemo: place.isDemo,
    });
    res.status(201).json(
      new ApiResponse(
        201,
        enquiry,
        "Request saved. The venue still has to confirm the slot.",
      ),
    );
  }),
);

export default r;
