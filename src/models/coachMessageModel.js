import mongoose from 'mongoose';

// One thread per coach–athlete pair; access is re-checked against an active
// CoachAthlete link on every read and write.
const coachMessageSchema = new mongoose.Schema(
  {
    coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

coachMessageSchema.index({ coachId: 1, athleteId: 1, createdAt: -1 });

export const CoachMessage = mongoose.model('CoachMessage', coachMessageSchema);
