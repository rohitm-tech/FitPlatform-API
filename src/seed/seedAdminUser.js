import { User } from '../models/userModel.js';
import { config } from '../config/env.js';
import { DEMO_ADMIN_NAME, upsertDemoUser } from './demoPeople.js';

export const seedAdminUser = async () => {
  const existed = await User.exists({ email: config.ADMIN_SEED_EMAIL });
  const admin = await upsertDemoUser({
    name: DEMO_ADMIN_NAME,
    email: config.ADMIN_SEED_EMAIL,
    passwordHash: config.ADMIN_SEED_PASSWORD,
    roles: ['admin'],
  });
  console.log(
    existed
      ? '  • Admin user already exists, skipping'
      : `  ✓ Seeded admin user (${config.ADMIN_SEED_EMAIL})`,
  );
  return admin;
};
