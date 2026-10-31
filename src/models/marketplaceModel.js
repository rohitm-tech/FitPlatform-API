import mongoose from "mongoose";
const listingSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    slug: { type: String, unique: true, required: true },
    title: { type: String, required: true, maxlength: 100 },
    category: {
      type: String,
      enum: ["plan", "coaching", "meal", "supplement", "gear"],
      required: true,
    },
    summary: { type: String, required: true, maxlength: 220 },
    description: { type: String, required: true, maxlength: 4000 },
    features: [String],
    priceMinor: { type: Number, min: 0, required: true },
    currency: { type: String, enum: ["INR", "USD"], default: "INR" },
    billing: { type: String, enum: ["once", "month"], default: "once" },
    duration: { type: String, maxlength: 80 },
    status: {
      type: String,
      enum: ["draft", "pending", "published"],
      default: "draft",
    },
    reviewNote: { type: String, maxlength: 1000 },
    sellerLicenceRef: { type: String, maxlength: 160 },
    licenceReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    licenceReviewedAt: Date,
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
listingSchema.index({ status: 1, category: 1, createdAt: -1 });
export const MarketListing = mongoose.model("MarketListing", listingSchema);
const requestSchema = new mongoose.Schema(
  {
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MarketListing",
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: { type: String, maxlength: 2000 },
    status: {
      type: String,
      enum: ["requested", "accepted", "declined", "cancelled"],
      default: "requested",
    },
    titleSnapshot: String,
    categorySnapshot: String,
    billingSnapshot: String,
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
    },
    paymentRecordId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    priceMinor: Number,
    currency: String,
    isDemo: Boolean,
    responseNote: { type: String, maxlength: 1500 },
  },
  { timestamps: true },
);
requestSchema.index({ customerId: 1, createdAt: -1 });
requestSchema.index({ providerId: 1, createdAt: -1 });
requestSchema.index(
  { listingId: 1, customerId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "requested" } },
);
export const MarketRequest = mongoose.model("MarketRequest", requestSchema);
const savedSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MarketListing",
      required: true,
    },
  },
  { timestamps: true },
);
savedSchema.index({ userId: 1, listingId: 1 }, { unique: true });
export const MarketSaved = mongoose.model("MarketSaved", savedSchema);
