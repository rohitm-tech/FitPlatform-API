import mongoose from "mongoose";
import { SESSION_KINDS } from "../constants/sessionSports.js";

/** One prescribed piece. Strength keeps sets, reps and load. Other kinds use distance, time or rounds. */
export function sessionItemSchema() {
  return new mongoose.Schema(
    {
      kind: { type: String, enum: SESSION_KINDS, default: "strength" },
      label: { type: String, trim: true, maxlength: 80, default: "" },
      exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: "Exercise" },
      sets: { type: Number, default: 1 },
      reps: { type: Number, default: null },
      targetWeightKg: { type: Number, default: null },
      restSec: { type: Number, default: null },
      distanceM: { type: Number, default: null },
      durationSec: { type: Number, default: null },
      paceSec: { type: Number, default: null },
      stroke: { type: String, trim: true, maxlength: 40, default: "" },
      metric: { type: String, enum: ["reps", "distance", "time"] },
      effort: { type: Number, default: null },
      notes: { type: String, default: "" },
    },
    { _id: false },
  );
}
