import mongoose from 'mongoose';
// Structured results the coach agent's tools produced for this reply
// (exercises, matched coaches, venues), rendered as cards rather than text.
// Cards saved before `type` existed are exercises.
const cardSchema = new mongoose.Schema({
  type: { type: String, enum: ['exercise', 'coach', 'place', 'life'], default: 'exercise' },
  exerciseId: String,
  name: String,
  slug: String,
  difficulty: String,
  equipment: [String],
  primaryMuscle: String,
  coachId: String,
  placeId: String,
  kind: String,
  sport: String,
  sports: [String],
  headline: String,
  summary: String,
  area: String,
  city: String,
  distanceKm: Number,
  delivery: { type: String, enum: ['in_person', 'online'] },
  experienceYears: Number,
  priceMinor: Number,
  priceUnit: String,
  hours: String,
  remote: Boolean,
  accepting: Boolean,
  languages: [String],
  reasons: [String],
  cautions: [String],
  matchScore: Number,
  isDemo: Boolean,
  href: String,
}, { _id: false });
// A visible log of which tools the agent called for this reply, so the UI
// can show the athlete what the AI actually did (not just its final text).
const toolTraceSchema = new mongoose.Schema({
  tool: String,
  label: String,
  status: { type: String, enum: ['done', 'error'], default: 'done' },
}, { _id: false });
const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  text: { type: String, default: '' },
  turnId: String,
  status: { type: String, enum: ['pending', 'complete', 'failed'], default: 'complete' },
  error: String,
  photoId: { type: mongoose.Schema.Types.ObjectId, ref: 'CoachPhoto' },
  cards: { type: [cardSchema], default: [] },
  toolTrace: { type: [toolTraceSchema], default: [] },
  at: { type: Date, default: Date.now },
});
const schema = new mongoose.Schema({
  athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, default: 'New conversation', maxlength: 80 },
  archived: { type: Boolean, default: false },
  legacyId: { type: mongoose.Schema.Types.ObjectId, unique: true, sparse: true },
  messages: [messageSchema],
  activeTurnId: String,
  activeUntil: Date,
}, { timestamps: true });
schema.index({ athleteId: 1, archived: 1, updatedAt: -1 });
export const AiThread = mongoose.model('AiThread', schema);
