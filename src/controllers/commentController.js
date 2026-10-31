import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { Comment } from '../models/commentModel.js';

export const listComments = asyncHandler(async (req, res) => {
  const { workoutId, workoutLogId } = req.query;
  const filter = {};
  if (workoutId) filter.workoutId = workoutId;
  if (workoutLogId) filter.workoutLogId = workoutLogId;

  const comments = await Comment.find(filter).populate('authorId', 'name roles').sort({ createdAt: 1 });
  return res.status(200).json(new ApiResponse(200, comments, 'Comments fetched'));
});

export const createComment = asyncHandler(async (req, res) => {
  const comment = await Comment.create({ ...req.body, authorId: req.user._id });
  const populated = await comment.populate('authorId', 'name roles');
  return res.status(201).json(new ApiResponse(201, populated, 'Comment added'));
});
