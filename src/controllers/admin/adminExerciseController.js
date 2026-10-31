import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { Exercise } from '../../models/exerciseModel.js';
import { slugify } from '../../utils/slugify.js';

export const createExercise = asyncHandler(async (req, res) => {
  const slug = req.body.slug || slugify(req.body.name);
  const exercise = await Exercise.create({ ...req.body, slug });
  return res.status(201).json(new ApiResponse(201, exercise, 'Exercise created'));
});

export const updateExercise = asyncHandler(async (req, res) => {
  const exercise = await Exercise.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!exercise) throw new ApiError(404, 'Exercise not found');
  return res.status(200).json(new ApiResponse(200, exercise, 'Exercise updated'));
});

export const deleteExercise = asyncHandler(async (req, res) => {
  const exercise = await Exercise.findByIdAndDelete(req.params.id);
  if (!exercise) throw new ApiError(404, 'Exercise not found');
  return res.status(200).json(new ApiResponse(200, {}, 'Exercise deleted'));
});
