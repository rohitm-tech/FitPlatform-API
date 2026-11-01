import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

schema.index({ postId: 1, userId: 1 }, { unique: true });

export const CommunityLike = mongoose.model('CommunityLike', schema);
