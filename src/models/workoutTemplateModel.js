import mongoose from 'mongoose';
import { SPORTS } from '../constants/sports.js';
import { sessionItemSchema } from './sessionItemSchema.js';

const workoutTemplateSchema = new mongoose.Schema(
  {
    sourceReviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TrainingReview',
    },
    draftDay: { type: Number, min: 0, max: 6 },
    coachId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: { type: String, required: true },
    sport: { type: String, enum: SPORTS, default: 'Strength' },
    items: { type: [sessionItemSchema()], default: [] },
  },
  { timestamps: true },
);

workoutTemplateSchema.index({ coachId: 1 });

workoutTemplateSchema.index(
  { sourceReviewId: 1, draftDay: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceReviewId: { $exists: true } },
  },
);
export const WorkoutTemplate = mongoose.model(
  'WorkoutTemplate',
  workoutTemplateSchema,
);
