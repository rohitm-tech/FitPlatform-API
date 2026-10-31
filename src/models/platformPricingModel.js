import mongoose from 'mongoose';

const featureSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, maxlength: 40 },
    label: { type: String, required: true, maxlength: 120 },
    included: { type: Boolean, default: false },
    limit: { type: Number, default: null },
  },
  { _id: false },
);

const planSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, maxlength: 40 },
    name: { type: String, required: true, maxlength: 40 },
    priceMinor: { type: Number, required: true, min: 0 },
    interval: { type: String, enum: ['month', 'once'], default: 'month' },
    features: { type: [featureSchema], default: [] },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'default' },
    currency: { type: String, default: 'INR' },
    plans: { type: [planSchema], default: [] },
    coachInviteFeeMinor: { type: Number, default: 29900, min: 0 },
    coachChatFeeMinor: { type: Number, default: 99900, min: 0 },
    coachEarningsFeePercent: { type: Number, default: 5, min: 0, max: 100 },
    gymMonthlyMinor: { type: Number, default: 300000, min: 0 },
    marketplaceFeePercent: { type: Number, default: 5, min: 0, max: 100 },
  },
  { timestamps: true },
);

export const PlatformPricing = mongoose.model('PlatformPricing', schema);

export const DEFAULT_PRICING = {
  key: 'default',
  currency: 'INR',
  plans: [
    {
      id: 'free',
      name: 'Free',
      priceMinor: 0,
      interval: 'month',
      features: [
        { key: 'manual_logs', label: 'Log workouts, food, and recovery by hand', included: true, limit: null },
        { key: 'devices', label: 'Connect Apple Watch, Fitbit, and other wearables', included: false, limit: null },
        { key: 'ai', label: 'AI coach', included: false, limit: null },
        { key: 'coach_chats', label: 'Coach conversations included', included: false, limit: 0 },
      ],
    },
    {
      id: 'premium',
      name: 'Premium',
      priceMinor: 79900,
      interval: 'month',
      features: [
        { key: 'manual_logs', label: 'Log workouts, food, and recovery by hand', included: true, limit: null },
        { key: 'devices', label: 'Connect Apple Watch, Fitbit, and other wearables', included: true, limit: null },
        { key: 'ai', label: 'AI coach', included: true, limit: null },
        { key: 'coach_chats', label: 'Coach conversations included', included: true, limit: 3 },
      ],
    },
  ],
  coachInviteFeeMinor: 29900,
  coachChatFeeMinor: 99900,
  coachEarningsFeePercent: 5,
  gymMonthlyMinor: 300000,
  marketplaceFeePercent: 5,
};
