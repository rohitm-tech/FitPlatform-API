import mongoose from 'mongoose';

const muscleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, required: true },
    group: {
      type: String,
      enum: ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'],
      required: true,
    },
    description: { type: String, default: '' },
    meshNames: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const Muscle = mongoose.model('Muscle', muscleSchema);
