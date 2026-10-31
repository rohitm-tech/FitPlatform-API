import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    gymId: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true },
    email: { type: String, required: true },
    role: { type: String, enum: ["athlete", "coach"], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const GymInvite = mongoose.model("GymInvite", schema);
