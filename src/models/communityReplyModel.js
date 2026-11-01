import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

schema.index({ postId: 1, createdAt: 1 });

export const CommunityReply = mongoose.model('CommunityReply', schema);
