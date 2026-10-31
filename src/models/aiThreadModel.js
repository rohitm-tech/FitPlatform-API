import mongoose from 'mongoose';
const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  text: { type: String, default: '' },
  turnId: String,
  status: { type: String, enum: ['pending', 'complete', 'failed'], default: 'complete' },
  error: String,
  photoId: { type: mongoose.Schema.Types.ObjectId, ref: 'CoachPhoto' },
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
