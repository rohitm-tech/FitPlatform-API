import mongoose from 'mongoose';
import { Router } from 'express';
import { z } from 'zod';
import { DailyLog, MEALS } from '../models/dailyLogModel.js';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/roleMiddleware.js';
import { validateBody } from '../validations/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';

const router = Router();
router.use(verifyJWT, requireRole('athlete'));

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

function dayParam(value) {
  if (!DAY.test(value)) throw new ApiError(400, 'Use a YYYY-MM-DD date');
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value)
    throw new ApiError(400, 'Invalid calendar date');
  // A day ahead of UTC covers every timezone's "today"; later dates are typos.
  if (parsed > Date.now() + DAY_MS) throw new ApiError(400, 'You can only log today or earlier');
  return value;
}

const scale = z.number().int().min(1).max(5).nullable().optional();
const daySchema = z
  .object({
    waterMl: z.number().int().min(0).max(15000).optional(),
    weightKg: z.number().min(20).max(400).nullable().optional(),
    mood: scale,
    energy: scale,
    stress: scale,
    note: z.string().trim().max(500).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to save');

const grams = (max) => z.number().min(0).max(max).nullable().optional();
const foodSchema = z.object({
  meal: z.enum(MEALS),
  name: z.string().trim().min(1, 'Name the food').max(120),
  quantity: z.string().trim().max(80).optional(),
  calories: z.number().min(0).max(10000).nullable().optional(),
  estimated: z.boolean().optional(),
  proteinG: grams(1000),
  carbsG: grams(2000),
  fatG: grams(1000),
});

const waterSchema = z.object({ ml: z.number().int().min(-5000).max(5000).refine((v) => v !== 0) });

function upsert(athleteId, date, update) {
  return DailyLog.findOneAndUpdate({ athleteId, date }, update, {
    upsert: true,
    new: true,
    runValidators: true,
    setDefaultsOnInsert: true,
  }).lean();
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 366);
    const to = req.query.to ? dayParam(String(req.query.to)) : new Date().toISOString().slice(0, 10);
    const from = new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * DAY_MS).toISOString().slice(0, 10);
    const logs = await DailyLog.find({ athleteId: req.user._id, date: { $gte: from, $lte: to } })
      .sort({ date: -1 })
      .lean();
    res.json(new ApiResponse(200, { from, to, logs }, 'Daily logs'));
  }),
);

router.patch(
  '/:date',
  validateBody(daySchema),
  asyncHandler(async (req, res) => {
    const date = dayParam(req.params.date);
    const log = await upsert(req.user._id, date, { $set: req.body });
    res.json(new ApiResponse(200, log, 'Day saved'));
  }),
);

router.post(
  '/:date/water',
  validateBody(waterSchema),
  asyncHandler(async (req, res) => {
    const date = dayParam(req.params.date);
    const current = await DailyLog.findOne({ athleteId: req.user._id, date }).select('waterMl').lean();
    const next = Math.min(15000, Math.max(0, (current?.waterMl || 0) + req.body.ml));
    const log = await upsert(req.user._id, date, { $set: { waterMl: next } });
    res.json(new ApiResponse(200, log, 'Water saved'));
  }),
);

router.post(
  '/:date/foods',
  validateBody(foodSchema),
  asyncHandler(async (req, res) => {
    const date = dayParam(req.params.date);
    const existing = await DailyLog.findOne({ athleteId: req.user._id, date }).select('foods').lean();
    if ((existing?.foods?.length || 0) >= 60) throw new ApiError(400, 'This day already has 60 food entries');
    const food = { ...req.body, estimated: req.body.calories != null && req.body.estimated === true };
    const log = await upsert(req.user._id, date, { $push: { foods: food } });
    res.status(201).json(new ApiResponse(201, log, 'Food saved'));
  }),
);

router.delete(
  '/:date/foods/:foodId',
  asyncHandler(async (req, res) => {
    const date = dayParam(req.params.date);
    if (!mongoose.isValidObjectId(req.params.foodId)) throw new ApiError(404, 'Food entry not found');
    const log = await DailyLog.findOneAndUpdate(
      { athleteId: req.user._id, date, 'foods._id': req.params.foodId },
      { $pull: { foods: { _id: req.params.foodId } } },
      { new: true },
    ).lean();
    if (!log) throw new ApiError(404, 'Food entry not found');
    res.json(new ApiResponse(200, log, 'Food removed'));
  }),
);

export default router;
