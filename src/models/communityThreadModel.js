import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    participantIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length === 2,
        message: 'A conversation is between two athletes',
      },
    },
    participantKey: { type: String, required: true, unique: true },
    lastMessageAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

schema.index({ participantIds: 1, lastMessageAt: -1 });

export const CommunityThread = mongoose.model('CommunityThread', schema);
