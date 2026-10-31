import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MarketRequest",
      required: true,
      unique: true,
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
    amount: { type: Number, required: true, min: 100 },
    currency: { type: String, default: "INR" },
    title: String,
    mode: { type: String, enum: ["test", "live"], required: true },
    orderId: { type: String, unique: true, sparse: true },
    paymentId: { type: String, unique: true, sparse: true },
    status: {
      type: String,
      enum: ["created", "reconcile_required", "paid"],
      default: "created",
    },
    fulfillment: {
      type: String,
      enum: [
        "awaiting_payment",
        "coaching_active",
        "provider_delivery",
        "needs_review",
      ],
      default: "awaiting_payment",
    },
    fulfilled: { type: Boolean, default: false },
    supportMessage: String,
    supportRequestedAt: Date,
    createLeaseUntil: Date,
    orderAttemptedAt: Date,
    paidAt: Date,
    lastError: String,
    settlementStatus: {
      type: String,
      enum: ["merchant_managed"],
      default: "merchant_managed",
    },
  },
  { timestamps: true },
);
schema.index({ customerId: 1, createdAt: -1 });
schema.index({ providerId: 1, createdAt: -1 });
export const Payment = mongoose.model("Payment", schema);
