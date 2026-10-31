import mongoose from 'mongoose';

const kioskSessionSchema = new mongoose.Schema(
  {
    gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
    deviceId: { type: String, required: true },
    athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

kioskSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const KioskSession = mongoose.model('KioskSession', kioskSessionSchema);
