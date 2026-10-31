import { enforcePlanSafety } from "../src/services/ai/planSafety.js";
const exercise = {
  _id: "squat",
  difficulty: "beginner",
  equipment: ["barbell"],
  primaryMuscles: [{ group: "legs" }],
};
const context = {
  athlete: {
    profile: {
      experienceLevel: "beginner",
      trainingDaysPerWeek: 7,
      equipmentAccess: ["barbell"],
    },
  },
  exercises: [exercise],
  logs: [],
};
const plan = {
  workouts: Array.from({ length: 7 }, (_, day) => ({
    day,
    title: "Leg day",
    items: [{ exerciseId: "squat", sets: 8, reps: 10, restSec: 90 }],
  })),
};
it("caps beginner volume, leaves rest days and prevents consecutive group training", () => {
  const result = enforcePlanSafety(plan, context);
  expect(result.workouts.length).toBeLessThan(7);
  expect(
    result.workouts.flatMap((w) => w.items).reduce((n, i) => n + i.sets, 0),
  ).toBeLessThanOrEqual(4);
  for (let i = 1; i < result.workouts.length; i++)
    expect(result.workouts[i].day - result.workouts[i - 1].day).toBeGreaterThan(
      1,
    );
});
it("limits progression from recent volume and adds pain advice", () => {
  const logs = [
    {
      date: new Date(),
      painFlag: true,
      items: [{ exerciseId: "squat", sets: [{}, {}] }],
    },
  ];
  const result = enforcePlanSafety(plan, { ...context, logs });
  expect(
    result.workouts.flatMap((w) => w.items).reduce((n, i) => n + i.sets, 0),
  ).toBeLessThanOrEqual(2);
  expect(result.painNotice).toMatch(/physiotherapist/);
});
it("excludes unknown exercises, advanced beginner exercises and unavailable equipment", () => {
  expect(
    enforcePlanSafety(plan, { ...context, exercises: [] }).workouts,
  ).toEqual([]);
  expect(
    enforcePlanSafety(plan, {
      ...context,
      exercises: [{ ...exercise, difficulty: "advanced" }],
    }).workouts,
  ).toEqual([]);
  expect(
    enforcePlanSafety(plan, {
      ...context,
      athlete: { profile: { ...context.athlete.profile, equipmentAccess: [] } },
    }).workouts,
  ).toEqual([]);
});
