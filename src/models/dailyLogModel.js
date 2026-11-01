import mongoose from 'mongoose';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

const foodSchema = new mongoose.Schema(
  {
    meal: { type: String, enum: MEALS, required: true },
    name: { type: String, trim: true, maxlength: 120, required: true },
    quantity: { type: String, trim: true, maxlength: 80, default: '' },
    calories: { type: Number, min: 0, max: 10000, default: null },
    estimated: { type: Boolean, default: false },
    proteinG: { type: Number, min: 0, max: 1000, default: null },
    carbsG: { type: Number, min: 0, max: 2000, default: null },
    fatG: { type: Number, min: 0, max: 1000, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const dailyLogSchema = new mongoose.Schema(
  {
    athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    foods: { type: [foodSchema], default: [] },
    waterMl: { type: Number, min: 0, max: 15000, default: 0 },
    weightKg: { type: Number, min: 20, max: 400, default: null },
    mood: { type: Number, min: 1, max: 5, default: null },
    energy: { type: Number, min: 1, max: 5, default: null },
    stress: { type: Number, min: 1, max: 5, default: null },
    note: { type: String, maxlength: 500, default: '' },
  },
  { timestamps: true },
);

dailyLogSchema.index({ athleteId: 1, date: 1 }, { unique: true });

export const DailyLog = mongoose.model('DailyLog', dailyLogSchema);
