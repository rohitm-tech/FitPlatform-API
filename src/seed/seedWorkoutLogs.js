import { Workout } from '../models/workoutModel.js';
import { WorkoutLog } from '../models/workoutLogModel.js';
import { CheckIn } from '../models/checkInModel.js';
import { Exercise } from '../models/exerciseModel.js';
import { User } from '../models/userModel.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 6;

const pick = (arr, n) => {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
};

// 6 weeks of planned + actual workout history per athlete, with skipped
// days, one inactive member (athlete10, whose membership is already seeded
// as expired), and one pain flag — so dashboards/insights have real data
// from day one. Builds workouts/sets from the real Exercise library, so it
// must run after seedExercises.
export const seedWorkoutLogs = async (athletes) => {
  const alreadySeeded = await Workout.exists({});
  if (alreadySeeded) {
    console.log('  • Workout history already exists, skipping');
    return;
  }

  const exercises = await Exercise.find({ type: 'strength' }).limit(40);
  if (exercises.length === 0) {
    console.log('  • No exercises found, skipping workout log seed');
    return;
  }

  const today = new Date();
  today.setHours(9, 0, 0, 0);
  let totalWorkouts = 0;
  let totalLogs = 0;
  let totalCheckIns = 0;

  for (let a = 0; a < athletes.length; a += 1) {
    const athlete = athletes[a];
    const isInactive = a === 9; // athlete10 — matches the 'expired' gym membership
    const daysPerWeek = isInactive ? 1 : athlete.profile?.trainingDaysPerWeek || 3;
    const gymId = athlete.gymId;

    for (let week = 0; week < WEEKS; week += 1) {
      if (isInactive && week > 1) break; // went inactive ~4 weeks ago

      const trainingDays = pick([1, 2, 3, 4, 5, 6, 0], daysPerWeek).sort((x, y) => x - y);
      for (const dayOfWeek of trainingDays) {
        const daysAgo = week * 7 + (6 - dayOfWeek);
        const date = new Date(today.getTime() - daysAgo * DAY_MS);
        if (date > today) continue;

        const workoutExercises = pick(exercises, 4 + Math.floor(Math.random() * 2));
        const status = Math.random() < 0.85 ? 'completed' : 'skipped';

        const workout = await Workout.create({
          athleteId: athlete._id,
          assignedBy: 'ai',
          date,
          title: `Training day — week ${WEEKS - week}`,
          items: workoutExercises.map((ex) => ({
            exerciseId: ex._id,
            sets: 3,
            reps: 10,
            targetWeightKg: 20 + Math.floor(Math.random() * 40),
            restSec: 60,
          })),
          status,
        });
        totalWorkouts += 1;

        if (status === 'completed') {
          const isPainDay = a === 2 && week === 0 && dayOfWeek === trainingDays[0];
          await WorkoutLog.create({
            athleteId: athlete._id,
            workoutId: workout._id,
            date,
            items: workout.items.map((item) => ({
              exerciseId: item.exerciseId,
              sets: Array.from({ length: item.sets }, () => ({
                reps: item.reps - Math.floor(Math.random() * 2),
                weightKg: item.targetWeightKg,
              })),
            })),
            durationMin: 35 + Math.floor(Math.random() * 25),
            perceivedEffort: 5 + Math.floor(Math.random() * 5),
            painFlag: isPainDay,
            notes: isPainDay ? 'Felt a twinge in the lower back on the last set.' : '',
            source: 'app',
          });
          totalLogs += 1;

          if (gymId) {
            await CheckIn.create({ athleteId: athlete._id, gymId, timestamp: date, source: 'app' });
            totalCheckIns += 1;
          }
        }
      }
    }
  }

  console.log(`  ✓ Seeded ${totalWorkouts} workouts, ${totalLogs} logs, ${totalCheckIns} check-ins (6 weeks)`);
};
