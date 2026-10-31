import mongoose from 'mongoose';

const exerciseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    primaryMuscles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Muscle' }],
    secondaryMuscles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Muscle' }],
    equipment: { type: [String], default: [] },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    instructions: { type: [String], default: [] },
    videoUrl: { type: String, default: null },
    type: {
      type: String,
      enum: ['strength', 'cardio', 'mobility'],
      default: 'strength',
    },
  },
  { timestamps: true }
);

exerciseSchema.index({ primaryMuscles: 1 });
exerciseSchema.index({ name: 'text' });

export const Exercise = mongoose.model('Exercise', exerciseSchema);
