import mongoose from 'mongoose';
import { SPORTS } from '../constants/sports.js';

const followUpSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 500 },
    sentAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const coachAthleteSchema = new mongoose.Schema(
  {
    coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['invited', 'active', 'ended'],
      default: 'invited',
    },
    // One coaching relationship is for one sport. Sessions assigned on it use that sport's measurements.
    sport: { type: String, enum: SPORTS, default: 'Strength' },
    startedAt: { type: Date, default: Date.now },
    offer: { type: String, trim: true, maxlength: 500, default: '' },
    followUps: { type: [followUpSchema], default: [] },
  },
  { timestamps: true }
);

coachAthleteSchema.index({ coachId: 1, athleteId: 1 }, { unique: true });
coachAthleteSchema.index({ athleteId: 1, status: 1 });

export const CoachAthlete = mongoose.model('CoachAthlete', coachAthleteSchema);
