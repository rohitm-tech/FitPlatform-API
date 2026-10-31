import mongoose from 'mongoose';

const workoutItemSchema = new mongoose.Schema(
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
    items: { type: [workoutItemSchema], default: [] },
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
