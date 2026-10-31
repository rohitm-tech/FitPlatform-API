import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { Exercise } from '../models/exerciseModel.js';

export const listExercises = asyncHandler(async (req, res) => {
  const { muscle, equipment, difficulty, type, q, page = 1, limit = 24 } = req.query;
  const filter = {};
  if (muscle) filter.primaryMuscles = muscle;
  if (equipment) filter.equipment = equipment;
  if (difficulty) filter.difficulty = difficulty;
  if (type) filter.type = type;
  if (q) filter.$text = { $search: q };

  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(200, Math.max(1, Number(limit)));

  const [exercises, total] = await Promise.all([
    Exercise.find(filter)
      .populate('primaryMuscles', 'key displayName group')
      .populate('secondaryMuscles', 'key displayName group')
      .sort({ name: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Exercise.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, { exercises, page: pageNum, limit: limitNum, total }, 'Exercises fetched')
  );
});

export const getExerciseBySlug = asyncHandler(async (req, res) => {
  const exercise = await Exercise.findOne({ slug: req.params.slug })
    .populate('primaryMuscles', 'key displayName group')
    .populate('secondaryMuscles', 'key displayName group');
  if (!exercise) throw new ApiError(404, 'Exercise not found');
  return res.status(200).json(new ApiResponse(200, exercise, 'Exercise fetched'));
});
