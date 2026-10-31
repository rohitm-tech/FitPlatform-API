import mongoose from 'mongoose';
import { connectDatabase } from '../database/connectDatabase.js';
import { seedAdminUser } from './seedAdminUser.js';
import { seedGymAndStaff } from './seedGymAndStaff.js';
import { seedCoachAthleteLinks } from './seedCoachAthleteLinks.js';
import { seedMuscles } from './seedMuscles.js';
import { seedExercises } from './seedExercises.js';
import { seedWorkoutLogs } from './seedWorkoutLogs.js';

const run = async () => {
  console.log('🌱 Seeding FitPlatform database...\n');
  await connectDatabase();

  await seedAdminUser();
  const { coaches, athletes } = await seedGymAndStaff();
  await seedCoachAthleteLinks(coaches, athletes);
  const muscleMap = await seedMuscles();
  await seedExercises(muscleMap);
  await seedWorkoutLogs(athletes);

  console.log('\n✅ Seeding complete');
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((error) => {
  console.error('❌ Seeding failed:', error);
  process.exit(1);
});
