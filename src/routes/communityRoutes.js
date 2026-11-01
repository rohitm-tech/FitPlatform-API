import { Router } from 'express';
import { z } from 'zod';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/roleMiddleware.js';
import { requireAthleteFeature } from '../services/billingService.js';
import { validateBody } from '../validations/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  createPost,
  createReply,
  getThread,
  listPosts,
  listReplies,
  listThreads,
  searchAthletes,
  sendMessage,
  startThread,
  toggleLike,
} from '../services/communityService.js';

const router = Router();
const text = z.object({
  body: z.string().trim().min(1, 'Write something first.').max(2000, 'Keep it under 2000 characters.'),
});
const startSchema = z.object({
  athleteId: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Choose an athlete.'),
  body: z.string().trim().min(1, 'Write a message first.').max(2000, 'Keep it under 2000 characters.'),
});

router.use(verifyJWT, requireRole('athlete'));

router.get(
  '/threads',
  asyncHandler(async (req, res) => {
    res.json(new ApiResponse(200, await listThreads(req.user), 'Conversations'));
  }),
);

router.get(
  '/threads/:threadId',
  asyncHandler(async (req, res) => {
    res.json(new ApiResponse(200, await getThread(req.user, req.params.threadId), 'Conversation'));
  }),
);

router.post(
  '/threads/:threadId/messages',
  validateBody(text),
  asyncHandler(async (req, res) => {
    const message = await sendMessage(req.user, req.params.threadId, req.body.body);
    res.status(201).json(new ApiResponse(201, message, 'Message sent'));
  }),
);

router.use(requireAthleteFeature('community'));

router.get(
  '/athletes',
  asyncHandler(async (req, res) => {
    res.json(new ApiResponse(200, await searchAthletes(req.user, req.query.q), 'Athletes'));
  }),
);

router.get(
  '/posts',
  asyncHandler(async (req, res) => {
    res.json(new ApiResponse(200, await listPosts(req.user, req.query.before), 'Community'));
  }),
);

router.post(
  '/posts',
  validateBody(text),
  asyncHandler(async (req, res) => {
    const post = await createPost(req.user, req.body.body);
    res.status(201).json(new ApiResponse(201, post, 'Posted'));
  }),
);

router.get(
  '/posts/:postId/replies',
  asyncHandler(async (req, res) => {
    res.json(new ApiResponse(200, await listReplies(req.params.postId), 'Replies'));
  }),
);

router.post(
  '/posts/:postId/replies',
  validateBody(text),
  asyncHandler(async (req, res) => {
    const reply = await createReply(req.user, req.params.postId, req.body.body);
    res.status(201).json(new ApiResponse(201, reply, 'Reply posted'));
  }),
);

router.post(
  '/posts/:postId/like',
  asyncHandler(async (req, res) => {
    res.json(new ApiResponse(200, await toggleLike(req.user, req.params.postId), 'Like updated'));
  }),
);

router.post(
  '/threads',
  validateBody(startSchema),
  asyncHandler(async (req, res) => {
    const started = await startThread(req.user, req.body.athleteId, req.body.body);
    res.status(201).json(new ApiResponse(201, started, 'Conversation started'));
  }),
);

export default router;
