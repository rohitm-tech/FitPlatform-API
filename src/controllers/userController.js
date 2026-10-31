import { Payment } from "../models/paymentModel.js";
import { CoachProfile } from "../models/coachProfileModel.js";
import { buildExportWorkbook } from "../services/exportWorkbook.js";
import { Exercise } from "../models/exerciseModel.js";
import {
  MarketListing,
  MarketRequest,
  MarketSaved,
} from "../models/marketplaceModel.js";
import { Notification } from "../models/notificationModel.js";
import { AiThread } from "../models/aiThreadModel.js";
import { Recovery } from "../models/recoveryModel.js";
import { DailyLog } from "../models/dailyLogModel.js";
import { TrainingReview } from "../models/trainingReviewModel.js";
import { CoachPhoto } from "../models/coachPhotoModel.js";
import { WorkoutTemplate } from "../models/workoutTemplateModel.js";
import { GymInvite } from "../models/gymInviteModel.js";
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
import { updateAthleteProfile } from "../services/athleteProfileService.js";

export const completeOnboarding = asyncHandler(async (req, res) => {
  const user = await updateAthleteProfile(req.user._id, req.body, {
    completeOnboarding: true,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Onboarding completed"));
});

export async function ownData(userId, { photosContent = true } = {}) {
  const user = await User.findById(userId).select("-passwordHash").lean();
  const id = userId;
  const [
    workouts,
    logs,
    checkIns,
    memberships,
    coaching,
    comments,
    conversation,
    conversations,
    notifications,
    payments,
    coachProfile,
    marketplaceListings,
    marketplaceRequests,
    savedListings,
    templates,
    recovery,
    reviews,
    photos,
    dailyLogs,
  ] = await Promise.all([
    Workout.find({ athleteId: id }).lean(),
    WorkoutLog.find({ athleteId: id }).lean(),
    CheckIn.find({ athleteId: id }).lean(),
    GymMembership.find({ userId: id }).lean(),
    CoachAthlete.find({ $or: [{ athleteId: id }, { coachId: id }] }).lean(),
    Comment.find({ authorId: id }).lean(),
    AiConversation.findOne({ athleteId: id }).lean(),
    AiThread.find({ athleteId: id }).lean(),
    Notification.find({ recipientId: id }).lean(),
    Payment.find({ $or: [{ customerId: id }, { providerId: id }] }).lean(),
    CoachProfile.findOne({ coachId: id }).lean(),
    MarketListing.find({ providerId: id }).lean(),
    MarketRequest.find({
      $or: [{ customerId: id }, { providerId: id }],
    }).lean(),
    MarketSaved.find({ userId: id }).lean(),
    WorkoutTemplate.find({ coachId: id }).lean(),
    Recovery.find({ athleteId: id }).lean(),
    TrainingReview.find({ athleteId: id }).lean(),
    CoachPhoto.find({ athleteId: id })
      .select(photosContent ? "+data" : "_id mimeType caption createdAt")
      .lean(),
    DailyLog.find({ athleteId: id }).sort({ date: 1 }).lean(),
  ]);
  return {
    user,
    workouts,
    logs,
    checkIns,
    memberships,
    coaching,
    comments,
    conversation,
    conversations,
    notifications,
    payments,
    coachProfile,
    marketplaceListings,
    marketplaceRequests,
    savedListings,
    templates,
    recovery,
    reviews,
    photos,
    dailyLogs,
  };
}
export const exportMyData = asyncHandler(async (req, res) =>
  res.json(
    new ApiResponse(200, await ownData(req.user._id), "Data export generated"),
  ),
);
export const exportMyExcel = asyncHandler(async (req, res) => {
  const data = await ownData(req.user._id, { photosContent: false });
  const ids = [
    ...new Set(
      [...data.workouts, ...data.logs, ...data.templates].flatMap((record) =>
        record.items.map((item) => String(item.exerciseId)),
      ),
    ),
  ];
  const exercises = await Exercise.find({ _id: { $in: ids } })
    .select("name")
    .lean();
  const names = Object.fromEntries(
    exercises.map((ex) => [String(ex._id), ex.name]),
  );
  const workbook = buildExportWorkbook(data, names);
  const buffer = await workbook.xlsx.writeBuffer();
  res.set({
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="rhythm-data.xlsx"',
    "Cache-Control": "no-store",
  });
  res.send(Buffer.from(buffer));
});

export const deleteMyAccount = asyncHandler(async (req, res) => {
  const id = req.user._id;
  if (
    await Payment.exists({
      $or: [{ customerId: id }, { providerId: id }],
      status: "paid",
    })
  )
    throw new ApiError(
      409,
      "Accounts with completed payments need support-assisted closure. Download your records and contact the platform admin.",
    );
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
    Recovery.deleteMany({ athleteId: id }),
    DailyLog.deleteMany({ athleteId: id }),
    TrainingReview.deleteMany({ athleteId: id }),
    CoachPhoto.deleteMany({ athleteId: id }),
    WorkoutTemplate.deleteMany({ coachId: id }),
    GymInvite.deleteMany({ email: req.user.email }),
    Workout.updateMany(
      { assignedBy: String(id) },
      { $set: { assignedBy: "deleted-account" } },
    ),
    Workout.deleteMany({ athleteId: id }),
    WorkoutLog.deleteMany({ athleteId: id }),
    CheckIn.deleteMany({ athleteId: id }),
    GymMembership.deleteMany({ userId: id }),
    CoachAthlete.deleteMany({ $or: [{ athleteId: id }, { coachId: id }] }),
    KioskSession.deleteMany({ athleteId: id }),
    AiConversation.deleteMany({ athleteId: id }),
    AiThread.deleteMany({ athleteId: id }),
    Notification.deleteMany({ recipientId: id }),
    CoachProfile.deleteOne({ coachId: id }),
    Payment.deleteMany({
      $or: [{ customerId: id }, { providerId: id }],
      status: { $ne: "paid" },
    }),
    MarketListing.deleteMany({ providerId: id }),
    MarketRequest.deleteMany({ $or: [{ customerId: id }, { providerId: id }] }),
    MarketSaved.deleteMany({ userId: id }),
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
