import { Router } from 'express';
import { z } from 'zod';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/roleMiddleware.js';
import { validateBody } from '../validations/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  cancelRsvp,
  createEvent,
  getPublished,
  listAdminEvents,
  listPublished,
  listRsvps,
  rsvp,
  updateEvent,
} from '../services/eventService.js';

const router = Router();

const eventSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(2000),
  place: z.string().trim().min(1).max(160),
  startsAt: z.string().trim().min(1).max(40),
  endsAt: z.string().trim().min(1).max(40),
  capacity: z.number().int().min(1).max(10000),
  fullPriceMinor: z.number().int().min(0).max(100000000),
  premiumPriceMinor: z.number().int().min(0).max(100000000),
  publicOpensAt: z.string().trim().min(1).max(40),
  status: z.enum(['draft', 'published', 'cancelled']),
}).superRefine((value, ctx) => {
  const opens = Date.parse(value.publicOpensAt);
  const starts = Date.parse(value.startsAt);
  const ends = Date.parse(value.endsAt);
  if ([opens, starts, ends].some((time) => Number.isNaN(time))) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid date.' });
    return;
  }
  if (value.premiumPriceMinor > value.fullPriceMinor) {
    ctx.addIssue({ code: 'custom', message: 'The premium price cannot be higher than the full price.' });
  }
  if (opens >= starts) {
    ctx.addIssue({ code: 'custom', message: 'Booking must open before the event starts.' });
  }
  if (ends <= starts) {
    ctx.addIssue({ code: 'custom', message: 'The event must end after it starts.' });
  }
});

router.use(verifyJWT);

router.get(
  '/admin',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    res.json(new ApiResponse(200, await listAdminEvents(), 'Events'));
  }),
);

router.post(
  '/admin',
  requireRole('admin'),
  validateBody(eventSchema),
  asyncHandler(async (req, res) => {
    const event = await createEvent(req.user, req.body);
    res.status(201).json(new ApiResponse(201, event, 'Event created'));
  }),
);

router.patch(
  '/admin/:eventId',
  requireRole('admin'),
  validateBody(eventSchema),
  asyncHandler(async (req, res) => {
    const event = await updateEvent(req.params.eventId, req.body);
    res.json(new ApiResponse(200, event, 'Event updated'));
  }),
);

router.get(
  '/admin/:eventId/rsvps',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json(new ApiResponse(200, await listRsvps(req.params.eventId), 'Signups'));
  }),
);

router.get(
  '/',
  requireRole('athlete'),
  asyncHandler(async (req, res) => {
    res.json(new ApiResponse(200, await listPublished(req.user), 'Events'));
  }),
);

router.get(
  '/:eventId',
  requireRole('athlete'),
  asyncHandler(async (req, res) => {
    res.json(new ApiResponse(200, await getPublished(req.user, req.params.eventId), 'Event'));
  }),
);

router.post(
  '/:eventId/rsvp',
  requireRole('athlete'),
  asyncHandler(async (req, res) => {
    res.json(new ApiResponse(200, await rsvp(req.user, req.params.eventId), 'You are going'));
  }),
);

router.delete(
  '/:eventId/rsvp',
  requireRole('athlete'),
  asyncHandler(async (req, res) => {
    res.json(new ApiResponse(200, await cancelRsvp(req.user, req.params.eventId), 'Signup cancelled'));
  }),
);

export default router;
