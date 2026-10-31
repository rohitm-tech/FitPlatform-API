import mongoose from 'mongoose';

const templateItemSchema = new mongoose.Schema(
  {
    exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exercise', required: true },
    sets: { type: Number, required: true },
    reps: { type: Number, required: true },
    targetWeightKg: { type: Number, default: null },
    restSec: { type: Number, default: 60 },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

const workoutTemplateSchema = new mongoose.Schema(
  {
    coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    items: { type: [templateItemSchema], default: [] },
  },
  { timestamps: true }
);

workoutTemplateSchema.index({ coachId: 1 });

export const WorkoutTemplate = mongoose.model('WorkoutTemplate', workoutTemplateSchema);
