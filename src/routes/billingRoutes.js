import { Router } from 'express';
import { z } from 'zod';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/roleMiddleware.js';
import { validateBody } from '../validations/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import {
  billingProfile,
  coachEarnings,
  getPricing,
  purchaseCoachChat,
  revenueSummary,
  savePricing,
  upgradePlan,
} from '../services/billingService.js';

const router = Router();

router.get(
  '/pricing',
  asyncHandler(async (_req, res) => {
    res.json(new ApiResponse(200, await getPricing(), 'Pricing'));
  }),
);

router.use(verifyJWT);

const featureSchema = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(120),
  included: z.boolean(),
  limit: z.number().int().min(0).max(1000).nullable(),
});

const pricingSchema = z.object({
  plans: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        name: z.string().trim().min(1).max(40),
        priceMinor: z.number().int().min(0).max(100000000),
        interval: z.enum(['month', 'once']),
        features: z.array(featureSchema).max(20),
      }),
    )
    .min(1)
    .max(6),
  coachInviteFeeMinor: z.number().int().min(0).max(100000000),
  coachChatFeeMinor: z.number().int().min(0).max(100000000),
  coachEarningsFeePercent: z.number().min(0).max(100),
  gymMonthlyMinor: z.number().int().min(0).max(100000000),
  marketplaceFeePercent: z.number().min(0).max(100),
});

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json(new ApiResponse(200, await billingProfile(req.user), 'Your plan'));
  }),
);

router.post(
  '/upgrade',
  requireRole('athlete'),
  validateBody(z.object({ planId: z.string().trim().min(1).max(40) })),
  asyncHandler(async (req, res) => {
    const result = await upgradePlan(req.user, req.body.planId);
    res.json(new ApiResponse(200, result, 'Plan updated'));
  }),
);

router.post(
  '/coach-chat',
  requireRole('athlete'),
  validateBody(z.object({ coachId: z.string().regex(/^[a-fA-F0-9]{24}$/) })),
  asyncHandler(async (req, res) => {
    const pass = await purchaseCoachChat(req.user, req.body.coachId);
    res.status(201).json(new ApiResponse(201, pass, 'Coach conversation unlocked'));
  }),
);

router.get(
  '/coach-earnings',
  requireRole('coach'),
  asyncHandler(async (req, res) => {
    res.json(new ApiResponse(200, await coachEarnings(req.user._id), 'Earnings'));
  }),
);

router.get(
  '/revenue',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    res.json(new ApiResponse(200, await revenueSummary(), 'Revenue'));
  }),
);

router.patch(
  '/pricing',
  requireRole('admin'),
  validateBody(pricingSchema),
  asyncHandler(async (req, res) => {
    const keys = req.body.plans.flatMap((plan) => plan.features.map((feature) => `${plan.id}:${feature.key}`));
    if (new Set(keys).size !== keys.length) throw new ApiError(400, 'Each feature can appear once on a plan.');
    res.json(new ApiResponse(200, await savePricing(req.body), 'Pricing saved'));
  }),
);

export default router;
