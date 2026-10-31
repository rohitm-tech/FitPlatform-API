import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    placeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Place",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    note: { type: String, maxlength: 500, default: "" },
    status: { type: String, enum: ["requested"], default: "requested" },
    priceMinor: Number,
    currency: { type: String, default: "INR" },
    isDemo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

schema.index({ userId: 1, createdAt: -1 });
export const PlaceEnquiry = mongoose.model("PlaceEnquiry", schema);
