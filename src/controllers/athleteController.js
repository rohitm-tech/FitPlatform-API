import { notifyAssignment,notifyUser } from '../services/notificationService.js';
import {queueReview} from '../services/ai/reviewService.js';
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { Workout } from "../models/workoutModel.js";
import { WorkoutLog } from "../models/workoutLogModel.js";
import { CheckIn } from "../models/checkInModel.js";
import { User } from "../models/userModel.js";
import {
  getMuscleGroupVolume,
  getNeglectedMuscleGroups,
  getWeeklyVolumeTrend,
} from "../services/analytics/trainingAnalytics.js";
import {
  getPersonalBests,
  getAttendance,
  getCurrentStreak,
} from "../services/analytics/performanceAnalytics.js";

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

export const getHome = asyncHandler(async (req, res) => {
  const athleteId = req.params.athleteId;
  const today = new Date();

  const [todaysWorkout, streakInfo] = await Promise.all([
    Workout.findOne({
      athleteId,
      date: { $gte: startOfDay(today), $lte: endOfDay(today) },
    }).populate("items.exerciseId", "name slug"),
    getCurrentStreak(athleteId),
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { todaysWorkout, ...streakInfo },
        "Home data fetched",
      ),
    );
});

export const listWorkouts = asyncHandler(async (req, res) => {
  const athleteId = req.params.athleteId;
  const { from, to } = req.query;
  const filter = { athleteId };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  const workouts = await Workout.find(filter)
    .populate("items.exerciseId", "name slug")
    .sort({ date: 1 });
  return res
    .status(200)
    .json(new ApiResponse(200, workouts, "Workouts fetched"));
});

export const createWorkout = asyncHandler(async (req, res) => {
  const athleteId = req.params.athleteId;
  const workout = await Workout.create({
    ...req.body,
    athleteId,
    assignedBy: req.user._id.toString(),
  });
  await notifyAssignment(workout,req.user.name);
  return res.status(201).json(new ApiResponse(201, workout, "Workout created"));
});

export const updateWorkout = asyncHandler(async (req, res) => {
  const { athleteId, workoutId } = req.params;
  const workout = await Workout.findOneAndUpdate(
    { _id: workoutId, athleteId },
    req.body,
    {
      new: true,
      runValidators: true,
    },
  );
  if (!workout) throw new ApiError(404, "Workout not found");
  if(String(req.user._id)!==String(athleteId))await notifyUser(athleteId,`workout-update:${workout._id}:${workout.updatedAt.toISOString()}`,{type:'plan_change',title:'Your session was updated',body:`${req.user.name} updated “${workout.title}”. Check your calendar for the latest targets.`,href:`/athlete/history?date=${new Date(workout.date).toISOString().slice(0,10)}`});
  return res.status(200).json(new ApiResponse(200, workout, "Workout updated"));
});

export const logWorkout = asyncHandler(async (req, res) => {
  const athleteId = req.params.athleteId;
  const {
    workoutId,
    date,
    items,
    durationMin,
    perceivedEffort,
    painFlag,
    notes,
  } = req.body;

  if (workoutId && !(await Workout.exists({ _id: workoutId, athleteId })))
    throw new ApiError(404, "Workout not found");
  const log = await WorkoutLog.create({
    athleteId,
    workoutId: workoutId || null,
    date: date || new Date(),
    items,
    durationMin,
    perceivedEffort,
    painFlag,
    notes,
    source: "app",
  });

  if (workoutId) {
    await Workout.findOneAndUpdate(
      { _id: workoutId, athleteId },
      { status: "completed" },
    );
  }

  await queueReview({athleteId,workoutId:workoutId||undefined,logId:log._id,trigger:"workout_logged",eventKey:`log:${log._id}`});
  return res.status(201).json(new ApiResponse(201, log, "Workout logged; automatic review queued"));
});

export const listWorkoutLogs = asyncHandler(async (req, res) => {
  const athleteId = req.params.athleteId;
  const logs = await WorkoutLog.find({ athleteId })
    .populate("items.exerciseId", "name slug")
    .sort({ date: -1 });
  return res
    .status(200)
    .json(new ApiResponse(200, logs, "Workout logs fetched"));
});

export const getInsights = asyncHandler(async (req, res) => {
  const athleteId = req.params.athleteId;

  const [
    volume7d,
    volume14d,
    neglected,
    volumeTrend,
    personalBests,
    attendance,
  ] = await Promise.all([
    getMuscleGroupVolume(athleteId, 7),
    getMuscleGroupVolume(athleteId, 14),
    getNeglectedMuscleGroups(athleteId),
    getWeeklyVolumeTrend(athleteId, 6),
    getPersonalBests(athleteId),
    getAttendance(athleteId),
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          volume7d,
          volume14d,
          neglectedMuscleGroups: neglected,
          volumeTrend,
          personalBests,
          attendance,
        },
        "Insights fetched",
      ),
    );
});

export const createCheckIn = asyncHandler(async (req, res) => {
  const athleteId = req.params.athleteId;
  const athlete = await User.findById(athleteId);
  if (!athlete?.gymId)
    throw new ApiError(400, "Athlete is not a member of a gym");

  const checkIn = await CheckIn.create({
    athleteId,
    gymId: athlete.gymId,
    source: "app",
  });
  return res.status(201).json(new ApiResponse(201, checkIn, "Checked in"));
});
