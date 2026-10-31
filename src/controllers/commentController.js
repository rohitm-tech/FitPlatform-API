import { Workout } from "../models/workoutModel.js";
import { WorkoutLog } from "../models/workoutLogModel.js";
import { ApiError } from "../utils/apiError.js";
async function verifyThread(athleteId, workoutId, workoutLogId) {
  if (Boolean(workoutId) === Boolean(workoutLogId))
    throw new ApiError(400, "Choose exactly one workout or log");
  const record = workoutId
    ? await Workout.exists({ _id: workoutId, athleteId })
    : await WorkoutLog.exists({ _id: workoutLogId, athleteId });
  if (!record) throw new ApiError(404, "Training record not found");
}
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { Comment } from "../models/commentModel.js";

export const listComments = asyncHandler(async (req, res) => {
  const { workoutId, workoutLogId } = req.query;
  await verifyThread(req.params.athleteId, workoutId, workoutLogId);
  const filter = {};
  if (workoutId) filter.workoutId = workoutId;
  if (workoutLogId) filter.workoutLogId = workoutLogId;

  const comments = await Comment.find(filter)
    .populate("authorId", "name roles")
    .sort({ createdAt: 1 });
  return res
    .status(200)
    .json(new ApiResponse(200, comments, "Comments fetched"));
});

export const createComment = asyncHandler(async (req, res) => {
  await verifyThread(
    req.params.athleteId,
    req.body.workoutId,
    req.body.workoutLogId,
  );
  const comment = await Comment.create({ ...req.body, authorId: req.user._id });
  const populated = await comment.populate("authorId", "name roles");
  return res.status(201).json(new ApiResponse(201, populated, "Comment added"));
});
