import mongoose from 'mongoose';

const coachAthleteSchema = new mongoose.Schema(
  {
    coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['invited', 'active', 'ended'],
      default: 'invited',
    },
    startedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

coachAthleteSchema.index({ coachId: 1, athleteId: 1 }, { unique: true });
coachAthleteSchema.index({ athleteId: 1, status: 1 });

export const CoachAthlete = mongoose.model('CoachAthlete', coachAthleteSchema);
