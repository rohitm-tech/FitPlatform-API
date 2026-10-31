import mongoose from 'mongoose';
// Structured results the coach agent's tools produced for this reply (e.g.
// exercises found by search_exercises), rendered as cards rather than text.
const cardSchema = new mongoose.Schema({
  exerciseId: String,
  name: String,
  slug: String,
  difficulty: String,
  equipment: [String],
  primaryMuscle: String,
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
