import {CoachAthlete} from '../src/models/coachAthleteModel.js';
import {WorkoutLog} from '../src/models/workoutLogModel.js';
import request from "supertest";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import app from "../src/app.js";
import { User } from "../src/models/userModel.js";
import { Gym } from "../src/models/gymModel.js";
import { GymMembership } from "../src/models/gymMembershipModel.js";
import { KioskRequest } from "../src/models/kioskRequestModel.js";
import { Workout } from "../src/models/workoutModel.js";
async function account(role, email) {
  const user = await User.create({
    name: role,
    email,
    passwordHash: "Password123!",
    roles: [role],
  });
  return {
    user,
    auth: { Authorization: `Bearer ${user.generateAccessToken()}` },
  };
}
it("restricts access management to admins and provisions a gym on owner approval", async () => {
  const admin = await account("admin", "admin@test.com");
  const athlete = await account("athlete", "athlete@test.com");
  expect(
    (await request(app).get("/api/v1/admin/users").set(athlete.auth)).status,
  ).toBe(403);
  const result = await request(app)
    .patch(`/api/v1/admin/users/${athlete.user._id}/roles`)
    .set(admin.auth)
    .send({ roles: ["athlete", "gym_owner"], gymName: "Test gym" });
  expect(result.status).toBe(200);
  expect(await Gym.countDocuments({ ownerId: athlete.user._id })).toBe(1);
});
it("pairs the matching device and binds sessions to its credentials", async () => {
  const owner = await account("gym_owner", "owner@test.com");
  const athlete = await account("athlete", "athlete@test.com");
  const gym = await Gym.create({ name: "Test", ownerId: owner.user._id });
  athlete.user.gymId = gym._id;
  athlete.user.kioskPinHash = await bcrypt.hash("1234", 10);
  await athlete.user.save();
  await GymMembership.create({
    gymId: gym._id,
    userId: athlete.user._id,
    status: "active",
  });
  const first = await request(app)
    .post("/api/v1/gym/devices")
    .set(owner.auth)
    .send({ name: "First" });
  const second = await request(app)
    .post("/api/v1/gym/devices")
    .set(owner.auth)
    .send({ name: "Second" });
  const paired = await request(app)
    .post(`/api/v1/kiosk/${gym._id}/pair`)
    .send({ code: second.body.data.pairingCode });
  expect(paired.status).toBe(200);
  expect(paired.body.data.deviceId).toBe(second.body.data.deviceId);
  const creds = paired.body.data;
  const login = await request(app)
    .post(`/api/v1/kiosk/${gym._id}/login`)
    .send({ ...creds, email: athlete.user.email, pin: "1234" });
  expect(login.status).toBe(200);
  const path = `/api/v1/kiosk/session/${login.body.data.sessionId}`;
  expect((await request(app).get(path)).status).toBe(401);
  expect(
    (
      await request(app)
        .get(path)
        .set("Authorization", `Bearer ${creds.deviceToken}`)
    ).status,
  ).toBe(200);
  expect(first.status).toBe(201);
});
it("approves QR requests only for members and consumes each approval once", async () => {
  const owner = await account("gym_owner", "owner@test.com");
  const athlete = await account("athlete", "athlete@test.com");
  const gym = await Gym.create({
    name: "Test",
    ownerId: owner.user._id,
    kioskDevices: [
      {
        deviceId: "test-device",
        tokenHash: await bcrypt.hash("device-secret", 10),
      },
    ],
  });
  const token = "a".repeat(48);
  const qr = await KioskRequest.create({
    gymId: gym._id,
    deviceId: "test-device",
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 120000),
  });
  const path = `/api/v1/kiosk-qr/approve/${qr._id}`;
  expect(
    (await request(app).post(path).set(athlete.auth).send({ token })).status,
  ).toBe(403);
  await GymMembership.create({
    gymId: gym._id,
    userId: athlete.user._id,
    status: "active",
  });
  expect(
    (await request(app).post(path).set(athlete.auth).send({ token })).status,
  ).toBe(200);
  expect(
    (await request(app).post(path).set(athlete.auth).send({ token })).status,
  ).toBe(410);
});
it("does not expose another athlete’s workout comments through an owned athlete route", async () => {
  const a = await account("athlete", "a@test.com");
  const b = await account("athlete", "b@test.com");
  const workout = await Workout.create({
    athleteId: b.user._id,
    assignedBy: String(b.user._id),
    date: new Date(),
    title: "Private",
    items: [],
  });
  const res = await request(app)
    .get(`/api/v1/athletes/${a.user._id}/comments?workoutId=${workout._id}`)
    .set(a.auth);
  expect(res.status).toBe(404);
});

it('enforces detailed-log consent and immediately applies revoked coach access',async()=>{
 const coach=await account('coach','coach@privacy.com');const athlete=await account('athlete','athlete@privacy.com');
 await CoachAthlete.create({coachId:coach.user._id,athleteId:athlete.user._id,status:'active'});
 const path=`/api/v1/athletes/${athlete.user._id}/logs`;
 expect((await request(app).get(path).set(coach.auth)).status).toBe(403);
 await User.updateOne({_id:athlete.user._id},{$set:{'profile.shareDetailedLogs':true}});
 expect((await request(app).get(path).set(coach.auth)).status).toBe(200);
 await User.updateOne({_id:coach.user._id},{$set:{roles:['athlete']}});
 expect((await request(app).get(path).set(coach.auth)).status).toBe(403);
});
it('exports personal logs and removes them with the account',async()=>{
 const athlete=await account('athlete','athlete@privacy.com');
 await WorkoutLog.create({athleteId:athlete.user._id,date:new Date(),items:[]});
 const exported=await request(app).get('/api/v1/users/me/export').set(athlete.auth);
 expect(exported.status).toBe(200);expect(exported.body.data.logs).toHaveLength(1);expect(exported.body.data.user.passwordHash).toBeUndefined();
 expect((await request(app).delete('/api/v1/users/me').set(athlete.auth)).status).toBe(200);
 expect(await WorkoutLog.countDocuments({athleteId:athlete.user._id})).toBe(0);
 expect((await request(app).get('/api/v1/auth/me').set(athlete.auth)).status).toBe(401);
});
