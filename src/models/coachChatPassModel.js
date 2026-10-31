import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: ['included', 'paid'], required: true },
    amountMinor: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

schema.index({ athleteId: 1, coachId: 1 }, { unique: true });

export const CoachChatPass = mongoose.model('CoachChatPass', schema);
