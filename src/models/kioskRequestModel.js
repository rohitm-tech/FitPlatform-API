import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    gymId: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true },
    deviceId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "KioskSession" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const KioskRequest = mongoose.model("KioskRequest", schema);
