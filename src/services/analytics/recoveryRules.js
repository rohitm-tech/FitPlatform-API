export function recoveryReadiness(records, now = Date.now()) {
  const latest = [...records].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      new Date(b.updatedAt) - new Date(a.updatedAt),
  )[0];
  if (!latest)
    return {
      score: null,
      status: 'missing',
      reasons: ['Add a recovery check-in or import wearable data.'],
      fresh: false,
    };
  const fresh =
    now - new Date(latest.date + 'T00:00:00Z').getTime() < 48 * 3600000;
  const reasons = [];
  let score = 100,
    signals = 0;
  if (latest.sleepMinutes != null) {
    signals++;
    if (latest.sleepMinutes < 360) {
      score -= 35;
      reasons.push('Less than 6 hours of sleep recorded.');
    } else if (latest.sleepMinutes < 420) {
      score -= 15;
      reasons.push('Sleep is below the 7-hour training baseline.');
    }
  }
  for (const [field, label] of [
    ['fatigue', 'Fatigue'],
    ['soreness', 'Soreness'],
  ])
    if (latest[field] != null) {
      signals++;
      score -= Math.max(0, latest[field] - 3) * 5;
      if (latest[field] >= 7) reasons.push(`${label} is elevated.`);
    }
  const previous = records
    .filter((r) => r.date < latest.date && r.restingHeartRate != null)
    .slice(0, 14);
  if (latest.restingHeartRate != null && previous.length >= 3) {
    signals++;
    const baseline =
      previous.reduce((n, r) => n + r.restingHeartRate, 0) / previous.length;
    if (latest.restingHeartRate > baseline + 7) {
      score -= 15;
      reasons.push('Resting heart rate is above your recent baseline.');
    }
  }
  if (!signals)
    return {
      score: null,
      status: 'insufficient',
      fresh,
      reasons: ['More recovery signals are needed.'],
      latest,
    };
  if (!fresh)
    return {
      score: null,
      status: 'stale',
      fresh,
      reasons: ['Latest recovery data is over 48 hours old.'],
      latest,
    };
  score = Math.max(0, Math.round(score));
  return {
    score,
    status: score < 50 ? 'recover' : score < 75 ? 'steady' : 'ready',
    fresh,
    reasons: reasons.length
      ? reasons
      : ['Available signals support your planned training.'],
    latest,
    method: 'Training-readiness heuristic, not a medical assessment',
  };
}
function pieceLogged(planned, result) {
  if (!result) return false;
  if (planned.kind === 'swim') {
    return (
      (result.reps || 0) >= (planned.sets || 1) &&
      (result.distanceM || 0) >= (planned.distanceM || 0)
    );
  }
  if (planned.kind === 'endurance') {
    if (planned.distanceM && (result.distanceM || 0) < planned.distanceM) return false;
    if (!planned.distanceM && planned.durationSec && (result.durationSec || 0) < planned.durationSec) {
      return false;
    }
    return Boolean(planned.distanceM || planned.durationSec);
  }
  if (planned.kind === 'station') {
    if (planned.metric === 'distance') return (result.distanceM || 0) >= (planned.distanceM || 1);
    if (planned.metric === 'time') return (result.durationSec || 0) > 0;
    return (result.reps || 0) >= (planned.reps || 1);
  }
  if (planned.kind === 'rounds') {
    return (
      (result.reps || 0) >= (planned.sets || 1) &&
      (result.durationSec || 0) >= (planned.durationSec || 1)
    );
  }
  if (planned.kind === 'practice') return (result.durationSec || 0) >= (planned.durationSec || 1);
  return false;
}

export function completionReview(workout, log) {
  if (!workout || !log)
    return {
      coverage: null,
      status: 'not_applicable',
      missingExercises: [],
      pain: false,
    };
  const gym = (workout.items || []).every((item) => !item.kind || item.kind === 'strength');
  if (!gym) {
    let met = 0;
    const missing = [];
    workout.items.forEach((planned, index) => {
      const byIndex = log.items[index];
      const actual =
        byIndex && (!planned.label || !byIndex.label || byIndex.label === planned.label)
          ? byIndex
          : log.items.find((item) => item.label && item.label === planned.label);
      if (pieceLogged(planned, actual?.sets?.[0])) met += 1;
      else missing.push(planned.label || 'piece');
    });
    const coverage = workout.items.length ? Math.round((met / workout.items.length) * 100) : null;
    return {
      coverage,
      status: log.painFlag
        ? 'attention'
        : coverage === null
          ? 'no_targets'
          : coverage >= 100
            ? 'met'
            : 'partial',
      missingExercises: missing,
      pain: !!log.painFlag,
      explanation:
        'Compares the logged measurement with the assigned piece; self-reported logs do not prove physical completion.',
    };
  }
  const expected = workout.items.reduce((n, i) => n + i.sets, 0);
  let completed = 0;
  const missing = [];
  for (const planned of workout.items) {
    const actual = log.items.find(
      (i) => String(i.exerciseId) === String(planned.exerciseId),
    );
    const sets = (actual?.sets || []).filter(
      (s) =>
        s.reps >= planned.reps &&
        (planned.targetWeightKg == null ||
          s.weightKg >= planned.targetWeightKg),
    );
    completed += Math.min(sets.length, planned.sets);
    if (sets.length < planned.sets) missing.push(String(planned.exerciseId));
  }
  const coverage = expected ? Math.round((completed / expected) * 100) : null;
  return {
    coverage,
    status: log.painFlag
      ? 'attention'
      : coverage === null
        ? 'no_targets'
        : coverage >= 100
          ? 'met'
          : 'partial',
    missingExercises: missing,
    pain: !!log.painFlag,
    explanation:
      'Compares logged sets, reps and target weights; self-reported logs do not prove physical completion.',
  };
}
