import mongoose from 'mongoose';
import { SPORTS } from '../constants/sports.js';
import { sessionItemSchema } from './sessionItemSchema.js';

const workoutSchema = new mongoose.Schema(
  {
    athleteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedBy: { type: String, default: 'ai' }, // userId string or "ai"
    date: { type: Date, required: true },
    title: { type: String, required: true },
    sport: { type: String, enum: SPORTS, default: 'Strength' },
    items: { type: [sessionItemSchema()], default: [] },
    status: {
      type: String,
      enum: ['planned', 'completed', 'skipped'],
      default: 'planned',
    },
  },
  { timestamps: true },
);

workoutSchema.index({ athleteId: 1, date: 1 });

export const Workout = mongoose.model('Workout', workoutSchema);
