import mongoose from 'mongoose';
import { User } from '../src/models/userModel.js';
import { DailyLog } from '../src/models/dailyLogModel.js';
import { Recovery } from '../src/models/recoveryModel.js';
import { WorkoutLog } from '../src/models/workoutLogModel.js';
import { buildCoachTools } from '../src/services/ai/agent/tools.js';

const day = (iso, delta) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);

async function athlete(email) {
  return User.create({ name: 'Life log', email, passwordHash: 'Password123!', roles: ['athlete'] });
}

function coachTool(athleteId) {
  const trace = [];
  const cards = [];
  const tools = Object.fromEntries(buildCoachTools(athleteId, trace, cards).map((item) => [item.name, item]));
  return { tool: tools.review_life_log, trace, cards, run: (args) => tools.review_life_log.invoke(args) };
}

it('answers from this athlete’s food, body, recovery and training in the asked window', async () => {
  const user = await athlete('life@log.test');
  const other = await athlete('other@log.test');
  await DailyLog.create({
    athleteId: user._id,
    date: '2026-10-01',
    foods: [
      { meal: 'breakfast', name: 'Oats with milk', calories: 380, proteinG: 18 },
      { meal: 'snack', name: 'Banana' },
    ],
    waterMl: 750,
    weightKg: 72.4,
    mood: 4,
    note: 'Travel day, ate late',
  });
  await DailyLog.create({
    athleteId: user._id,
    date: '2026-10-03',
    foods: [{ meal: 'lunch', name: 'Rice and dal', calories: 500, proteinG: 16, carbsG: 70, fatG: 12 }],
    waterMl: 0,
    weightKg: 71.8,
    energy: 3,
  });
  await DailyLog.create({
    athleteId: other._id,
    date: '2026-10-01',
    foods: [{ meal: 'dinner', name: 'Secret cake', calories: 9000 }],
  });
  await Recovery.create({ athleteId: user._id, date: '2026-10-01', source: 'manual', sleepMinutes: 420, fatigue: 3, notes: 'Woke once' });
  await Recovery.create({ athleteId: user._id, date: '2026-10-01', source: 'import', sleepMinutes: 480, restingHeartRate: 58 });
  await WorkoutLog.create({
    athleteId: user._id,
    date: new Date('2026-10-03T08:00:00Z'),
    durationMin: 45,
    perceivedEffort: 7,
    items: [{ exerciseId: new mongoose.Types.ObjectId(), sets: [{ reps: 8, weightKg: 40 }] }],
  });

  const { run, cards, trace } = coachTool(user._id);
  const summary = JSON.parse(await run({ from: '2026-10-01', to: '2026-10-03' }));

  expect(summary.spanDays).toBe(3);
  expect(summary.loggedDays).toBe(2);
  expect(summary.foodDays).toBe(2);
  expect(summary.entries.map((entry) => entry.date)).toEqual(['2026-10-01', '2026-10-03']);
  expect(summary.averages.calories).toEqual({ perLoggedDay: 440, days: 2 });
  expect(summary.entries[0].itemsMissingCalories).toBe(1);
  expect(summary.averages.proteinG).toEqual({ perLoggedDay: 17, days: 2 });
  expect(summary.averages.waterMl).toEqual({ perLoggedDay: 750, days: 1 });
  expect(summary.averages.carbsG).toEqual({ perLoggedDay: 70, days: 1 });
  expect(summary.weightKg).toMatchObject({ first: 72.4, last: 71.8, change: -0.6 });
  expect(summary.averages.sleepHours).toEqual({ perLoggedDay: 8, days: 1 });
  expect(summary.averages.fatigue).toEqual({ perLoggedDay: 3, days: 1 });
  expect(summary.averages.restingHeartRate).toEqual({ perLoggedDay: 58, days: 1 });
  expect(summary.entries[0].recoveryNote).toBe('Woke once');
  expect(summary.training).toEqual({ sessions: 1, days: 1, painFlags: 0 });
  expect(summary.entries[1]).toMatchObject({ sessions: 1, durationMin: 45, effort: 7 });
  expect(JSON.stringify(summary)).not.toMatch(/Secret cake|9000/);
  expect(summary.weeks).toBeUndefined();

  expect(cards[0]).toMatchObject({
    type: 'life',
    headline: '2 of 3 days logged',
    summary: '440 kcal/day · 17 g protein · 0.8 L water · -0.6 kg',
    href: '/athlete#dash-daylog-title',
  });
  expect(trace[0]).toMatchObject({ tool: 'review_life_log', status: 'done' });
  expect(trace[0].label).toMatch(/2 days with food, 440 kcal\/day/);
});

it('keeps a short lookback to recent days and rolls a long stretch into weeks', async () => {
  const user = await athlete('span@log.test');
  const today = new Date().toISOString().slice(0, 10);
  await DailyLog.create({
    athleteId: user._id,
    date: today,
    foods: [{ meal: 'breakfast', name: 'Idli', calories: 200 }],
  });
  await DailyLog.create({
    athleteId: user._id,
    date: day(today, -40),
    foods: [{ meal: 'dinner', name: 'Old biryani', calories: 800 }],
  });

  const recent = coachTool(user._id);
  const week = JSON.parse(await recent.run({ days: 7 }));
  expect(week.entries.map((entry) => entry.foods[0].name)).toEqual(['Idli']);
  expect(JSON.stringify(week)).not.toMatch(/Old biryani/);

  await DailyLog.create({
    athleteId: user._id,
    date: '2026-08-01',
    foods: [{ meal: 'breakfast', name: 'Idli', calories: 180 }],
  });
  await DailyLog.create({
    athleteId: user._id,
    date: '2026-08-20',
    foods: [{ meal: 'breakfast', name: 'Idli', calories: 220 }],
  });
  await DailyLog.create({
    athleteId: user._id,
    date: '2026-09-05',
    foods: [{ meal: 'lunch', name: 'Rice', calories: 400 }],
  });
  const long = coachTool(user._id);
  const months = JSON.parse(await long.run({ from: '2026-08-01', to: '2026-09-10' }));
  expect(months.spanDays).toBe(41);
  expect(months.entries).toBeUndefined();
  expect(months.weeks.length).toBeGreaterThan(1);
  expect(months.recentEntries.map((entry) => entry.date)).toEqual(['2026-09-05']);
  expect(months.frequentFoods[0]).toMatchObject({ name: 'Idli', times: 2, avgCalories: 200 });
});

it('refuses a date the calendar does not have', async () => {
  const user = await athlete('baddate@log.test');
  const { run, cards } = coachTool(user._id);
  const result = await run({ from: '2026-02-31', to: '2026-03-02' });
  expect(result).toMatch(/YYYY-MM-DD/);
  expect(cards).toHaveLength(0);
});
