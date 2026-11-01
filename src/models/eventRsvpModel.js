import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformEvent', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['going', 'cancelled'], default: 'going' },
    priceMinor: { type: Number, required: true, min: 0 },
    planAtSignup: { type: String, enum: ['free', 'premium'], required: true },
  },
  { timestamps: true },
);

schema.index({ eventId: 1, userId: 1 }, { unique: true });
schema.index({ eventId: 1, status: 1 });

export const EventRsvp = mongoose.model('EventRsvp', schema);
