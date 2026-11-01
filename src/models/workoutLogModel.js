import mongoose from 'mongoose';

const setLogSchema = new mongoose.Schema(
  {
    reps: { type: Number, default: 0 },
    weightKg: { type: Number, default: 0 },
    distanceM: { type: Number, default: null },
    durationSec: { type: Number, default: null },
  },
  { _id: false }
);

const workoutLogItemSchema = new mongoose.Schema(
  {
    exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exercise' },
    label: { type: String, trim: true, maxlength: 80, default: '' },
    kind: { type: String, default: '' },
    sets: { type: [setLogSchema], default: [] },
  },
  { _id: false }
);

const workoutLogSchema = new mongoose.Schema(
  {
    athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout', default: null },
    date: { type: Date, required: true },
    items: { type: [workoutLogItemSchema], default: [] },
    durationMin: { type: Number, default: 0 },
    perceivedEffort: { type: Number, min: 1, max: 10, default: null },
    painFlag: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    source: { type: String, enum: ['app', 'kiosk'], default: 'app' },
  },
  { timestamps: true }
);

workoutLogSchema.index({ athleteId: 1, date: 1 });

export const WorkoutLog = mongoose.model('WorkoutLog', workoutLogSchema);
