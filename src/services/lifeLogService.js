import { DailyLog } from '../models/dailyLogModel.js';
import { Recovery } from '../models/recoveryModel.js';
import { WorkoutLog } from '../models/workoutLogModel.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const DETAIL_DAYS = 31;
const MAX_SPAN = 366;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const RECOVERY_FIELDS = ['sleepMinutes', 'restingHeartRate', 'hrvMs', 'steps', 'fatigue', 'soreness'];

export function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function parseDay(value) {
  if (typeof value !== 'string' || !DAY.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) return null;
  return value;
}

function addDays(iso, delta) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

function spanDays(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

function labelDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function lifeWindowLabel(from, to) {
  return from === to ? labelDate(from) : `${labelDate(from)} – ${labelDate(to)}`;
}

// Resolves the calendar window an athlete asked about. `from`/`to` win over
// a day count. The end date never sits in the future, and a request longer
// than a year is clipped to the most recent 366 days.
export function resolveLifeWindow({ from, to, days } = {}, today = utcToday()) {
  const endInput = to == null || to === '' ? today : parseDay(to);
  if (!endInput) return { error: 'Use YYYY-MM-DD for the end date.' };
  const end = endInput > today ? today : endInput;

  let start;
  if (from != null && from !== '') {
    start = parseDay(from);
    if (!start) return { error: 'Use YYYY-MM-DD for the start date.' };
  } else {
    const count = days == null ? 14 : Number(days);
    if (!Number.isInteger(count) || count < 1) return { error: 'Ask for a whole number of days, at least 1.' };
    start = addDays(end, -(Math.min(count, MAX_SPAN) - 1));
  }
  if (start > end) return { error: 'The start date is after the end date.' };

  const full = spanDays(start, end);
  const clipped = full > MAX_SPAN;
  if (clipped) start = addDays(end, -(MAX_SPAN - 1));
  return { from: start, to: end, spanDays: spanDays(start, end), clipped, clampedToToday: endInput !== end };
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values, digits = 0) {
  const nums = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (!nums.length) return null;
  return { perLoggedDay: round(nums.reduce((sum, value) => sum + value, 0) / nums.length, digits), days: nums.length };
}

function compact(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value == null || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );
}

function sumKnown(foods, key) {
  const known = foods.filter((food) => food[key] != null);
  if (!known.length) return null;
  return round(known.reduce((sum, food) => sum + food[key], 0));
}

function weekStart(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  const weekday = date.getUTCDay();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

function mergeRecovery(records) {
  const merged = {};
  const ordered = [...records].sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0));
  for (const record of ordered) {
    for (const field of RECOVERY_FIELDS) {
      if (record[field] != null) merged[field] = record[field];
    }
    if (record.notes) merged.notes = String(record.notes).slice(0, 180);
  }
  return merged;
}

function foodLine(food) {
  return compact({
    meal: food.meal,
    name: food.name,
    calories: food.calories,
    proteinG: food.proteinG,
    carbsG: food.carbsG,
    fatG: food.fatG,
  });
}

function dayRecord(date, log, recovery, workouts) {
  const foods = log?.foods || [];
  const shown = foods.slice(0, 15).map(foodLine);
  const duration = workouts.reduce((sum, workout) => sum + (workout.durationMin || 0), 0);
  const efforts = workouts.map((workout) => workout.perceivedEffort).filter((value) => value != null);
  return compact({
    date,
    calories: sumKnown(foods, 'calories'),
    proteinG: sumKnown(foods, 'proteinG'),
    carbsG: sumKnown(foods, 'carbsG'),
    fatG: sumKnown(foods, 'fatG'),
    items: foods.length || null,
    itemsMissingCalories: foods.filter((food) => food.calories == null).length || null,
    moreFoods: foods.length > shown.length ? foods.length - shown.length : null,
    foods: shown,
    waterMl: log?.waterMl > 0 ? log.waterMl : null,
    weightKg: log?.weightKg ?? null,
    mood: log?.mood ?? null,
    energy: log?.energy ?? null,
    stress: log?.stress ?? null,
    note: log?.note ? String(log.note).slice(0, 180) : null,
    sleepHours: recovery.sleepMinutes != null ? round(recovery.sleepMinutes / 60, 1) : null,
    restingHeartRate: recovery.restingHeartRate,
    hrvMs: recovery.hrvMs,
    steps: recovery.steps,
    fatigue: recovery.fatigue,
    soreness: recovery.soreness,
    recoveryNote: recovery.notes,
    sessions: workouts.length || null,
    durationMin: duration || null,
    effort: efforts.length ? round(efforts.reduce((sum, value) => sum + value, 0) / efforts.length, 1) : null,
    pain: workouts.some((workout) => workout.painFlag) || null,
  });
}

function metric(days, pick, digits = 0) {
  return average(days.map(pick), digits);
}

function weekRollup(from, days) {
  const groups = new Map();
  for (const day of days) {
    const start = weekStart(day.date);
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(day);
  }
  return [...groups.entries()].map(([start, entries]) => {
    const end = addDays(start, 6) > from.to ? from.to : addDays(start, 6);
    const weights = entries.filter((day) => day.weightKg != null);
    return compact({
      from: start < from.from ? from.from : start,
      to: end,
      loggedDays: entries.length,
      foodDays: entries.filter((day) => day.items).length,
      avgCalories: metric(entries, (day) => day.calories)?.perLoggedDay,
      avgProteinG: metric(entries, (day) => day.proteinG)?.perLoggedDay,
      avgCarbsG: metric(entries, (day) => day.carbsG)?.perLoggedDay,
      avgFatG: metric(entries, (day) => day.fatG)?.perLoggedDay,
      avgWaterMl: metric(entries, (day) => day.waterMl)?.perLoggedDay,
      avgMood: metric(entries, (day) => day.mood, 1)?.perLoggedDay,
      avgEnergy: metric(entries, (day) => day.energy, 1)?.perLoggedDay,
      avgStress: metric(entries, (day) => day.stress, 1)?.perLoggedDay,
      avgSleepHours: metric(entries, (day) => day.sleepHours, 1)?.perLoggedDay,
      avgSteps: metric(entries, (day) => day.steps)?.perLoggedDay,
      sessions: entries.reduce((sum, day) => sum + (day.sessions || 0), 0) || null,
      weightStart: weights[0]?.weightKg,
      weightEnd: weights.at(-1)?.weightKg,
    });
  });
}

function frequentFoods(logs) {
  const counts = new Map();
  for (const log of logs) {
    for (const food of log.foods || []) {
      const key = food.name.trim().toLowerCase();
      const row = counts.get(key) || { name: food.name.trim(), times: 0, calories: 0, calorieEntries: 0 };
      row.times += 1;
      if (food.calories != null) {
        row.calories += food.calories;
        row.calorieEntries += 1;
      }
      counts.set(key, row);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name))
    .slice(0, 10)
    .map((row) => compact({
      name: row.name,
      times: row.times,
      avgCalories: row.calorieEntries ? round(row.calories / row.calorieEntries) : null,
    }));
}

function cardSummary(averages, weight) {
  const parts = [];
  if (averages.calories) parts.push(`${averages.calories.perLoggedDay.toLocaleString('en-IN')} kcal/day`);
  if (averages.proteinG) parts.push(`${averages.proteinG.perLoggedDay} g protein`);
  if (averages.waterMl) parts.push(`${round(averages.waterMl.perLoggedDay / 1000, 1)} L water`);
  if (weight?.change != null) {
    const sign = weight.change > 0 ? '+' : '';
    parts.push(`${sign}${weight.change} kg`);
  }
  return parts.join(' · ');
}

export async function summarizeLifeLog(athleteId, query) {
  const window = resolveLifeWindow(query);
  if (window.error) return window;

  const { from, to } = window;
  const [logs, recovery, workouts] = await Promise.all([
    DailyLog.find({ athleteId, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean(),
    Recovery.find({ athleteId, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean(),
    WorkoutLog.find({
      athleteId,
      date: { $gte: new Date(`${from}T00:00:00.000Z`), $lte: new Date(`${to}T23:59:59.999Z`) },
    })
      .select('date durationMin perceivedEffort painFlag')
      .lean(),
  ]);

  const recoveryByDay = new Map();
  for (const record of recovery) {
    if (!recoveryByDay.has(record.date)) recoveryByDay.set(record.date, []);
    recoveryByDay.get(record.date).push(record);
  }
  const workoutsByDay = new Map();
  for (const workout of workouts) {
    const key = new Date(workout.date).toISOString().slice(0, 10);
    if (key < from || key > to) continue;
    if (!workoutsByDay.has(key)) workoutsByDay.set(key, []);
    workoutsByDay.get(key).push(workout);
  }
  const logByDay = new Map(logs.map((log) => [log.date, log]));

  const dates = [...new Set([...logByDay.keys(), ...recoveryByDay.keys(), ...workoutsByDay.keys()])].sort();
  const entries = dates.map((date) =>
    dayRecord(date, logByDay.get(date), mergeRecovery(recoveryByDay.get(date) || []), workoutsByDay.get(date) || []),
  );

  const weights = entries.filter((day) => day.weightKg != null);
  const weight = weights.length
    ? compact({
        first: weights[0].weightKg,
        firstDate: weights[0].date,
        last: weights.at(-1).weightKg,
        lastDate: weights.at(-1).date,
        change: weights.length > 1 ? round(weights.at(-1).weightKg - weights[0].weightKg, 1) : null,
      })
    : null;

  const averages = compact({
    calories: metric(entries, (day) => day.calories),
    proteinG: metric(entries, (day) => day.proteinG),
    carbsG: metric(entries, (day) => day.carbsG),
    fatG: metric(entries, (day) => day.fatG),
    waterMl: metric(entries, (day) => day.waterMl),
    mood: metric(entries, (day) => day.mood, 1),
    energy: metric(entries, (day) => day.energy, 1),
    stress: metric(entries, (day) => day.stress, 1),
    sleepHours: metric(entries, (day) => day.sleepHours, 1),
    restingHeartRate: metric(entries, (day) => day.restingHeartRate),
    hrvMs: metric(entries, (day) => day.hrvMs),
    steps: metric(entries, (day) => day.steps),
    fatigue: metric(entries, (day) => day.fatigue, 1),
    soreness: metric(entries, (day) => day.soreness, 1),
  });

  const summary = {
    from,
    to,
    label: lifeWindowLabel(from, to),
    spanDays: window.spanDays,
    loggedDays: entries.length,
    foodDays: entries.filter((day) => day.items).length,
    clippedToOneYear: window.clipped || undefined,
    averages,
    weightKg: weight,
    training: {
      sessions: workouts.length,
      days: [...workoutsByDay.keys()].length,
      painFlags: workouts.filter((workout) => workout.painFlag).length,
    },
    frequentFoods: frequentFoods(logs),
    caveat:
      'Averages use only days where that measurement was logged. Foods without a calorie or macro number are left out of that total. Water of 0 ml counts as not logged. Do not invent numbers for empty days.',
  };
  if (window.spanDays <= DETAIL_DAYS) {
    summary.entries = entries;
  } else {
    summary.weeks = weekRollup(window, entries);
    const recentFrom = addDays(to, -6);
    summary.recentEntries = entries.filter((day) => day.date >= recentFrom);
  }
  summary.cardLine = cardSummary(averages, weight);
  return summary;
}
