import mongoose from 'mongoose';

const gymMembershipSchema = new mongoose.Schema(
  {
    gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['active', 'paused', 'expired'],
      default: 'active',
    },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: null },
  },
  { timestamps: true }
);

gymMembershipSchema.index({ gymId: 1, userId: 1 }, { unique: true });
gymMembershipSchema.index({ gymId: 1, status: 1 });

export const GymMembership = mongoose.model('GymMembership', gymMembershipSchema);
