import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import {
  generateWeeklyPlan,
  chatCoach,
  weeklyAthleteSummary,
  nudgeText,
} from '../services/ai/aiService.js';
import { WorkoutLog } from '../models/workoutLogModel.js';
export const plan = asyncHandler(async (req, res) =>
  res.json(
    new ApiResponse(
      200,
      await generateWeeklyPlan(req.user._id),
      'Weekly plan generated',
    ),
  ),
);
export const chat = asyncHandler(async (req, res) =>
  res.json(
    new ApiResponse(
      200,
      {
        answer: await chatCoach(req.user._id, req.body.message, req.body.photo),
      },
      'Coach response generated',
    ),
  ),
);
export const summary = asyncHandler(async (req, res) =>
  res.json(
    new ApiResponse(
      200,
      {
        summary: await weeklyAthleteSummary(req.user._id, req.params.athleteId),
      },
      'Summary generated',
    ),
  ),
);
export const nudge = asyncHandler(async (req, res) => {
  const logs = await WorkoutLog.find({ athleteId: req.user._id })
    .sort({ date: -1 })
    .limit(5)
    .select('date painFlag')
    .lean();
  res.json(
    new ApiResponse(200, {
      text: await nudgeText({ recentLogs: logs }),
      message: 'Motivational nudge generated',
    }),
  );
});
