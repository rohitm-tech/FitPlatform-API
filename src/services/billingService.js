import { PlatformPricing, DEFAULT_PRICING } from '../models/platformPricingModel.js';
import { LedgerEntry } from '../models/ledgerEntryModel.js';
import { CoachChatPass } from '../models/coachChatPassModel.js';
import { Gym } from '../models/gymModel.js';
import { User } from '../models/userModel.js';
import { ApiError } from '../utils/apiError.js';

const PLATFORM_KINDS = [
  'athlete_premium',
  'coach_chat',
  'coach_invite',
  'coach_fee',
  'gym_install',
  'marketplace_fee',
];

const KIND_LABELS = {
  athlete_premium: 'Athlete plans',
  coach_chat: 'Coach conversations',
  coach_invite: 'Coach invites',
  coach_fee: 'Share of coach earnings',
  gym_install: 'Gym installation',
  marketplace_fee: 'Marketplace fee',
};

export function formatInr(minor = 0) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(minor) / 100);
}

export async function getPricing() {
  const existing = await PlatformPricing.findOne({ key: 'default' }).lean();
  const pricing = existing || (await PlatformPricing.create(DEFAULT_PRICING)).toObject();
  await User.updateOne(
    { email: 'athlete1@fitplatform.app', $or: [{ plan: { $exists: false } }, { plan: null }] },
    { $set: { plan: 'premium' } },
  );
  if ((await LedgerEntry.countDocuments()) === 0) await ensureDemoLedger();
  return pricing;
}

export async function savePricing(input) {
  const ids = new Set(input.plans.map((plan) => plan.id));
  if (!ids.has('free') || !ids.has('premium')) {
    throw new ApiError(400, 'Free and Premium plans both need to stay available.');
  }
  const saved = await PlatformPricing.findOneAndUpdate(
    { key: 'default' },
    { $set: { ...input, currency: 'INR', key: 'default' } },
    { upsert: true, new: true },
  ).lean();
  return saved;
}

function planFor(pricing, user) {
  const id = user?.plan || 'free';
  return pricing.plans.find((plan) => plan.id === id) || pricing.plans.find((plan) => plan.id === 'free');
}

function featureOf(plan, key) {
  return plan?.features?.find((feature) => feature.key === key) || null;
}

export async function assertFeature(user, key) {
  const pricing = await getPricing();
  const feature = featureOf(planFor(pricing, user), key);
  if (feature?.included) return pricing;
  const plan = planFor(pricing, user);
  const premium = pricing.plans.find((item) => item.id === 'premium');
  throw new ApiError(
    402,
    key === 'ai'
      ? `AI coach is part of ${premium?.name || 'Premium'} (${formatInr(premium?.priceMinor || 0)} a month). The free plan can still log by hand.`
      : `Connecting a watch or band is part of ${premium?.name || 'Premium'} (${formatInr(premium?.priceMinor || 0)} a month). The free plan can still log by hand.`,
    [{ code: 'upgrade', planId: 'premium', amountMinor: premium?.priceMinor || 0, currency: 'INR', currentPlan: plan?.id || 'free' }],
  );
}

export function requirePlanFeature(key) {
  return async (req, res, next) => {
    try {
      if (!req.user?.roles?.includes('athlete')) return next();
      await assertFeature(req.user, key);
      next();
    } catch (error) {
      next(error);
    }
  };
}

async function record(entry) {
  if (entry.dedupeKey) {
    const existing = await LedgerEntry.findOne({ dedupeKey: entry.dedupeKey }).lean();
    if (existing) return existing;
  }
  return LedgerEntry.create({ currency: 'INR', recordedAt: new Date(), ...entry });
}

export async function ensureCoachChat(athlete, coachId) {
  const athleteId = athlete._id;
  const existing = await CoachChatPass.findOne({ athleteId, coachId }).lean();
  if (existing) return existing;
  const pricing = await getPricing();
  const plan = planFor(pricing, athlete);
  const feature = featureOf(plan, 'coach_chats');
  const limit = feature?.included ? (feature.limit == null ? Infinity : Number(feature.limit)) : 0;
  const used = await CoachChatPass.countDocuments({ athleteId });
  if (used < limit) {
    return CoachChatPass.create({ athleteId, coachId, reason: 'included', amountMinor: 0 });
  }
  throw new ApiError(
    402,
    limit > 0
      ? `${plan.name} includes ${limit} coach conversations. Another coach is ${formatInr(pricing.coachChatFeeMinor)}.`
      : `Messaging a coach is ${formatInr(pricing.coachChatFeeMinor)} on the ${plan.name} plan.`,
    [{
      code: 'coach_chat_payment',
      amountMinor: pricing.coachChatFeeMinor,
      currency: 'INR',
      coachId: String(coachId),
    }],
  );
}

export async function purchaseCoachChat(athlete, coachId) {
  const existing = await CoachChatPass.findOne({ athleteId: athlete._id, coachId }).lean();
  if (existing) return existing;
  const pricing = await getPricing();
  await record({
    kind: 'coach_chat',
    amountMinor: pricing.coachChatFeeMinor,
    grossMinor: pricing.coachChatFeeMinor,
    athleteId: athlete._id,
    coachId,
    title: 'Coach conversation',
    demo: true,
    dedupeKey: `coach-chat:${athlete._id}:${coachId}`,
  });
  return CoachChatPass.create({
    athleteId: athlete._id,
    coachId,
    reason: 'paid',
    amountMinor: pricing.coachChatFeeMinor,
  });
}

export async function upgradePlan(user, planId) {
  const pricing = await getPricing();
  const plan = pricing.plans.find((item) => item.id === planId);
  if (!plan) throw new ApiError(404, 'That plan is not available.');
  if ((user.plan || 'free') === plan.id) return { plan: plan.id, pricing };
  if (plan.priceMinor > 0) {
    await record({
      kind: 'athlete_premium',
      amountMinor: plan.priceMinor,
      grossMinor: plan.priceMinor,
      athleteId: user._id,
      title: `${plan.name} plan`,
      demo: true,
      dedupeKey: `premium:${user._id}:${new Date().toISOString().slice(0, 7)}`,
    });
  }
  user.plan = plan.id;
  await user.save();
  return { plan: user.plan, pricing };
}

export async function recordInviteFee(coach, athlete) {
  const pricing = await getPricing();
  await record({
    kind: 'coach_invite',
    amountMinor: pricing.coachInviteFeeMinor,
    grossMinor: pricing.coachInviteFeeMinor,
    coachId: coach._id,
    athleteId: athlete._id,
    title: `Invite ${athlete.name}`,
    demo: true,
    dedupeKey: `invite:${coach._id}:${athlete._id}`,
  });
  return pricing.coachInviteFeeMinor;
}

export async function recordSaleSplit(payment, category) {
  const pricing = await getPricing();
  const amount = payment.amount || 0;
  if (!amount) return;
  if (category === 'coaching') {
    const fee = Math.round((amount * pricing.coachEarningsFeePercent) / 100);
    const net = Math.max(0, amount - fee);
    await record({
      kind: 'coach_fee',
      amountMinor: fee,
      grossMinor: amount,
      feeMinor: fee,
      coachId: payment.providerId,
      athleteId: payment.customerId,
      paymentId: payment._id,
      title: 'Share of coaching payment',
      demo: false,
      dedupeKey: `payment:${payment._id}:coach_fee`,
    });
    await record({
      kind: 'coach_earning',
      amountMinor: net,
      grossMinor: amount,
      feeMinor: fee,
      coachId: payment.providerId,
      athleteId: payment.customerId,
      paymentId: payment._id,
      title: payment.title || 'Coaching payment',
      demo: false,
      dedupeKey: `payment:${payment._id}:coach_earning`,
    });
    return;
  }
  const fee = Math.round((amount * pricing.marketplaceFeePercent) / 100);
  await record({
    kind: 'marketplace_fee',
    amountMinor: fee,
    grossMinor: amount,
    feeMinor: fee,
    coachId: payment.providerId,
    athleteId: payment.customerId,
    paymentId: payment._id,
    title: 'Marketplace fee',
    demo: false,
    dedupeKey: `payment:${payment._id}:marketplace_fee`,
  });
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export async function ensureGymCharges() {
  const pricing = await getPricing();
  const gyms = await Gym.find().select('name').lean();
  const key = monthKey();
  await Promise.all(
    gyms.map((gym) =>
      record({
        kind: 'gym_install',
        amountMinor: pricing.gymMonthlyMinor,
        grossMinor: pricing.gymMonthlyMinor,
        gymId: gym._id,
        title: `Installation · ${gym.name}`,
        demo: false,
        recordedAt: new Date(),
        dedupeKey: `gym:${gym._id}:${key}`,
      }),
    ),
  );
}

async function ensureDemoLedger() {
  const count = await LedgerEntry.countDocuments();
  if (count > 0) return;
  const [coaches, athlete] = await Promise.all([
    User.find({ email: { $in: ['coach1@fitplatform.app', 'coach2@fitplatform.app'] } }).select('_id email name'),
    User.findOne({ email: 'athlete1@fitplatform.app' }).select('_id'),
  ]);
  const manish = coaches.find((coach) => coach.email === 'coach1@fitplatform.app');
  const shalini = coaches.find((coach) => coach.email === 'coach2@fitplatform.app');
  const rows = [];
  if (manish) {
    rows.push({
      kind: 'coach_earning',
      amountMinor: 4560000,
      grossMinor: 4800000,
      feeMinor: 240000,
      coachId: manish._id,
      title: 'Coaching payments',
      demo: true,
      dedupeKey: 'demo:coach1:earning',
    });
    rows.push({
      kind: 'coach_fee',
      amountMinor: 240000,
      grossMinor: 4800000,
      feeMinor: 240000,
      coachId: manish._id,
      title: 'Share of coaching payments',
      demo: true,
      dedupeKey: 'demo:coach1:fee',
    });
  }
  if (shalini) {
    rows.push({
      kind: 'coach_earning',
      amountMinor: 3040000,
      grossMinor: 3200000,
      feeMinor: 160000,
      coachId: shalini._id,
      title: 'Coaching payments',
      demo: true,
      dedupeKey: 'demo:coach2:earning',
    });
    rows.push({
      kind: 'coach_fee',
      amountMinor: 160000,
      grossMinor: 3200000,
      feeMinor: 160000,
      coachId: shalini._id,
      title: 'Share of coaching payments',
      demo: true,
      dedupeKey: 'demo:coach2:fee',
    });
  }
  if (athlete) {
    rows.push({
      kind: 'athlete_premium',
      amountMinor: 79900,
      grossMinor: 79900,
      athleteId: athlete._id,
      title: 'Premium plan',
      demo: true,
      dedupeKey: 'demo:premium:athlete1',
    });
  }
  rows.push(
    {
      kind: 'marketplace_fee',
      amountMinor: 185000,
      grossMinor: 3700000,
      feeMinor: 185000,
      title: 'Marketplace fees',
      demo: true,
      dedupeKey: 'demo:marketplace',
    },
    {
      kind: 'coach_invite',
      amountMinor: 119600,
      grossMinor: 119600,
      title: 'Coach invites',
      demo: true,
      dedupeKey: 'demo:invites',
    },
    {
      kind: 'gym_install',
      amountMinor: 600000,
      grossMinor: 600000,
      title: 'Installation · earlier months',
      demo: true,
      dedupeKey: 'demo:gym-history',
    },
  );
  await LedgerEntry.insertMany(rows);
}

export async function ensureBillingBaseline() {
  await getPricing();
  await User.updateOne(
    { email: 'athlete1@fitplatform.app', $or: [{ plan: { $exists: false } }, { plan: null }] },
    { $set: { plan: 'premium' } },
  );
  await ensureDemoLedger();
  await ensureGymCharges();
}

export async function revenueSummary() {
  await ensureBillingBaseline();
  const rows = await LedgerEntry.find({ kind: { $in: PLATFORM_KINDS } }).lean();
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const breakdown = PLATFORM_KINDS.map((kind) => {
    const matched = rows.filter((row) => row.kind === kind);
    return {
      kind,
      label: KIND_LABELS[kind],
      amountMinor: matched.reduce((sum, row) => sum + row.amountMinor, 0),
      count: matched.length,
    };
  }).filter((row) => row.amountMinor > 0);
  return {
    currency: 'INR',
    totalMinor: rows.reduce((sum, row) => sum + row.amountMinor, 0),
    monthMinor: rows
      .filter((row) => new Date(row.recordedAt) >= start)
      .reduce((sum, row) => sum + row.amountMinor, 0),
    demoMinor: rows.filter((row) => row.demo).reduce((sum, row) => sum + row.amountMinor, 0),
    breakdown,
  };
}

export async function coachEarnings(coachId) {
  await ensureBillingBaseline();
  const pricing = await getPricing();
  const rows = await LedgerEntry.find({ coachId, kind: 'coach_earning' }).lean();
  return {
    currency: 'INR',
    feePercent: pricing.coachEarningsFeePercent,
    grossMinor: rows.reduce((sum, row) => sum + (row.grossMinor || 0), 0),
    feeMinor: rows.reduce((sum, row) => sum + (row.feeMinor || 0), 0),
    netMinor: rows.reduce((sum, row) => sum + row.amountMinor, 0),
    demo: rows.some((row) => row.demo),
  };
}

export async function billingProfile(user) {
  const pricing = await getPricing();
  const plan = planFor(pricing, user);
  const used = await CoachChatPass.countDocuments({ athleteId: user._id });
  const feature = featureOf(plan, 'coach_chats');
  return {
    plan: plan?.id || 'free',
    planName: plan?.name || 'Free',
    features: plan?.features || [],
    coachChatsUsed: used,
    coachChatsIncluded: feature?.included ? Number(feature.limit ?? 0) : 0,
    pricing,
  };
}
