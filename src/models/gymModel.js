import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const kioskDeviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true },
    pairingCodeHash: { type: String, default: null },
    pairingExpiresAt: { type: Date, default: null },
    name: { type: String, default: 'Kiosk' },
    lastSeenAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { _id: false }
);

const gymSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    logoUrl: { type: String, default: null },
    kioskDevices: { type: [kioskDeviceSchema], default: [] },
  },
  { timestamps: true }
);

gymSchema.index({ ownerId: 1 });

gymSchema.methods.hashDeviceToken = async (token) => bcrypt.hash(token, 10);
gymSchema.methods.verifyDeviceToken = async (token, tokenHash) => bcrypt.compare(token, tokenHash);

export const Gym = mongoose.model('Gym', gymSchema);
