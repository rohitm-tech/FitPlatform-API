import {Recovery} from '../models/recoveryModel.js';
import {TrainingReview} from '../models/trainingReviewModel.js';
import {CoachPhoto} from '../models/coachPhotoModel.js';
import {WorkoutTemplate} from '../models/workoutTemplateModel.js';
import {GymInvite} from '../models/gymInviteModel.js';
import { Workout } from "../models/workoutModel.js";
import { WorkoutLog } from "../models/workoutLogModel.js";
import { CheckIn } from "../models/checkInModel.js";
import { GymMembership } from "../models/gymMembershipModel.js";
import { CoachAthlete } from "../models/coachAthleteModel.js";
import { Comment } from "../models/commentModel.js";
import { KioskSession } from "../models/kioskSessionModel.js";
import { AiConversation } from "../models/aiConversationModel.js";
import { Gym } from "../models/gymModel.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { User } from "../models/userModel.js";
import bcrypt from "bcrypt";

export const completeOnboarding = asyncHandler(async (req, res) => {
  const profileUpdates = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        ...Object.fromEntries(
          Object.entries(profileUpdates).map(([key, value]) => [
            `profile.${key}`,
            value,
          ]),
        ),
        onboardingCompleted: true,
      },
    },
    { new: true, runValidators: true },
  ).select("-passwordHash");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Onboarding completed"));
});

export const exportMyData = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-passwordHash").lean();
  const id = req.user._id;
  const [
    workouts,
    logs,
    checkIns,
    memberships,
    coaching,
    comments,
    conversation,templates,recovery,reviews,photos,
  ] = await Promise.all([
    Workout.find({ athleteId: id }).lean(),
    WorkoutLog.find({ athleteId: id }).lean(),
    CheckIn.find({ athleteId: id }).lean(),
    GymMembership.find({ userId: id }).lean(),
    CoachAthlete.find({ $or: [{ athleteId: id }, { coachId: id }] }).lean(),
    Comment.find({ authorId: id }).lean(),
    AiConversation.findOne({ athleteId: id }).lean(),
    WorkoutTemplate.find({coachId:id}).lean(),
    Recovery.find({athleteId:id}).lean(),TrainingReview.find({athleteId:id}).lean(),CoachPhoto.find({athleteId:id}).select("+data").lean(),
  ]);
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          user,
          workouts,
          logs,
          checkIns,
          memberships,
          coaching,
          comments,
          conversation,templates,recovery,reviews,photos,
        },
        "Data export generated",
      ),
    );
});

export const deleteMyAccount = asyncHandler(async (req, res) => {
  const id = req.user._id;
  if (await Gym.exists({ ownerId: id }))
    throw new ApiError(
      409,
      "Transfer gym ownership before deleting your account",
    );
  const [workoutIds, logIds] = await Promise.all([
    Workout.find({ athleteId: id }).distinct("_id"),
    WorkoutLog.find({ athleteId: id }).distinct("_id"),
  ]);
  await Promise.all([
    Recovery.deleteMany({athleteId:id}),TrainingReview.deleteMany({athleteId:id}),CoachPhoto.deleteMany({athleteId:id}),
    WorkoutTemplate.deleteMany({coachId:id}),
    GymInvite.deleteMany({email:req.user.email}),
    Workout.updateMany({assignedBy:String(id)},{$set:{assignedBy:"deleted-account"}}),
    Workout.deleteMany({ athleteId: id }),
    WorkoutLog.deleteMany({ athleteId: id }),
    CheckIn.deleteMany({ athleteId: id }),
    GymMembership.deleteMany({ userId: id }),
    CoachAthlete.deleteMany({ $or: [{ athleteId: id }, { coachId: id }] }),
    KioskSession.deleteMany({ athleteId: id }),
    AiConversation.deleteMany({ athleteId: id }),
    Comment.deleteMany({
      $or: [
        { authorId: id },
        { workoutId: { $in: workoutIds } },
        { workoutLogId: { $in: logIds } },
      ],
    }),
  ]);
  await User.findByIdAndDelete(id);
  res.clearCookie("accessToken");
  return res.status(200).json(new ApiResponse(200, {}, "Account deleted"));
});

export const setKioskPin = asyncHandler(async (req, res) => {
  const hash = await bcrypt.hash(req.body.pin, 10);
  await User.findByIdAndUpdate(req.user._id, {
    $set: {
      kioskPinHash: hash,
      kioskPinFailures: 0,
      kioskPinLockedUntil: null,
    },
  });
  res.json(new ApiResponse(200, null, "Kiosk PIN updated"));
});
