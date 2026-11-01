import { coachSummaryContext } from '../src/services/ai/aiService.js';
import { WorkoutTemplate } from '../src/models/workoutTemplateModel.js';
import { Exercise } from '../src/models/exerciseModel.js';
import { Muscle } from '../src/models/muscleModel.js';
import { Workout } from '../src/models/workoutModel.js';
import { CoachAthlete } from '../src/models/coachAthleteModel.js';
import { CoachPhoto } from '../src/models/coachPhotoModel.js';
import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/userModel.js';
import { Recovery } from '../src/models/recoveryModel.js';
import { TrainingReview } from '../src/models/trainingReviewModel.js';
import {
  recoveryReadiness,
  completionReview,
} from '../src/services/analytics/recoveryRules.js';
const auth = async (role = 'athlete') => {
  const u = await User.create({
    name: 'Recovery test',
    email: role + '@recovery.test',
    passwordHash: 'Password123!',
    roles: [role],
  });
  return { u, headers: { Authorization: `Bearer ${u.generateAccessToken()}` } };
};
it('keeps missing and stale recovery data distinct', () => {
  expect(recoveryReadiness([]).score).toBeNull();
  expect(
    recoveryReadiness([{ date: '2020-01-01', sleepMinutes: 500 }]).status,
  ).toBe('stale');
  expect(
    recoveryReadiness([
      {
        date: new Date().toISOString().slice(0, 10),
        sleepMinutes: 300,
        fatigue: 9,
        soreness: 8,
      },
    ]).status,
  ).toBe('recover');
});
it('compares assigned sets, repetitions and load without claiming proof', () => {
  const result = completionReview(
    { items: [{ exerciseId: 'squat', sets: 3, reps: 10, targetWeightKg: 20 }] },
    {
      items: [
        {
          exerciseId: 'squat',
          sets: [
            { reps: 10, weightKg: 20 },
            { reps: 8, weightKg: 20 },
          ],
        },
      ],
      painFlag: false,
    },
  );
  expect(result.coverage).toBe(33);
  expect(result.status).toBe('partial');
  expect(result.explanation).toMatch(/do not prove/);
});
it('marks a swim piece met from repeats and distance, not load', () => {
  const result = completionReview(
    {
      items: [
        { kind: 'swim', label: 'Freestyle', sets: 8, distanceM: 100, stroke: 'Freestyle' },
      ],
    },
    {
      items: [{ label: 'Freestyle', kind: 'swim', sets: [{ reps: 8, distanceM: 100 }] }],
      painFlag: false,
    },
  );
  expect(result.coverage).toBe(100);
  expect(result.status).toBe('met');
});
it('persists recovery and queues a durable review on save', async () => {
  const { u, headers } = await auth();
  const res = await request(app)
    .post('/api/v1/performance/daily')
    .set(headers)
    .send({
      date: new Date().toISOString().slice(0, 10),
      sleepMinutes: 430,
      fatigue: 3,
    });
  expect(res.status).toBe(201);
  expect(await Recovery.countDocuments({ athleteId: u._id })).toBe(1);
  expect(
    await TrainingReview.countDocuments({ athleteId: u._id, status: 'queued' }),
  ).toBe(1);
});
it('requires consent for imports and does not accept forged live-watch provenance', async () => {
  const { headers } = await auth();
  const records = [{ date: '2026-10-31', sleepMinutes: 400 }];
  expect(
    (
      await request(app)
        .post('/api/v1/performance/import')
        .set(headers)
        .send({ sourceLabel: 'Watch', records })
    ).status,
  ).toBe(400);
  const accepted = await request(app)
    .post('/api/v1/performance/import')
    .set(headers)
    .send({ consent: true, sourceLabel: 'Watch export', records });
  expect(accepted.status).toBe(200);
  expect((await Recovery.findOne()).source).toBe('import');
});
it('rejects invalid metrics and prevents coach account ingestion', async () => {
  const { headers } = await auth('coach');
  expect(
    (
      await request(app)
        .post('/api/v1/performance/daily')
        .set(headers)
        .send({ date: '2026-10-31', sleepMinutes: 430 })
    ).status,
  ).toBe(403);
});

it('leaves a proposed plan unchanged until its own coach approves, then prevents replay', async () => {
  const athlete = await auth();
  const coach = await auth('coach');
  await CoachAthlete.create({
    coachId: coach.u._id,
    athleteId: athlete.u._id,
    status: 'active',
  });
  const workout = await Workout.create({
    athleteId: athlete.u._id,
    assignedBy: String(coach.u._id),
    date: new Date(),
    title: 'Assigned session',
    items: [{ exerciseId: athlete.u._id, sets: 5, reps: 10 }],
  });
  const review = await TrainingReview.create({
    athleteId: athlete.u._id,
    workoutId: workout._id,
    eventKey: 'test-proposal',
    trigger: 'recovery_updated',
    status: 'ready',
    approval: 'pending',
    analysis: { recommendation: 'reduce' },
    baseWorkoutUpdatedAt: workout.updatedAt,
  });
  expect((await Workout.findById(workout._id)).items[0].sets).toBe(5);
  expect(
    (
      await request(app)
        .post(`/api/v1/performance/reviews/${review._id}/decision`)
        .set(athlete.headers)
        .send({ decision: 'approve' })
    ).status,
  ).toBe(403);
  const approved = await request(app)
    .post(`/api/v1/performance/reviews/${review._id}/decision`)
    .set(coach.headers)
    .send({ decision: 'approve' });
  expect(approved.status).toBe(200);
  expect((await Workout.findById(workout._id)).items[0].sets).toBe(3);
  expect(
    (
      await request(app)
        .post(`/api/v1/performance/reviews/${review._id}/decision`)
        .set(coach.headers)
        .send({ decision: 'approve' })
    ).status,
  ).toBe(409);
});
it('keeps photo content private and rejects invalid image bytes before calling AI', async () => {
  const athlete = await auth();
  const coach = await auth('coach');
  const photo = await CoachPhoto.create({
    athleteId: athlete.u._id,
    mimeType: 'image/jpeg',
    data: Buffer.from([255, 216, 255]),
  });
  expect(
    (
      await request(app)
        .get(`/api/v1/ai/photos/${photo._id}`)
        .set(coach.headers)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post('/api/v1/ai/chat')
        .set(athlete.headers)
        .send({
          message: 'Read this',
          photo: {
            mimeType: 'image/jpeg',
            data: Buffer.from('not an image').toString('base64'),
          },
        })
    ).status,
  ).toBe(400);
});

it('rejects approval if the assigned workout changed after the review', async () => {
  const athlete = await auth();
  const coach = await auth('coach');
  await CoachAthlete.create({
    coachId: coach.u._id,
    athleteId: athlete.u._id,
    status: 'active',
  });
  const workout = await Workout.create({
    athleteId: athlete.u._id,
    assignedBy: String(coach.u._id),
    date: new Date(),
    title: 'Changed session',
    items: [{ exerciseId: athlete.u._id, sets: 5, reps: 10 }],
  });
  const review = await TrainingReview.create({
    athleteId: athlete.u._id,
    workoutId: workout._id,
    eventKey: 'stale-proposal',
    trigger: 'recovery_updated',
    status: 'ready',
    approval: 'pending',
    analysis: { recommendation: 'reduce' },
    baseWorkoutUpdatedAt: new Date(workout.updatedAt.getTime() - 1000),
  });
  const res = await request(app)
    .post(`/api/v1/performance/reviews/${review._id}/decision`)
    .set(coach.headers)
    .send({ decision: 'approve' });
  expect(res.status).toBe(409);
  expect((await Workout.findById(workout._id)).items[0].sets).toBe(5);
});

it('normalizes the actual Fitbit daily-sleep summary response shape', async () => {
  const { headers } = await auth();
  const res = await request(app)
    .post('/api/v1/performance/import/fitbit')
    .set(headers)
    .send({
      consent: true,
      date: '2026-10-31',
      sleep: [{ dateOfSleep: '2026-10-31', minutesAsleep: 444 }],
      summary: { totalMinutesAsleep: 444 },
    });
  expect(res.status).toBe(200);
  expect(res.body.data.sleepMinutes).toBe(444);
  expect(res.body.data.source).toBe('import');
});

it('approves a safe AI week into coach templates without silently scheduling workouts', async () => {
  const athlete = await auth();
  const coach = await auth('coach');
  await CoachAthlete.create({
    coachId: coach.u._id,
    athleteId: athlete.u._id,
    status: 'active',
  });
  const muscle = await Muscle.create({
    key: 'middle-chest',
    displayName: 'Chest',
    group: 'chest',
  });
  const exercise = await Exercise.create({
    name: 'Push-up',
    slug: 'push-up',
    difficulty: 'beginner',
    equipment: ['bodyweight'],
    primaryMuscles: [muscle._id],
  });
  const review = await TrainingReview.create({
    athleteId: athlete.u._id,
    eventKey: 'weekly-draft',
    trigger: 'plan_generated',
    status: 'ready',
    approval: 'pending',
    analysis: {
      recommendation: 'plan',
      draftStart: new Date(Date.now() + 864e5),
      planDraft: [
        {
          day: 0,
          title: 'Draft session',
          items: [
            {
              exerciseId: String(exercise._id),
              sets: 2,
              reps: 10,
              restSec: 90,
            },
          ],
        },
      ],
    },
  });
  const res = await request(app)
    .post(`/api/v1/performance/reviews/${review._id}/decision`)
    .set(coach.headers)
    .send({ decision: 'approve' });
  expect(res.status).toBe(200);
  expect(await WorkoutTemplate.countDocuments({ coachId: coach.u._id })).toBe(
    1,
  );
  expect(await Workout.countDocuments({ athleteId: athlete.u._id })).toBe(0);
});

it('excludes private recovery values and detailed logs from coach AI summary context', () => {
  const context = {
    athlete: { profile: { shareDetailedLogs: false, injuries: 'private injury', goal: 'strength' } },
    logs: [{ date: '2026-10-31', painFlag: false, notes: 'private note', items: [{ sets: [{ reps: 10, weightKg: 73 }] }] }],
    recovery: [{ sleepMinutes: 321, notes: 'private recovery note' }],
    readiness: { score: 50, status: 'steady', fresh: true, reasons: ['Recovery needs attention'], latest: { sleepMinutes: 321 } },
  };
  const result = coachSummaryContext(context);
  expect(result.recovery).toEqual([]);
  expect(result.readiness.latest).toBeUndefined();
  expect(result.logs[0]).toEqual({ date: '2026-10-31', painFlag: false, totalSets: 1 });
  expect(JSON.stringify(result)).not.toMatch(/private|sleepMinutes|weightKg/);
});
