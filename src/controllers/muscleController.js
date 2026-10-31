import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { Muscle } from '../models/muscleModel.js';
import { Exercise } from '../models/exerciseModel.js';

export const listMuscles = asyncHandler(async (req, res) => {
  const muscles = await Muscle.find().sort({ group: 1, displayName: 1 });
  return res.status(200).json(new ApiResponse(200, muscles, 'Muscles fetched'));
});

export const getMuscleByKey = asyncHandler(async (req, res) => {
  const muscle = await Muscle.findOne({ key: req.params.key });
  if (!muscle) throw new ApiError(404, 'Muscle not found');

  const [primaryExercises, secondaryExercises] = await Promise.all([
    Exercise.find({ primaryMuscles: muscle._id }).select('name slug difficulty equipment type'),
    Exercise.find({ secondaryMuscles: muscle._id }).select('name slug difficulty equipment type'),
  ]);

  return res.status(200).json(
    new ApiResponse(200, { muscle, primaryExercises, secondaryExercises }, 'Muscle fetched')
  );
});
