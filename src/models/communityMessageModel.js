import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityThread', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

schema.index({ threadId: 1, createdAt: 1 });

export const CommunityMessage = mongoose.model('CommunityMessage', schema);
