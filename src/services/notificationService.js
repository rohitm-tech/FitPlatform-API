import mongoose from "mongoose";
import { Notification } from "../models/notificationModel.js";
import { Workout } from "../models/workoutModel.js";
import { CoachAthlete } from "../models/coachAthleteModel.js";
import { TrainingReview } from "../models/trainingReviewModel.js";
export async function notifyUser(recipientId, eventKey, data) {
  if (!recipientId) return;
  try {
    await Notification.init();
    await Notification.updateOne(
      { recipientId, eventKey },
      {
        $setOnInsert: {
          ...data,
          recipientId,
          eventKey,
          createdAt: new Date(),
          readAt: null,
        },
      },
      { upsert: true, timestamps: false },
    );
  } catch (error) {
    if (error.code !== 11000)
      console.error("Notification could not be saved", {
        eventKey,
        message: error.message,
      });
  }
}
export async function notifyAssignment(workout, coachName = "Your coach") {
  if (
    !mongoose.isValidObjectId(workout.assignedBy) ||
    String(workout.assignedBy) === String(workout.athleteId)
  )
    return;
  const date = new Date(workout.date).toISOString().slice(0, 10);
  await notifyUser(workout.athleteId, `assignment:${workout._id}`, {
    type: "assignment",
    title: "A workout is ready for you",
    body: `${coachName} assigned “${workout.title}” for ${date}.`,
    href: `/athlete/history?date=${date}`,
  });
}
// Reconcile persisted assignment/invitation/review events if a request or worker was interrupted.
export async function syncNotifications(user) {
  const since = new Date(Date.now() - 30 * 864e5);
  if (user.roles.includes("athlete")) {
    const [workouts, invitations] = await Promise.all([
      Workout.find({ athleteId: user._id, createdAt: { $gte: since } })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      CoachAthlete.find({ athleteId: user._id, status: "invited" })
        .populate("coachId", "name")
        .lean(),
    ]);
    await Promise.all(workouts.map((w) => notifyAssignment(w)));
    await Promise.all(
      invitations.map((link) =>
        notifyUser(user._id, `coach-invite:${link._id}`, {
          type: "invitation",
          title: "A coach invited you",
          body: `${link.coachId?.name || "A coach"} wants to train with you. Review the invitation.`,
          href: "/settings?section=invitations",
        }),
      ),
    );
  }
  if (user.roles.includes("coach")) {
    const athleteIds = await CoachAthlete.find({
      coachId: user._id,
      status: "active",
    }).distinct("athleteId");
    const reviews = await TrainingReview.find({
      athleteId: { $in: athleteIds },
      status: "ready",
      approval: "pending",
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate("workoutId", "assignedBy")
      .lean();
    await Promise.all(
      reviews
        .filter(
          (review) =>
            review.analysis?.planDraft ||
            review.workoutId?.assignedBy === String(user._id),
        )
        .map((review) =>
          notifyUser(user._id, `review:${review._id}`, {
            type: "review",
            title: "A training review needs your decision",
            body: "Review the evidence and proposed changes before approving.",
            href: `/coach?athlete=${review.athleteId}`,
          }),
        ),
    );
  }
}
