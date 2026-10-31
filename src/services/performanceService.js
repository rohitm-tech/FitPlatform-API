import { Recovery } from '../models/recoveryModel.js';
import { queueReview } from './ai/reviewService.js';

// Single write path for a daily recovery record, shared by the manual
// check-in route, the wearable import routes, and the AI coach's
// log_recovery tool — whoever writes it, the review pipeline reacts the
// same way.
export async function upsertDailyRecovery(athleteId, data, source, sourceLabel, enqueue = true) {
  const record = await Recovery.findOneAndUpdate(
    { athleteId, date: data.date, source },
    { $set: { ...data, sourceLabel } },
    { upsert: true, new: true, runValidators: true },
  );
  if (enqueue) {
    await queueReview({
      athleteId,
      trigger: 'recovery_updated',
      eventKey: `recovery:${record._id}:${record.updatedAt.toISOString()}`,
    });
  }
  return record;
}
