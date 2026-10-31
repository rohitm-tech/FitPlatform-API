import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/models/userModel.js";
import { WorkoutTemplate } from "../src/models/workoutTemplateModel.js";
import { CoachAthlete } from "../src/models/coachAthleteModel.js";
import { Notification } from "../src/models/notificationModel.js";
import { notifyUser } from "../src/services/notificationService.js";
const person = async (role = "athlete", email = role + "@notice.test") => {
  const user = await User.create({
    name: "Notification " + role,
    email,
    passwordHash: "Password123!",
    roles: [role],
  });
  return {
    user,
    headers: { Authorization: `Bearer ${user.generateAccessToken()}` },
  };
};
it("notifies an athlete when their coach assigns a session, and does not duplicate it on refresh", async () => {
  const athlete = await person();
  const coach = await person("coach");
  await CoachAthlete.create({
    athleteId: athlete.user._id,
    coachId: coach.user._id,
    status: "active",
  });
  const template = await WorkoutTemplate.create({
    coachId: coach.user._id,
    title: "Strength session",
    items: [{ exerciseId: athlete.user._id, sets: 3, reps: 10 }],
  });
  const assigned = await request(app)
    .post(`/api/v1/coach/templates/${template.id}/assign`)
    .set(coach.headers)
    .send({ athleteIds: [athlete.user.id], dates: ["2026-11-03"] });
  expect(assigned.status).toBe(201);
  const first = await request(app)
    .get("/api/v1/notifications")
    .set(athlete.headers);
  expect(first.body.data.unreadCount).toBe(1);
  expect(first.body.data.items[0].body).toContain("Strength session");
  expect(first.body.data.items[0].href).toBe(
    "/athlete/history?date=2026-11-03",
  );
  await request(app).get("/api/v1/notifications").set(athlete.headers);
  expect(await Notification.countDocuments()).toBe(1);
});
it("keeps read/unread and mark-all changes scoped to the recipient", async () => {
  const a = await person();
  const b = await person("athlete", "second@notice.test");
  await notifyUser(a.user._id, "event:a", {
    type: "assignment",
    title: "Your assignment",
    body: "Details",
    href: "/athlete/history",
  });
  await notifyUser(b.user._id, "event:b", {
    type: "assignment",
    title: "Their assignment",
    href: "/athlete/history",
  });
  const item = await Notification.findOne({ recipientId: a.user._id });
  expect(
    (
      await request(app)
        .patch(`/api/v1/notifications/${item.id}`)
        .set(b.headers)
        .send({ read: true })
    ).status,
  ).toBe(404);
  await request(app)
    .post("/api/v1/notifications/read-all")
    .set(a.headers)
    .send({});
  expect(
    (await request(app).get("/api/v1/notifications").set(a.headers)).body.data
      .unreadCount,
  ).toBe(0);
  expect(
    (await request(app).get("/api/v1/notifications").set(b.headers)).body.data
      .unreadCount,
  ).toBe(1);
  await request(app)
    .patch(`/api/v1/notifications/${item.id}`)
    .set(a.headers)
    .send({ read: false });
  expect(
    (await request(app).get("/api/v1/notifications?unread=true").set(a.headers))
      .body.data.items,
  ).toHaveLength(1);
});
it("does not create assignment notifications for forbidden assignments or personal sessions", async () => {
  const athlete = await person();
  const coach = await person("coach");
  const template = await WorkoutTemplate.create({
    coachId: coach.user._id,
    title: "Private template",
    items: [{ exerciseId: athlete.user._id, sets: 3, reps: 10 }],
  });
  expect(
    (
      await request(app)
        .post(`/api/v1/coach/templates/${template.id}/assign`)
        .set(coach.headers)
        .send({ athleteIds: [athlete.user.id], dates: ["2026-11-03"] })
    ).status,
  ).toBe(403);
  expect(await Notification.countDocuments()).toBe(0);
  await request(app)
    .post(`/api/v1/athletes/${athlete.user.id}/workouts`)
    .set(athlete.headers)
    .send({ title: "Own session", date: "2026-11-03", items: [] });
  expect(
    (await request(app).get("/api/v1/notifications").set(athlete.headers)).body
      .data.unreadCount,
  ).toBe(0);
});
it("creates invitation and acceptance notifications only for the two participants", async () => {
  const athlete = await person();
  const coach = await person("coach");
  const invite = await request(app)
    .post("/api/v1/coach/athletes/invite")
    .set(coach.headers)
    .send({ email: athlete.user.email });
  expect(invite.status).toBe(201);
  expect(
    (await request(app).get("/api/v1/notifications").set(athlete.headers)).body
      .data.items[0].type,
  ).toBe("invitation");
  await request(app)
    .patch(`/api/v1/member-access/invitations/${invite.body.data._id}`)
    .set(athlete.headers)
    .send({ accept: true });
  expect(
    (await request(app).get("/api/v1/notifications").set(coach.headers)).body
      .data.items[0].title,
  ).toContain("accepted");
});
