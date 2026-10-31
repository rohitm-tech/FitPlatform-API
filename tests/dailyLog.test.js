import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/userModel.js';
import { DailyLog } from '../src/models/dailyLogModel.js';

const today = new Date().toISOString().slice(0, 10);

async function signedIn(role = 'athlete', email = `${role}@dailylog.test`) {
  const user = await User.create({ name: 'Daily log', email, passwordHash: 'Password123!', roles: [role] });
  return { user, headers: { Authorization: `Bearer ${user.generateAccessToken()}` } };
}

it('logs food, water, weight and mood on one day', async () => {
  const { user, headers } = await signedIn();
  const base = `/api/v1/daily-log/${today}`;

  const food = await request(app)
    .post(`${base}/foods`)
    .set(headers)
    .send({ meal: 'breakfast', name: 'Oats with milk', calories: 380, proteinG: 18 });
  expect(food.status).toBe(201);
  expect(food.body.data.foods).toHaveLength(1);

  await request(app).post(`${base}/water`).set(headers).send({ ml: 500 }).expect(200);
  const water = await request(app).post(`${base}/water`).set(headers).send({ ml: 250 });
  expect(water.body.data.waterMl).toBe(750);
  const drained = await request(app).post(`${base}/water`).set(headers).send({ ml: -5000 });
  expect(drained.body.data.waterMl).toBe(0);

  const body = await request(app).patch(base).set(headers).send({ weightKg: 72.4, mood: 4, energy: 3 });
  expect(body.status).toBe(200);
  expect(body.body.data.weightKg).toBe(72.4);
  expect(body.body.data.foods).toHaveLength(1);

  const list = await request(app).get('/api/v1/daily-log?days=7').set(headers);
  expect(list.body.data.logs).toHaveLength(1);
  expect(await DailyLog.countDocuments({ athleteId: user._id })).toBe(1);

  const foodId = food.body.data.foods[0]._id;
  const removed = await request(app).delete(`${base}/foods/${foodId}`).set(headers);
  expect(removed.body.data.foods).toHaveLength(0);
});

it('rejects bad days, empty saves and other athletes’ entries', async () => {
  const { headers } = await signedIn();
  const other = await signedIn('athlete', 'other@dailylog.test');
  await request(app).patch('/api/v1/daily-log/2026-02-31').set(headers).send({ mood: 3 }).expect(400);
  await request(app).patch('/api/v1/daily-log/2999-01-01').set(headers).send({ mood: 3 }).expect(400);
  await request(app).patch(`/api/v1/daily-log/${today}`).set(headers).send({}).expect(400);
  await request(app).patch(`/api/v1/daily-log/${today}`).set(headers).send({ mood: 9 }).expect(400);

  const food = await request(app)
    .post(`/api/v1/daily-log/${today}/foods`)
    .set(headers)
    .send({ meal: 'lunch', name: 'Rice and dal', calories: 520 });
  const foodId = food.body.data.foods[0]._id;
  await request(app).delete(`/api/v1/daily-log/${today}/foods/${foodId}`).set(other.headers).expect(404);

  const coach = await signedIn('coach');
  await request(app).get('/api/v1/daily-log').set(coach.headers).expect(403);
  await request(app).get('/api/v1/daily-log').expect(401);
});
