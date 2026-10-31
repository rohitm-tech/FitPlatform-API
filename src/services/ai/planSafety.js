// Deterministic limits apply equally to generated and fallback plans.
export function enforcePlanSafety(plan, context, now = Date.now()) {
  const beginner = context.athlete.profile.experienceLevel === "beginner";
  const recent = context.logs.filter(
    (l) => new Date(l.date).getTime() >= now - 7 * 864e5,
  );
  const pain = recent.some((l) => l.painFlag);
  const library = new Map(context.exercises.map((e) => [String(e._id), e]));
  const groups = (e) => [
    ...new Set((e.primaryMuscles || []).map((m) => m.group || String(m))),
  ];
  const baseline = {};
  for (const log of recent)
    for (const item of log.items) {
      const e = library.get(String(item.exerciseId?._id || item.exerciseId));
      if (e)
        for (const g of groups(e))
          baseline[g] = (baseline[g] || 0) + item.sets.length;
    }
  const totals = {},
    previous = {};
  const usedDays = new Set();
  const workouts = [];
  for (const w of [...plan.workouts].sort((a, b) => a.day - b.day)) {
    if (
      usedDays.has(w.day) ||
      workouts.length >=
        Math.min(6, context.athlete.profile.trainingDaysPerWeek || 3)
    )
      continue;
    const items = [];
    for (const item of w.items) {
      const ex = library.get(String(item.exerciseId));
      if (!ex || (beginner && ex.difficulty === "advanced")) continue;
      const equipment = context.athlete.profile.equipmentAccess || [];
      if (
        (ex.equipment || []).some(
          (e) => !["bodyweight", "none"].includes(e) && !equipment.includes(e),
        )
      )
        continue;
      const gs = groups(ex);
      if (gs.some((g) => previous[g] === w.day - 1)) continue;
      let sets = Math.min(item.sets, beginner ? 3 : 6);
      if (pain) sets = Math.max(1, Math.floor(sets * 0.7));
      for (const g of gs) {
        const cap = baseline[g]
          ? Math.floor(baseline[g] * 1.1)
          : beginner
            ? 4
            : 6;
        sets = Math.min(sets, cap - (totals[g] || 0));
      }
      if (sets < 1) continue;
      items.push({
        ...item,
        sets,
        targetWeightKg: null,
        notes: [
          item.notes,
          pain
            ? "Use light effort. Consider seeing a doctor or physiotherapist."
            : null,
        ]
          .filter(Boolean)
          .join(" "),
      });
      for (const g of gs) {
        totals[g] = (totals[g] || 0) + sets;
        previous[g] = w.day;
      }
    }
    if (items.length) {
      usedDays.add(w.day);
      workouts.push({ ...w, items });
    }
  }
  return {
    workouts,
    painNotice: pain
      ? "Consider seeing a doctor or physiotherapist about pain."
      : null,
  };
}
