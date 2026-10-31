import { GymMembership } from "../models/gymMembershipModel.js";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { Gym } from "../models/gymModel.js";
import { User } from "../models/userModel.js";
import { CheckIn } from "../models/checkInModel.js";
import { Workout } from "../models/workoutModel.js";
import { KioskSession } from "../models/kioskSessionModel.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const gymDashboard = asyncHandler(async (req, res) => {
  const gym = await Gym.findOne({ ownerId: req.user._id });
  if (!gym) throw new ApiError(404, "Gym not found");
  const since7 = new Date(Date.now() - 7 * 864e5),
    month = new Date();
  month.setDate(1);
  month.setHours(0, 0, 0, 0);
  const [members, coaches, today, week, atRisk, newMembers, coachActivity] =
    await Promise.all([
      GymMembership.countDocuments({ gymId: gym._id, status: "active" }),
      User.countDocuments({ gymId: gym._id, roles: "coach" }),
      CheckIn.countDocuments({
        gymId: gym._id,
        timestamp: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      CheckIn.aggregate([
        { $match: { gymId: gym._id, timestamp: { $gte: since7 } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      User.find({ gymId: gym._id, roles: "athlete" })
        .select("name email")
        .lean()
        .then(async (us) =>
          Promise.all(
            us.map(async (u) => ({
              ...u,
              lastCheckIn: await CheckIn.findOne({
                gymId: gym._id,
                athleteId: u._id,
              })
                .sort({ timestamp: -1 })
                .select("timestamp")
                .lean(),
            })),
          ),
        )
        .then((us) =>
          us.filter((u) => !u.lastCheckIn || u.lastCheckIn.timestamp < since7),
        ),
      User.countDocuments({
        gymId: gym._id,
        roles: "athlete",
        createdAt: { $gte: month },
      }),
      Workout.aggregate([
        {
          $match: {
            assignedBy: {
              $in: (
                await User.find({ gymId: gym._id, roles: "coach" }).distinct(
                  "_id",
                )
              ).map(String),
            },
            createdAt: { $gte: since7 },
          },
        },
        { $count: "count" },
      ]),
    ]);
  res.json(
    new ApiResponse(
      200,
      {
        gym,
        members,
        coaches,
        today,
        week,
        atRisk,
        newMembers,
        coachActivity: coachActivity[0]?.count || 0,
      },
      "Gym dashboard fetched",
    ),
  );
});
export const listGymPeople = asyncHandler(async (req, res) => {
  const gym = await Gym.findOne({ ownerId: req.user._id });
  if (!gym) throw new ApiError(404, "Gym not found");
  const people = await User.find({
    gymId: gym._id,
    roles: req.query.role === "coach" ? "coach" : "athlete",
  })
    .select("name email roles createdAt")
    .lean();
  const data = await Promise.all(
    people.map(async (p) => ({
      ...p,
      lastCheckIn:
        (
          await CheckIn.findOne({ gymId: gym._id, athleteId: p._id })
            .sort({ timestamp: -1 })
            .select("timestamp")
            .lean()
        )?.timestamp || null,
      checkIns: await CheckIn.countDocuments({
        gymId: gym._id,
        athleteId: p._id,
      }),
    })),
  );
  res.json(new ApiResponse(200, data, "Gym members fetched"));
});
export const updateBranding = asyncHandler(async (req, res) => {
  const gym = await Gym.findOneAndUpdate(
    { ownerId: req.user._id },
    { $set: { name: req.body.name, logoUrl: req.body.logoUrl } },
    { new: true, runValidators: true },
  );
  if (!gym) throw new ApiError(404, "Gym not found");
  res.json(new ApiResponse(200, gym, "Branding updated"));
});
export const registerDevice = asyncHandler(async (req, res) => {
  const gym = await Gym.findOne({ ownerId: req.user._id });
  if (!gym) throw new ApiError(404, "Gym not found");
  const code = crypto.randomInt(100000, 1000000).toString(),
    deviceId = crypto.randomUUID();
  gym.kioskDevices.push({
    deviceId,
    name: req.body.name || "Kiosk",
    tokenHash: await bcrypt.hash(`pair:${code}:${Date.now()}`, 10),
    pairingCodeHash: await bcrypt.hash(code, 10),
    pairingExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  await gym.save();
  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { deviceId, pairingCode: code, expiresInMinutes: 10 },
        "Pairing code created",
      ),
    );
});
export const listDevices = asyncHandler(async (req, res) => {
  const gym = await Gym.findOne({ ownerId: req.user._id });
  if (!gym) throw new ApiError(404, "Gym not found");
  res.json(
    new ApiResponse(
      200,
      gym.kioskDevices.map((d) => ({
        deviceId: d.deviceId,
        name: d.name,
        lastSeenAt: d.lastSeenAt,
        revoked: !!d.revokedAt,
      })),
      "Devices fetched",
    ),
  );
});
export const revokeDevice = asyncHandler(async (req, res) => {
  const gym = await Gym.findOne({ ownerId: req.user._id });
  if (!gym) throw new ApiError(404, "Gym not found");
  const d = gym.kioskDevices.find((x) => x.deviceId === req.params.deviceId);
  if (!d) throw new ApiError(404, "Device not found");
  d.revokedAt = new Date();
  await gym.save();
  res.json(new ApiResponse(200, null, "Device revoked"));
});
export const pairDevice = asyncHandler(async (req, res) => {
  const { code } = req.body,
    gym = await Gym.findById(req.params.gymId);
  if (!gym) throw new ApiError(404, "Gym not found");
  let d;
  for (const candidate of gym.kioskDevices) {
    if (
      !candidate.revokedAt &&
      candidate.pairingExpiresAt > Date.now() &&
      candidate.pairingCodeHash &&
      (await bcrypt.compare(code, candidate.pairingCodeHash))
    ) {
      d = candidate;
      break;
    }
  }
  if (!d) throw new ApiError(401, "Invalid or expired pairing code");
  const token = crypto.randomBytes(32).toString("hex");
  d.tokenHash = await bcrypt.hash(token, 10);
  d.pairingCodeHash = undefined;
  d.pairingExpiresAt = undefined;
  d.lastSeenAt = new Date();
  await gym.save();
  res.json(
    new ApiResponse(
      200,
      {
        deviceId: d.deviceId,
        deviceToken: token,
        gym: { _id: gym._id, name: gym.name, logoUrl: gym.logoUrl },
      },
      "Device paired",
    ),
  );
});
export const kioskLogin = asyncHandler(async (req, res) => {
  const gym = await Gym.findById(req.params.gymId);
  if (!gym) throw new ApiError(404, "Gym not found");
  const device = gym.kioskDevices.find(
    (d) => d.deviceId === req.body.deviceId && !d.revokedAt,
  );
  if (
    !device ||
    !(await bcrypt.compare(req.body.deviceToken || "", device.tokenHash))
  )
    throw new ApiError(401, "Device authentication failed");
  const athlete = await User.findOne({
    gymId: gym._id,
    roles: "athlete",
    email: req.body.email.toLowerCase(),
  }).select("+kioskPinHash +kioskPinFailures +kioskPinLockedUntil");
  if (!athlete || !athlete.kioskPinHash)
    throw new ApiError(401, "Member kiosk PIN is not configured");
  if (athlete.kioskPinLockedUntil > Date.now())
    throw new ApiError(423, "PIN locked. Try again later");
  if (!(await bcrypt.compare(req.body.pin, athlete.kioskPinHash))) {
    athlete.kioskPinFailures += 1;
    if (athlete.kioskPinFailures >= 5) {
      athlete.kioskPinLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      athlete.kioskPinFailures = 0;
    }
    await athlete.save();
    throw new ApiError(401, "Invalid member credentials");
  }
  if (
    !(await GymMembership.exists({
      gymId: gym._id,
      userId: athlete._id,
      status: "active",
    }))
  )
    throw new ApiError(403, "Active gym membership required");
  athlete.kioskPinFailures = 0;
  athlete.kioskPinLockedUntil = null;
  await athlete.save();
  const expiresAt = new Date(Date.now() + 90000);
  const session = await KioskSession.create({
    gymId: gym._id,
    deviceId: device.deviceId,
    athleteId: athlete._id,
    expiresAt,
  });
  await CheckIn.create({
    gymId: gym._id,
    athleteId: athlete._id,
    source: "kiosk",
  });
  res.json(
    new ApiResponse(
      200,
      { sessionId: session._id, expiresAt, athlete: { name: athlete.name } },
      "Kiosk session started",
    ),
  );
});
export const requireKioskSessionDevice = asyncHandler(
  async (req, res, next) => {
    const session = await KioskSession.findById(req.params.sessionId);
    if (!session || session.expiresAt <= Date.now())
      throw new ApiError(401, "Session expired");
    const gym = await Gym.findById(session.gymId);
    const device = gym?.kioskDevices.find(
      (d) => d.deviceId === session.deviceId && !d.revokedAt,
    );
    const token = req.headers.authorization?.replace("Bearer ", "") || "";
    if (!device || !(await bcrypt.compare(token, device.tokenHash)))
      throw new ApiError(401, "Device authentication failed");
    next();
  },
);
export const kioskSession = asyncHandler(async (req, res) => {
  const s = await KioskSession.findById(req.params.sessionId)
    .populate("athleteId", "name")
    .lean();
  if (!s || s.expiresAt < Date.now())
    throw new ApiError(401, "Session expired");
  const workout = await Workout.findOne({
    athleteId: s.athleteId._id,
    date: {
      $gte: new Date(new Date().setHours(0, 0, 0, 0)),
      $lt: new Date(new Date().setHours(24, 0, 0, 0)),
    },
  }).populate({path:"items.exerciseId",select:"name primaryMuscles",populate:{path:"primaryMuscles",select:"key"}});
  res.json(
    new ApiResponse(
      200,
      { athlete: s.athleteId, workout },
      "Kiosk session fetched",
    ),
  );
});
export const endKioskSession = asyncHandler(async (req, res) => {
  await KioskSession.findByIdAndDelete(req.params.sessionId);
  res.json(new ApiResponse(200, null, "Session ended"));
});
