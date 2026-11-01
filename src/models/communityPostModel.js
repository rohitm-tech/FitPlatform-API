import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, trim: true, maxlength: 2000, default: '' },
    media: {
      type: [
        {
          kind: { type: String, enum: ['image', 'video'], required: true },
          mimeType: { type: String, required: true },
          filename: { type: String, required: true },
        },
      ],
      default: [],
    },
    likeCount: { type: Number, default: 0, min: 0 },
    replyCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

schema.index({ createdAt: -1 });

export const CommunityPost = mongoose.model('CommunityPost', schema);
