import mongoose from "mongoose";
import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/models/userModel.js";

const person = async (role, email) => {
  const user = await User.create({
    name: role === "coach" ? "Meera Iyer" : "Aarav Shah",
    email,
    passwordHash: "Password123!",
    roles: [role],
  });
  return {
    user,
    headers: { Authorization: `Bearer ${user.generateAccessToken()}` },
  };
};

const swimItem = {
  kind: "swim",
  label: "Freestyle",
  stroke: "Freestyle",
  sets: 8,
  distanceM: 100,
  restSec: 20,
  paceSec: 95,
};

it("stores the sport on the coaching link and only assigns sessions measured for that sport", async () => {
  const athlete = await person("athlete", "aarav@session.test");
  const coach = await person("coach", "meera@session.test");

  const missingSport = await request(app)
    .post("/api/v1/coach/athletes/invite")
    .set(coach.headers)
    .send({ email: athlete.user.email });
  expect(missingSport.status).toBe(400);

  const invite = await request(app)
    .post("/api/v1/coach/athletes/invite")
    .set(coach.headers)
    .send({ email: athlete.user.email, sport: "Swimming" });
  expect(invite.status).toBe(201);
  expect(invite.body.data.sport).toBe("Swimming");

  const accepted = await request(app)
    .patch(`/api/v1/member-access/invitations/${invite.body.data._id}`)
    .set(athlete.headers)
    .send({ accept: true });
  expect(accepted.status).toBe(200);

  const wrongShape = await request(app)
    .post("/api/v1/coach/templates")
    .set(coach.headers)
    .send({
      title: "Not a swim",
      sport: "Swimming",
      items: [
        {
          kind: "strength",
          exerciseId: new mongoose.Types.ObjectId().toString(),
          sets: 3,
          reps: 8,
        },
      ],
    });
  expect(wrongShape.status).toBe(400);

  const swim = await request(app)
    .post("/api/v1/coach/templates")
    .set(coach.headers)
    .send({ title: "Aerobic swim", sport: "Swimming", items: [swimItem] });
  expect(swim.status).toBe(201);

  const strength = await request(app)
    .post("/api/v1/coach/templates")
    .set(coach.headers)
    .send({
      title: "Squat day",
      sport: "Strength",
      items: [
        {
          kind: "strength",
          exerciseId: new mongoose.Types.ObjectId().toString(),
          sets: 3,
          reps: 5,
          targetWeightKg: 60,
          restSec: 180,
        },
      ],
    });
  expect(strength.status).toBe(201);

  const assigned = await request(app)
    .post(`/api/v1/coach/templates/${swim.body.data._id}/assign`)
    .set(coach.headers)
    .send({ athleteIds: [athlete.user.id], dates: ["2026-11-04"] });
  expect(assigned.status).toBe(201);
  expect(assigned.body.data[0].sport).toBe("Swimming");
  expect(assigned.body.data[0].items[0].distanceM).toBe(100);
  expect(assigned.body.data[0].items[0].stroke).toBe("Freestyle");

  const blocked = await request(app)
    .post(`/api/v1/coach/templates/${strength.body.data._id}/assign`)
    .set(coach.headers)
    .send({ athleteIds: [athlete.user.id], dates: ["2026-11-05"] });
  expect(blocked.status).toBe(400);
  expect(blocked.body.message).toMatch(/Swimming/);

  const hyrox = await request(app).post("/api/v1/coach/templates").set(coach.headers).send({
    title: "HYROX pieces",
    sport: "HYROX",
    items: [
      { kind: "station", label: "SkiErg", metric: "distance", distanceM: 1000 },
      { kind: "station", label: "Wall balls", metric: "reps", reps: 100 },
    ],
  });
  expect(hyrox.status).toBe(201);

  const yoga = await request(app).post("/api/v1/coach/templates").set(coach.headers).send({
    title: "Mobility",
    sport: "Yoga",
    items: [{ kind: "practice", label: "Flow", durationSec: 45 * 60, effort: 4 }],
  });
  expect(yoga.status).toBe(201);
});
