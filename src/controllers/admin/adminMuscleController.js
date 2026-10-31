import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { Muscle } from '../../models/muscleModel.js';

export const createMuscle = asyncHandler(async (req, res) => {
  const muscle = await Muscle.create(req.body);
  return res.status(201).json(new ApiResponse(201, muscle, 'Muscle created'));
});

export const updateMuscle = asyncHandler(async (req, res) => {
  const muscle = await Muscle.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!muscle) throw new ApiError(404, 'Muscle not found');
  return res.status(200).json(new ApiResponse(200, muscle, 'Muscle updated'));
});

export const deleteMuscle = asyncHandler(async (req, res) => {
  const muscle = await Muscle.findByIdAndDelete(req.params.id);
  if (!muscle) throw new ApiError(404, 'Muscle not found');
  return res.status(200).json(new ApiResponse(200, {}, 'Muscle deleted'));
});
