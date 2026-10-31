import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: [
        'athlete_premium',
        'coach_chat',
        'coach_invite',
        'coach_fee',
        'gym_install',
        'marketplace_fee',
        'coach_earning',
      ],
      required: true,
    },
    amountMinor: { type: Number, required: true, min: 0 },
    grossMinor: { type: Number, default: 0, min: 0 },
    feeMinor: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
    athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', default: null },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    title: { type: String, default: '' },
    demo: { type: Boolean, default: false },
    recordedAt: { type: Date, default: Date.now },
    dedupeKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true },
);

schema.index({ kind: 1, recordedAt: -1 });
schema.index({ coachId: 1, kind: 1 });

export const LedgerEntry = mongoose.model('LedgerEntry', schema);
