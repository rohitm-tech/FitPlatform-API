import { Router } from 'express';
import { z } from 'zod';
import { AiThread } from '../models/aiThreadModel.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { requireRole } from '../middlewares/roleMiddleware.js';
import { validateBody } from '../validations/schemas.js';
import { importLegacyConversation, ownedThread } from '../services/ai/conversationService.js';
const r = Router();
r.use(requireRole('athlete'));
r.get('/', asyncHandler(async (req, res) => {
  await importLegacyConversation(req.user._id);
  const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
  const q = String(req.query.q || '').trim().slice(0, 100);
  const query = { athleteId: req.user._id, archived: req.query.archived === 'true' };
  if (q) query.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const [threads, total] = await Promise.all([
    AiThread.find(query).sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * 30).limit(30).select('title archived updatedAt createdAt activeTurnId').lean(),
    AiThread.countDocuments(query),
  ]);
  res.json(new ApiResponse(200, { conversations: threads, total, page, hasMore: page * 30 < total }, 'Conversation history'));
}));
r.post('/', asyncHandler(async (req, res) => {
  const thread = await AiThread.create({ athleteId: req.user._id });
  res.status(201).json(new ApiResponse(201, thread, 'Conversation created'));
}));
r.get('/:id', asyncHandler(async (req, res) => {
  res.json(new ApiResponse(200, await ownedThread(req.user._id, req.params.id), 'Conversation loaded'));
}));
r.patch('/:id', validateBody(z.object({ title: z.string().trim().min(1).max(80).optional(), archived: z.boolean().optional() }).refine(v => v.title !== undefined || v.archived !== undefined)), asyncHandler(async (req, res) => {
  const thread = await ownedThread(req.user._id, req.params.id);
  if (req.body.archived !== undefined && thread.activeTurnId) throw new ApiError(409, 'Wait for the current response before archiving');
  const query = { _id: thread._id, athleteId: req.user._id, ...(req.body.archived !== undefined ? { activeTurnId: { $exists: false } } : {}) };
  const updated = await AiThread.findOneAndUpdate(query, { $set: req.body }, { new: true });
  if (!updated) throw new ApiError(409, 'A response is being prepared. Please wait.');
  res.json(new ApiResponse(200, updated, 'Conversation updated'));
}));
export default r;
