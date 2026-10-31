import { WorkoutLog } from '../../models/workoutLogModel.js';
import { Exercise } from '../../models/exerciseModel.js';
import { Muscle } from '../../models/muscleModel.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// All pure-code analytics (no AI) per spec: sets-per-muscle-group, neglected
// groups, and a weekly volume trend. Gemini only touches phrasing/plans —
// never these numbers.

const buildExerciseMuscleMap = async () => {
  const exercises = await Exercise.find().populate('primaryMuscles', 'key group').lean();
  const map = new Map();
  for (const ex of exercises) {
    map.set(String(ex._id), [...new Map(ex.primaryMuscles.map(m => [m.group, {key:m.key,group:m.group}])).values()]);
  }
  return map;
};

/** Sets per muscle group for the last `days` days. */
export const getMuscleGroupVolume = async (athleteId, days) => {
  const since = new Date(Date.now() - days * DAY_MS);
  const logs = await WorkoutLog.find({ athleteId, date: { $gte: since } }).lean();
  const exerciseMuscles = await buildExerciseMuscleMap();

  const volumeByGroup = {};
  for (const log of logs) {
    for (const item of log.items) {
      const muscles = exerciseMuscles.get(String(item.exerciseId)) || [];
      for (const muscle of muscles) {
        volumeByGroup[muscle.group] = (volumeByGroup[muscle.group] || 0) + item.sets.length;
      }
    }
  }
  return volumeByGroup;
};

/** Days since each muscle group was last trained, for "neglected" callouts. */
export const getNeglectedMuscleGroups = async (athleteId, thresholdDays = 5) => {
  const allMuscles = await Muscle.find().select('group').lean();
  const allGroups = [...new Set(allMuscles.map((m) => m.group))];

  const logs = await WorkoutLog.find({ athleteId }).sort({ date: -1 }).limit(200).lean();
  const exerciseMuscles = await buildExerciseMuscleMap();

  const lastTrainedAt = {};
  for (const log of logs) {
    for (const item of log.items) {
      const muscles = exerciseMuscles.get(String(item.exerciseId)) || [];
      for (const muscle of muscles) {
        if (!lastTrainedAt[muscle.group] || log.date > lastTrainedAt[muscle.group]) {
          lastTrainedAt[muscle.group] = log.date;
        }
      }
    }
  }

  const now = Date.now();
  return allGroups
    .map((group) => {
      const lastDate = lastTrainedAt[group];
      const daysSince = lastDate ? Math.floor((now - new Date(lastDate).getTime()) / DAY_MS) : null;
      return { group, daysSinceTrained: daysSince };
    })
    .filter((entry) => entry.daysSinceTrained === null || entry.daysSinceTrained >= thresholdDays)
    .sort((a, b) => (b.daysSinceTrained ?? 999) - (a.daysSinceTrained ?? 999));
};

/** Weekly set-volume per muscle group over the last `weeks` weeks. */
export const getWeeklyVolumeTrend = async (athleteId, weeks = 6) => {
  const since = new Date(Date.now() - weeks * 7 * DAY_MS);
  const logs = await WorkoutLog.find({ athleteId, date: { $gte: since } }).lean();
  const exerciseMuscles = await buildExerciseMuscleMap();

  const weekBuckets = Array.from({ length: weeks }, () => ({}));
  for (const log of logs) {
    const weeksAgo = Math.floor((Date.now() - new Date(log.date).getTime()) / (7 * DAY_MS));
    const bucketIndex = weeks - 1 - weeksAgo;
    if (bucketIndex < 0 || bucketIndex >= weeks) continue;

    for (const item of log.items) {
      const muscles = exerciseMuscles.get(String(item.exerciseId)) || [];
      for (const muscle of muscles) {
        weekBuckets[bucketIndex][muscle.group] = (weekBuckets[bucketIndex][muscle.group] || 0) + item.sets.length;
      }
    }
  }
  return weekBuckets;
};
