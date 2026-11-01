import { WorkoutLog } from '../../models/workoutLogModel.js';
import { Exercise } from '../../models/exerciseModel.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Heaviest single set ever logged per exercise. */
export const getPersonalBests = async (athleteId) => {
  const logs = await WorkoutLog.find({ athleteId }).lean();
  const bestByExercise = new Map();

  for (const log of logs) {
    for (const item of log.items) {
      if (!item.exerciseId) continue;
      const key = String(item.exerciseId);
      const maxWeight = Math.max(0, ...item.sets.map((s) => s.weightKg || 0));
      const current = bestByExercise.get(key);
      if (!current || maxWeight > current.weightKg) {
        bestByExercise.set(key, { weightKg: maxWeight, date: log.date });
      }
    }
  }

  const exerciseIds = [...bestByExercise.keys()];
  const exercises = await Exercise.find({ _id: { $in: exerciseIds } }).select('name slug').lean();
  const exerciseById = new Map(exercises.map((ex) => [String(ex._id), ex]));

  return exerciseIds
    .map((id) => ({
      exercise: exerciseById.get(id) ? { name: exerciseById.get(id).name, slug: exerciseById.get(id).slug } : null,
      ...bestByExercise.get(id),
    }))
    .filter((entry) => entry.exercise && entry.weightKg > 0)
    .sort((a, b) => b.weightKg - a.weightKg);
};

/** Sessions/week and longest consecutive-day streak over the last N weeks. */
export const getAttendance = async (athleteId, weeks = 8) => {
  const since = new Date(Date.now() - weeks * 7 * DAY_MS);
  const logs = await WorkoutLog.find({ athleteId, date: { $gte: since } }).sort({ date: 1 }).lean();

  const dayKeys = [...new Set(logs.map((log) => new Date(log.date).toISOString().slice(0, 10)))].sort();

  let longestStreak = 0;
  let currentStreak = 0;
  let previousDay = null;
  for (const dayKey of dayKeys) {
    const day = new Date(dayKey).getTime();
    if (previousDay !== null && day - previousDay === DAY_MS) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
    }
    longestStreak = Math.max(longestStreak, currentStreak);
    previousDay = day;
  }

  const sessionsPerWeek = Math.round((dayKeys.length / weeks) * 10) / 10;
  return { sessionsPerWeek, longestStreak, totalSessions: dayKeys.length };
};

/** Current day-streak (consecutive days up to and including the most recent
 * log) and days since the athlete's last completed workout. */
export const getCurrentStreak = async (athleteId) => {
  const logs = await WorkoutLog.find({ athleteId }).sort({ date: -1 }).limit(60).lean();
  if (logs.length === 0) return { currentStreak: 0, daysSinceLastWorkout: null };

  const dayKeys = [...new Set(logs.map((log) => new Date(log.date).toISOString().slice(0, 10)))].sort().reverse();
  const today = new Date().toISOString().slice(0, 10);
  const daysSinceLastWorkout = Math.floor(
    (new Date(today).getTime() - new Date(dayKeys[0]).getTime()) / DAY_MS
  );

  let streak = 0;
  let cursor = new Date(dayKeys[0]).getTime();
  for (const dayKey of dayKeys) {
    const day = new Date(dayKey).getTime();
    if (day === cursor) {
      streak += 1;
      cursor -= DAY_MS;
    } else {
      break;
    }
  }

  return { currentStreak: daysSinceLastWorkout > 1 ? 0 : streak, daysSinceLastWorkout };
};
