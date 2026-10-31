import mongoose from 'mongoose';

const templateItemSchema = new mongoose.Schema(
  {
    exerciseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exercise',
      required: true,
    },
    sets: { type: Number, required: true },
    reps: { type: Number, required: true },
    targetWeightKg: { type: Number, default: null },
    restSec: { type: Number, default: 60 },
    notes: { type: String, default: '' },
  },
  { _id: false },
);

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
    items: { type: [templateItemSchema], default: [] },
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
