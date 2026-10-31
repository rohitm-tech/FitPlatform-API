import conversationRoutes from './conversationRoutes.js';
import { AiThread } from '../models/aiThreadModel.js';
import { importLegacyConversation } from '../services/ai/conversationService.js';
import { CoachPhoto } from '../models/coachPhotoModel.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { Router } from 'express';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/roleMiddleware.js';
import { aiRateLimiter } from '../middlewares/rateLimitMiddleware.js';
import { validateBody } from '../validations/schemas.js';
import { z } from 'zod';
import { plan, chat, summary, nudge } from '../controllers/aiController.js';
import { requirePlanFeature } from '../services/billingService.js';
const r = Router();
r.use(verifyJWT);
r.use((req, res, next) =>
  req.method === 'POST' ? aiRateLimiter(req, res, next) : next(),
);
r.use('/conversations', requirePlanFeature('ai'), conversationRoutes);
r.post('/plan', requireRole('athlete'), requirePlanFeature('ai'), plan);
r.post(
  '/chat',
  requireRole('athlete'),
  requirePlanFeature('ai'),
  validateBody(
    z.object({
      message: z.string().trim().min(1).max(2000),
      conversationId: z.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
      clientRequestId: z.string().uuid().optional(),
      photo: z
        .object({
          mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
          data: z
            .string()
            .max(5600000)
            .regex(/^[A-Za-z0-9+/]+={0,2}$/),
        })
        .optional(),
    }),
  ),
  (req, res, next) => {
    const photo = req.body.photo;
    if (photo) {
      const b = Buffer.from(photo.data, 'base64');
      const mime =
        b[0] === 255 && b[1] === 216
          ? 'image/jpeg'
          : b
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? 'image/png'
            : b.subarray(0, 4).toString() === 'RIFF' &&
                b.subarray(8, 12).toString() === 'WEBP'
              ? 'image/webp'
              : null;
      if (mime !== photo.mimeType || b.length > 4 * 1024 * 1024)
        return next(
          new ApiError(400, 'Upload a valid JPEG, PNG or WebP under 4 MB'),
        );
    }
    next();
  },
  chat,
);
r.post('/nudge', requireRole('athlete'), requirePlanFeature('ai'), nudge);
r.post('/summary/:athleteId', requireRole('coach'), summary);
r.get(
  '/conversation',
  requireRole('athlete'),
  asyncHandler(async (req, res) => {
    await importLegacyConversation(req.user._id);
    const conversation = await AiThread.findOne({ athleteId: req.user._id, archived: false }).sort({ updatedAt: -1 }).lean();
    res.json(
      new ApiResponse(200, conversation?.messages || [], 'Conversation loaded'),
    );
  }),
);
r.get(
  '/photos',
  requireRole('athlete'),
  asyncHandler(async (req, res) =>
    res.json(
      new ApiResponse(
        200,
        await CoachPhoto.find({ athleteId: req.user._id })
          .select('_id caption mimeType createdAt')
          .sort({ createdAt: -1 })
          .limit(30)
          .lean(),
        'Your gallery',
      ),
    ),
  ),
);
r.get(
  '/photos/:id',
  requireRole('athlete'),
  asyncHandler(async (req, res) => {
    const photo = await CoachPhoto.findOne({
      _id: req.params.id,
      athleteId: req.user._id,
    }).select('+data');
    if (!photo) throw new ApiError(404, 'Photo not found');
    res
      .set({
        'Cache-Control': 'no-store',
        'Content-Type': photo.mimeType,
        'X-Content-Type-Options': 'nosniff',
      })
      .send(photo.data);
  }),
);
export default r;
