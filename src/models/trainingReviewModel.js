import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    athleteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    workoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' },
    logId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkoutLog' },
    eventKey: { type: String, unique: true, required: true },
    trigger: {
      type: String,
      enum: [
        'workout_logged',
        'recovery_updated',
        'coach_requested',
        'plan_generated',
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'ready', 'failed'],
      default: 'queued',
    },
    attempts: { type: Number, default: 0 },
    leaseUntil: Date,
    decisionLeaseUntil: Date,
    nextAttemptAt: Date,
    rules: mongoose.Schema.Types.Mixed,
    analysis: mongoose.Schema.Types.Mixed,
    aiStatus: String,
    error: String,
    approval: {
      type: String,
      enum: ['not_required', 'pending', 'approved', 'declined'],
      default: 'not_required',
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    baseWorkoutUpdatedAt: Date,
  },
  { timestamps: true },
);
schema.index({ status: 1, nextAttemptAt: 1 });
schema.index({ athleteId: 1, createdAt: -1 });
export const TrainingReview = mongoose.model('TrainingReview', schema);
