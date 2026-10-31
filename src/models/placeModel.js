import mongoose from "mongoose";
import { PLACE_KINDS, PRICE_UNITS, SPORTS } from "../constants/sports.js";

const schema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true, maxlength: 80 },
    kind: {
      type: String,
      enum: PLACE_KINDS,
      required: true,
    },
    sport: {
      type: String,
      enum: SPORTS,
      required: true,
    },
    area: { type: String, required: true, maxlength: 80 },
    address: { type: String, required: true, maxlength: 160 },
    city: { type: String, default: "Bengaluru", maxlength: 60 },
    point: {
      type: { type: String, enum: ["Point"], required: true },
      coordinates: { type: [Number], required: true },
    },
    priceMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ["INR"], default: "INR" },
    priceUnit: {
      type: String,
      enum: PRICE_UNITS,
      required: true,
    },
    hours: { type: String, maxlength: 80, default: "" },
    surface: { type: String, maxlength: 80, default: "" },
    notes: { type: String, maxlength: 500, default: "" },
    isDemo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

schema.index({ point: "2dsphere" });
schema.index({ kind: 1, sport: 1 });

export const Place = mongoose.model("Place", schema);
