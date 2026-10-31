import mongoose from 'mongoose';

const checkInSchema = new mongoose.Schema(
  {
    athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
    timestamp: { type: Date, default: Date.now },
    source: { type: String, enum: ['kiosk', 'app'], default: 'app' },
  },
  { timestamps: true }
);

checkInSchema.index({ gymId: 1, timestamp: 1 });
checkInSchema.index({ athleteId: 1, timestamp: 1 });

export const CheckIn = mongoose.model('CheckIn', checkInSchema);
