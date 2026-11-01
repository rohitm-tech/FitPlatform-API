import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { CoachAthlete } from '../models/coachAthleteModel.js';
import { CoachProfile } from '../models/coachProfileModel.js';
import { CoachMessage } from '../models/coachMessageModel.js';
import { Workout } from '../models/workoutModel.js';
import { notifyUser } from '../services/notificationService.js';
import { ensureCoachChat } from '../services/billingService.js';

const PAGE = 50;

const activeCoachLink = (athleteId) =>
  CoachAthlete.findOne({ athleteId, status: 'active' }).sort({ startedAt: -1 }).populate('coachId', 'name email');

async function threadFor(coachId, athleteId, viewerId) {
  const messages = await CoachMessage.find({ coachId, athleteId })
    .sort({ createdAt: -1 })
    .limit(PAGE)
    .lean();
  await CoachMessage.updateMany(
    { coachId, athleteId, senderId: { $ne: viewerId }, readAt: null },
    { $set: { readAt: new Date() } }
  );
  return messages.reverse();
}

async function sendMessage({ coachId, athleteId, sender, text, recipientId, href }) {
  const message = await CoachMessage.create({ coachId, athleteId, senderId: sender._id, text });
  await notifyUser(recipientId, `message:${message._id}`, {
    type: 'message',
    title: `New message from ${sender.name}`,
    body: text.length > 140 ? `${text.slice(0, 137)}…` : text,
    href,
  });
  return message;
}

// The athlete's side: who coaches me, what they last sent, and the thread.
export const getMyCoach = asyncHandler(async (req, res) => {
  const athleteId = req.user._id;
  const [link, invitations] = await Promise.all([
    activeCoachLink(athleteId),
    CoachAthlete.countDocuments({ athleteId, status: 'invited' }),
  ]);
  if (!link?.coachId) {
    return res.json(new ApiResponse(200, { coach: null, invitations }, 'No active coach'));
  }
  const coachId = link.coachId._id;
  const [profile, unread, lastMessage, lastAssigned, upcomingFromCoach] = await Promise.all([
    CoachProfile.findOne({ coachId })
      .select('headline specialties city sport experienceYears isPublic')
      .lean(),
    CoachMessage.countDocuments({ coachId, athleteId, senderId: coachId, readAt: null }),
    CoachMessage.findOne({ coachId, athleteId }).sort({ createdAt: -1 }).lean(),
    Workout.findOne({ athleteId, assignedBy: String(coachId) })
      .sort({ createdAt: -1 })
      .select('title date status createdAt')
      .lean(),
    Workout.countDocuments({
      athleteId,
      assignedBy: String(coachId),
      status: 'planned',
      date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
  ]);
  return res.json(
    new ApiResponse(
      200,
      {
        coach: { _id: coachId, name: link.coachId.name, email: link.coachId.email },
        profile,
        since: link.startedAt,
        unread,
        lastMessage,
        lastAssigned,
        upcomingFromCoach,
        invitations,
      },
      'Coach fetched'
    )
  );
});

export const listMyCoachMessages = asyncHandler(async (req, res) => {
  const link = await activeCoachLink(req.user._id);
  if (!link?.coachId) throw new ApiError(404, 'You do not have an active coach');
  const messages = await threadFor(link.coachId._id, req.user._id, req.user._id);
  return res.json(new ApiResponse(200, messages, 'Messages fetched'));
});

export const listPaidCoachMessages = asyncHandler(async (req, res) => {
  const coachId = req.params.coachId;
  if (!/^[a-fA-F0-9]{24}$/.test(coachId)) throw new ApiError(400, 'Invalid coach');
  await ensureCoachChat(req.user, coachId);
  const messages = await threadFor(coachId, req.user._id, req.user._id);
  return res.json(new ApiResponse(200, messages, 'Messages fetched'));
});

export const sendPaidCoachMessage = asyncHandler(async (req, res) => {
  const coachId = req.params.coachId;
  if (!/^[a-fA-F0-9]{24}$/.test(coachId)) throw new ApiError(400, 'Invalid coach');
  await ensureCoachChat(req.user, coachId);
  const message = await sendMessage({
    coachId,
    athleteId: req.user._id,
    sender: req.user,
    text: req.body.text,
    recipientId: coachId,
    href: `/coach/athletes/${req.user._id}`,
  });
  return res.status(201).json(new ApiResponse(201, message, 'Message sent'));
});

export const sendToMyCoach = asyncHandler(async (req, res) => {
  const link = await activeCoachLink(req.user._id);
  if (!link?.coachId) throw new ApiError(404, 'You do not have an active coach');
  await ensureCoachChat(req.user, link.coachId._id);
  const message = await sendMessage({
    coachId: link.coachId._id,
    athleteId: req.user._id,
    sender: req.user,
    text: req.body.text,
    recipientId: link.coachId._id,
    href: `/coach/athletes/${req.user._id}`,
  });
  return res.status(201).json(new ApiResponse(201, message, 'Message sent'));
});

// The coach's side. requireCoachOwnsAthlete has already checked the link.
export const listAthleteMessages = asyncHandler(async (req, res) => {
  const messages = await threadFor(req.user._id, req.params.athleteId, req.user._id);
  return res.json(new ApiResponse(200, messages, 'Messages fetched'));
});

export const sendToAthlete = asyncHandler(async (req, res) => {
  const message = await sendMessage({
    coachId: req.user._id,
    athleteId: req.params.athleteId,
    sender: req.user,
    text: req.body.text,
    recipientId: req.params.athleteId,
    href: '/athlete?coach=messages',
  });
  return res.status(201).json(new ApiResponse(201, message, 'Message sent'));
});
