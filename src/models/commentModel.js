import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    workoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout', default: null },
    workoutLogId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkoutLog', default: null },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

commentSchema.index({ workoutId: 1 });
commentSchema.index({ workoutLogId: 1 });

export const Comment = mongoose.model('Comment', commentSchema);
