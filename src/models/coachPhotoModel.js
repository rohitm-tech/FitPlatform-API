import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    athleteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    mimeType: {
      type: String,
      enum: ['image/jpeg', 'image/png', 'image/webp'],
      required: true,
    },
    data: { type: Buffer, required: true, select: false },
    caption: { type: String, maxlength: 2000 },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
schema.index({ athleteId: 1, createdAt: -1 });
export const CoachPhoto = mongoose.model('CoachPhoto', schema);
