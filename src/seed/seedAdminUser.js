import { User } from '../models/userModel.js';
import { config } from '../config/env.js';

export const seedAdminUser = async () => {
  const existingAdmin = await User.findOne({ email: config.ADMIN_SEED_EMAIL });
  if (existingAdmin) {
    console.log('  • Admin user already exists, skipping');
    return existingAdmin;
  }

  const admin = await User.create({
    name: 'Rhythm Admin',
    email: config.ADMIN_SEED_EMAIL,
    passwordHash: config.ADMIN_SEED_PASSWORD,
    roles: ['admin'],
  });
  console.log(`  ✓ Seeded admin user (${config.ADMIN_SEED_EMAIL})`);
  return admin;
};
