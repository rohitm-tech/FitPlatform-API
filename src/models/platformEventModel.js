import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    summary: { type: String, required: true, trim: true, maxlength: 2000 },
    place: { type: String, required: true, trim: true, maxlength: 160 },
    images: {
      type: [
        {
          filename: { type: String, required: true },
          mimeType: { type: String, required: true },
          credit: { type: String, default: '', maxlength: 240 },
        },
      ],
      default: [],
    },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    capacity: { type: Number, required: true, min: 1, max: 10000 },
    fullPriceMinor: { type: Number, required: true, min: 0 },
    premiumPriceMinor: { type: Number, required: true, min: 0 },
    publicOpensAt: { type: Date, required: true },
    status: { type: String, enum: ['draft', 'published', 'cancelled'], default: 'draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

schema.index({ status: 1, startsAt: 1 });

export const PlatformEvent = mongoose.model('PlatformEvent', schema);
