import { User } from "../src/models/userModel.js";
import { Gym } from "../src/models/gymModel.js";
import { seedGymAndStaff } from "../src/seed/seedGymAndStaff.js";
import { seedAdminUser } from "../src/seed/seedAdminUser.js";
import { DEMO_ATHLETE_NAMES } from "../src/seed/demoPeople.js";

it("gives every seeded person an Indian name and renames old placeholders, but keeps edited names", async () => {
  await User.create({ name: "Athlete 3", email: "athlete3@fitplatform.app", passwordHash: "Athlete1234!", roles: ["athlete"] });
  await User.create({ name: "Kiran Rao", email: "athlete4@fitplatform.app", passwordHash: "Athlete1234!", roles: ["athlete"] });
  await User.create({ name: "Marcus Lee", email: "coach1@fitplatform.app", passwordHash: "Coach1234!", roles: ["coach"] });
  await User.create({ name: "Rhythm Admin", email: "admin@fitplatform.app", passwordHash: "ChangeMe123!", roles: ["admin"] });

  await seedAdminUser();
  await seedGymAndStaff();

  const byEmail = Object.fromEntries((await User.find().lean()).map((u) => [u.email, u.name]));
  expect(byEmail["athlete3@fitplatform.app"]).toBe("Vihaan Reddy");
  expect(byEmail["athlete4@fitplatform.app"]).toBe("Kiran Rao");
  expect(byEmail["coach1@fitplatform.app"]).toBe("Manish Chauhan");
  expect(byEmail["coach2@fitplatform.app"]).toBe("Shalini Menon");
  expect(byEmail["admin@fitplatform.app"]).toBe("Rajiv Bhatia");
  expect(byEmail["athlete1@fitplatform.app"]).toBe("Aarav Sharma");
  expect(Object.values(byEmail).some((name) => /^Athlete \d+$/.test(name))).toBe(false);
  expect(new Set(DEMO_ATHLETE_NAMES).size).toBe(DEMO_ATHLETE_NAMES.length);
  expect((await Gym.findOne().lean()).address).toBe("12th Main Road, Indiranagar, Bengaluru");
});
