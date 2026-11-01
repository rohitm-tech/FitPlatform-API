import mongoose from 'mongoose';
import {notifyUser} from '../services/notificationService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { CoachAthlete } from '../models/coachAthleteModel.js';
import { CoachMessage } from '../models/coachMessageModel.js';
import { User } from '../models/userModel.js';
import { Workout } from '../models/workoutModel.js';
import { WorkoutLog } from '../models/workoutLogModel.js';
import { Recovery } from '../models/recoveryModel.js';
import { DailyLog } from '../models/dailyLogModel.js';
import { Payment } from '../models/paymentModel.js';
import { getNeglectedMuscleGroups } from '../services/analytics/trainingAnalytics.js';
import { recordInviteFee, formatInr } from '../services/billingService.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const listMyAthletes = asyncHandler(async (req, res) => {
  const links = await CoachAthlete.find({ coachId: req.user._id, status: 'active' }).populate(
    'athleteId',
    'name email profile gymId'
  );

  const since7d = new Date(Date.now() - 7 * DAY_MS);
  const since14d = new Date(Date.now() - 14 * DAY_MS);
  const coachId = new mongoose.Types.ObjectId(String(req.user._id));
  const unreadRows = await CoachMessage.aggregate([
    {
      $match: {
        coachId,
        readAt: null,
        senderId: { $ne: coachId },
      },
    },
    { $group: { _id: '$athleteId', unread: { $sum: 1 } } },
  ]);
  const unreadByAthlete = new Map(
    unreadRows.map((row) => [String(row._id), row.unread]),
  );

  const athletes = await Promise.all(
    links.map(async (link) => {
      const athlete = link.athleteId;
      const [lastLog, sessionsThisWeek, skippedCount, painLogs, neglected] = await Promise.all([
        WorkoutLog.findOne({ athleteId: athlete._id }).sort({ date: -1 }).select('date'),
        WorkoutLog.countDocuments({ athleteId: athlete._id, date: { $gte: since7d } }),
        Workout.countDocuments({ athleteId: athlete._id, status: 'skipped', date: { $gte: since14d } }),
        WorkoutLog.countDocuments({ athleteId: athlete._id, painFlag: true, date: { $gte: since7d } }),
        getNeglectedMuscleGroups(athlete._id),
      ]);

      return {
        athlete: { _id: athlete._id, name: athlete.name, email: athlete.email, profile: athlete.profile },
        lastWorkoutDate: lastLog?.date || null,
        sessionsThisWeek,
        skippedCount,
        hasPainFlag: painLogs > 0,
        neglectedMuscleGroups: neglected,
        coachAthleteId: link._id,
        linkStatus: link.status,
        sport: link.sport || 'Strength',
        unread: unreadByAthlete.get(String(athlete._id)) || 0,
      };
    })
  );

  const invited = await CoachAthlete.find({ coachId: req.user._id, status: 'invited' }).populate('athleteId', 'name email');

  return res.status(200).json(new ApiResponse(200, { athletes, invited }, 'Athletes fetched'));
});

// Simplified invite flow for the prototype: invites an existing athlete
// account by email (no email delivery / signup-via-link yet).
export const inviteAthlete = asyncHandler(async (req, res) => {
  const { email, sport } = req.body;
  const athlete = await User.findOne({ email: email.toLowerCase(), roles: 'athlete' });
  if (!athlete) {
    throw new ApiError(404, 'No athlete account found with that email yet — ask them to sign up first');
  }

  const existing = await CoachAthlete.findOne({ coachId: req.user._id, athleteId: athlete._id });
  if (existing?.status === 'active') {
    throw new ApiError(409, `This athlete already trains ${existing.sport || 'Strength'} with you`);
  }

  let link = existing;
  let feeMinor = 0;
  if (!existing) {
    link = await CoachAthlete.create({
      coachId: req.user._id,
      athleteId: athlete._id,
      status: 'invited',
      sport,
    });
    feeMinor = await recordInviteFee(req.user, athlete);
  } else {
    existing.status = 'invited';
    existing.sport = sport;
    await existing.save();
    link = existing;
  }
  await notifyUser(athlete._id,`coach-invite:${link._id}`,{type:'invitation',title:'A coach invited you',body:`${req.user.name} invited you to train ${sport}. Review the invitation.`,href:'/settings?section=invitations'});
  const feeNote = feeMinor ? ` ${formatInr(feeMinor)} recorded as the invite fee.` : '';
  return res.status(201).json(new ApiResponse(201, { ...link.toObject(), inviteFeeMinor: feeMinor, currency: 'INR' }, `Invite sent for ${sport}.${feeNote}`));
});

const publicProfile = (profile = {}) => ({
  goal: profile.goal || '',
  experienceLevel: profile.experienceLevel || '',
  trainingDaysPerWeek: profile.trainingDaysPerWeek || null,
  sports: profile.sports || [],
  city: profile.location?.city || '',
  area: profile.location?.area || '',
  about: profile.about || '',
  trainingSetting: profile.trainingSetting || '',
  languages: profile.languages || [],
  availability: profile.availability || '',
  budgetMonthlyInr: profile.budgetMonthlyInr ?? null,
});

export const exploreAthletes = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = { roles: 'athlete', _id: { $ne: req.user._id } };
  if (q) filter.name = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const people = await User.find(filter)
    .select('name profile')
    .sort({ name: 1 })
    .limit(60)
    .lean();
  const ids = people.map((person) => person._id);
  const [links, payments] = await Promise.all([
    CoachAthlete.find({ coachId: req.user._id, athleteId: { $in: ids } })
      .select('athleteId status offer sport followUps')
      .lean(),
    Payment.find({
      providerId: req.user._id,
      customerId: { $in: ids },
      status: 'paid',
      fulfillment: 'coaching_active',
    })
      .select('customerId')
      .lean(),
  ]);
  const linkByAthlete = new Map(links.map((link) => [String(link.athleteId), link]));
  const paid = new Set(payments.map((row) => String(row.customerId)));
  const athletes = people.map((person) => {
    const link = linkByAthlete.get(String(person._id));
    return {
      _id: person._id,
      name: person.name,
      profile: publicProfile(person.profile),
      linkStatus: link?.status || 'none',
      offer: link?.offer || '',
      sport: link?.sport || '',
      followUps: (link?.followUps || []).map((note) => ({
        _id: note._id,
        text: note.text,
        sentAt: note.sentAt,
      })),
      paid: paid.has(String(person._id)),
    };
  });
  return res.json(new ApiResponse(200, { athletes }, 'Athletes to explore'));
});

export const offerToTrain = asyncHandler(async (req, res) => {
  const athlete = await User.findOne({ _id: req.params.athleteId, roles: 'athlete' });
  if (!athlete) throw new ApiError(404, 'Athlete not found');
  if (String(athlete._id) === String(req.user._id)) {
    throw new ApiError(400, 'You cannot offer to train yourself');
  }
  const existing = await CoachAthlete.findOne({
    coachId: req.user._id,
    athleteId: athlete._id,
  });
  if (existing?.status === 'active') {
    throw new ApiError(409, `This athlete already trains ${existing.sport || 'Strength'} with you`);
  }
  if (existing?.status === 'invited') {
    throw new ApiError(409, 'An offer is already waiting. Send a follow-up instead.');
  }
  const link = await CoachAthlete.findOneAndUpdate(
    { coachId: req.user._id, athleteId: athlete._id },
    {
      $set: {
        status: 'invited',
        offer: req.body.text,
        sport: req.body.sport,
        followUps: [],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await notifyUser(athlete._id, `coach-offer:${link._id}`, {
    type: 'invitation',
    title: `${req.user.name} offered to train you`,
    body: req.body.text,
    href: '/settings?section=invitations',
  });
  return res.status(201).json(new ApiResponse(201, link, 'Offer sent'));
});

export const followUpOffer = asyncHandler(async (req, res) => {
  const athlete = await User.findOne({ _id: req.params.athleteId, roles: 'athlete' });
  if (!athlete) throw new ApiError(404, 'Athlete not found');
  const link = await CoachAthlete.findOne({
    coachId: req.user._id,
    athleteId: athlete._id,
    status: 'invited',
  });
  if (!link) throw new ApiError(409, 'Send an offer before a follow-up');
  if (link.followUps.length >= 20) {
    throw new ApiError(409, 'This offer already has 20 follow-ups');
  }
  link.followUps.push({ text: req.body.text, sentAt: new Date() });
  await link.save();
  const note = link.followUps[link.followUps.length - 1];
  await notifyUser(athlete._id, `coach-offer-followup:${note._id}`, {
    type: 'invitation',
    title: `${req.user.name} sent a follow-up`,
    body: req.body.text,
    href: '/settings?section=invitations',
  });
  return res.status(201).json(new ApiResponse(201, link, 'Follow-up sent'));
});

export const athleteDashboard = asyncHandler(async (req, res) => {
  const athleteId = req.params.athleteId;
  const athlete = await User.findById(athleteId).select('name profile createdAt').lean();
  if (!athlete) throw new ApiError(404, 'Athlete not found');
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [records, logs, daily, payments, link, assigned, completed, logged30] = await Promise.all([
    Recovery.find({ athleteId }).sort({ date: -1, updatedAt: -1 }).limit(14).lean(),
    WorkoutLog.find({ athleteId })
      .sort({ date: -1 })
      .limit(20)
      .populate('items.exerciseId', 'name')
      .lean(),
    DailyLog.find({ athleteId }).sort({ date: -1 }).limit(7).lean(),
    Payment.find({
      providerId: req.user._id,
      customerId: athleteId,
      status: 'paid',
    })
      .select('amount currency title paidAt')
      .sort({ paidAt: -1 })
      .lean(),
    CoachAthlete.findOne({ coachId: req.user._id, athleteId, status: 'active' })
      .select('startedAt sport')
      .lean(),
    Workout.countDocuments({ athleteId }),
    Workout.countDocuments({ athleteId, status: 'completed' }),
    WorkoutLog.countDocuments({ athleteId, date: { $gte: since30 } }),
  ]);
  const paidMinor = payments.reduce((sum, row) => sum + (row.amount || 0), 0);
  const visible = true;
  return res.json(
    new ApiResponse(
      200,
      {
        athlete: {
          _id: athlete._id,
          name: athlete.name,
          joinedAt: athlete.createdAt,
          profile: publicProfile(athlete.profile),
        },
        coachingSince: link?.startedAt || null,
        sport: link?.sport || 'Strength',
        sessionsAssigned: assigned,
        sessionsCompleted: completed,
        sessionsLogged30d: logged30,
        paid: payments.length > 0,
        paidMinor,
        currency: payments[0]?.currency || 'INR',
        payments: payments.map((row) => ({
          title: row.title || 'Coaching',
          amount: row.amount,
          currency: row.currency || 'INR',
          paidAt: row.paidAt,
        })),
        logsVisible: visible,
        records: visible
          ? records.map((row) => ({
              date: row.date,
              sleepMinutes: row.sleepMinutes ?? null,
              restingHeartRate: row.restingHeartRate ?? null,
              hrvMs: row.hrvMs ?? null,
              sourceLabel: row.sourceLabel || row.source || '',
            }))
          : [],
        logs: visible
          ? logs.map((log) => ({
              _id: log._id,
              date: log.date,
              durationMin: log.durationMin ?? null,
              perceivedEffort: log.perceivedEffort ?? null,
              painFlag: Boolean(log.painFlag),
              notes: log.notes || '',
              exercises: (log.items || []).map((item) => item.exerciseId?.name || 'Exercise'),
            }))
          : [],
        daily: visible
          ? daily.map((row) => ({
              date: row.date,
              waterMl: row.waterMl || 0,
              foods: (row.foods || []).length,
              note: row.note || '',
              mood: row.mood,
              energy: row.energy,
            }))
          : [],
      },
      'Athlete dashboard',
    ),
  );
});
