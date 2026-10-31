import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { CoachAthlete } from '../models/coachAthleteModel.js';
import { User } from '../models/userModel.js';
import { Workout } from '../models/workoutModel.js';
import { WorkoutLog } from '../models/workoutLogModel.js';
import { getNeglectedMuscleGroups } from '../services/analytics/trainingAnalytics.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const listMyAthletes = asyncHandler(async (req, res) => {
  const links = await CoachAthlete.find({ coachId: req.user._id, status: 'active' }).populate(
    'athleteId',
    'name email profile gymId'
  );

  const since7d = new Date(Date.now() - 7 * DAY_MS);
  const since14d = new Date(Date.now() - 14 * DAY_MS);

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
      };
    })
  );

  const invited = await CoachAthlete.find({ coachId: req.user._id, status: 'invited' }).populate('athleteId', 'name email');

  return res.status(200).json(new ApiResponse(200, { athletes, invited }, 'Athletes fetched'));
});

// Simplified invite flow for the prototype: invites an existing athlete
// account by email (no email delivery / signup-via-link yet).
export const inviteAthlete = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const athlete = await User.findOne({ email: email.toLowerCase(), roles: 'athlete' });
  if (!athlete) {
    throw new ApiError(404, 'No athlete account found with that email yet — ask them to sign up first');
  }

  const existing = await CoachAthlete.findOne({ coachId: req.user._id, athleteId: athlete._id });
  if (existing) {
    throw new ApiError(409, 'This athlete is already linked to you');
  }

  const link = await CoachAthlete.create({ coachId: req.user._id, athleteId: athlete._id, status: 'invited' });
  return res.status(201).json(new ApiResponse(201, link, 'Invite sent'));
});
