import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { AiThread } from '../../models/aiThreadModel.js';
import { AiConversation } from '../../models/aiConversationModel.js';
import { CoachPhoto } from '../../models/coachPhotoModel.js';
import { ApiError } from '../../utils/apiError.js';
import { generateChatAnswer } from './aiService.js';

export async function importLegacyConversation(athleteId) {
  const legacy = await AiConversation.findOne({ athleteId }).lean();
  if (!legacy?.messages?.length) return;
  try {
    await AiThread.findOneAndUpdate({ legacyId: legacy._id }, { $setOnInsert: {
      athleteId, legacyId: legacy._id, title: 'Earlier training conversation',
      createdAt: legacy.createdAt, updatedAt: legacy.updatedAt,
      messages: legacy.messages.map(m => ({ ...m, status: 'complete' })),
    } }, { upsert: true, timestamps: false });
  } catch (e) { if (e.code !== 11000) throw e; }
}
export async function ownedThread(athleteId, id) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Conversation not found');
  let thread = await AiThread.findOne({ _id: id, athleteId });
  if (!thread) throw new ApiError(404, 'Conversation not found');
  if (thread.activeTurnId && thread.activeUntil < new Date()) {
    await AiThread.updateOne({ _id: id, activeTurnId: thread.activeTurnId, activeUntil: { $lt: new Date() } }, {
      $set: { 'messages.$[reply].status': 'failed', 'messages.$[reply].error': 'The response was interrupted. You can retry.' },
      $unset: { activeTurnId: 1, activeUntil: 1 },
    }, { arrayFilters: [{ 'reply.turnId': thread.activeTurnId, 'reply.role': 'assistant', 'reply.status': 'pending' }] });
    thread = await AiThread.findById(id);
  }
  return thread;
}
export async function sendConversationMessage(athleteId, payload) {
  let thread;
  if (payload.conversationId) thread = await ownedThread(athleteId, payload.conversationId);
  else {
    await importLegacyConversation(athleteId);
    thread = await AiThread.findOne({ athleteId, archived: false }).sort({ updatedAt: -1 });
    if (!thread) thread = await AiThread.create({ athleteId });
  }
  if (thread.archived) throw new ApiError(409, 'Restore this conversation before sending a message');
  const turnId = payload.clientRequestId || crypto.randomUUID();
  const previous = thread.messages.find(m => m.turnId === turnId && m.role === 'user');
  const previousReply = thread.messages.find(m => m.turnId === turnId && m.role === 'assistant');
  if (previousReply?.status === 'complete') return { answer: previousReply.text, conversationId: thread.id };
  if (thread.activeTurnId) throw new ApiError(409, 'A response is already being prepared in this conversation');
  if (previous && thread.messages.at(-1)?.turnId !== turnId) throw new ApiError(409, 'Only the latest interrupted message can be retried');
  if (!previous && thread.messages.length >= 500) throw new ApiError(409, 'This conversation is full. Start a new chat to continue.');
  const text = previous?.text || payload.message;
  const update = { $set: { activeTurnId: turnId, activeUntil: new Date(Date.now() + 120000) } };
  if (previous) {
    update.$set['messages.$[reply].status'] = 'pending';
    update.$set['messages.$[reply].error'] = '';
  } else {
    update.$push = { messages: { $each: [ { role: 'user', text, turnId }, { role: 'assistant', text: '', turnId, status: 'pending' } ] } };
    if (!thread.messages.length) update.$set.title = text.replace(/\s+/g, ' ').slice(0, 70);
  }
  const claimed = await AiThread.findOneAndUpdate({ _id: thread._id, athleteId, archived: false, activeTurnId: { $exists: false } }, update, {
    new: true, ...(previous ? { arrayFilters: [{ 'reply.turnId': turnId, 'reply.role': 'assistant' }] } : {}),
  });
  if (!claimed) throw new ApiError(409, 'A response is already being prepared. Please wait.');
  try {
    let photo = payload.photo;
    if (previous?.photoId) {
      const saved = await CoachPhoto.findOne({ _id: previous.photoId, athleteId }).select('+data');
      if (saved) photo = { mimeType: saved.mimeType, data: saved.data.toString('base64') };
    } else if (photo) {
      const saved = await CoachPhoto.create({ athleteId, mimeType: photo.mimeType, data: Buffer.from(photo.data, 'base64'), caption: text });
      await AiThread.updateOne({ _id: thread._id, activeTurnId: turnId }, { $set: { 'messages.$[question].photoId': saved._id } }, { arrayFilters: [{ 'question.turnId': turnId, 'question.role': 'user' }] });
    }
    const history = thread.messages.filter(m => m.status === 'complete' && m.turnId !== turnId).slice(-20).map(m => ({ role: m.role, text: m.text }));
    const { answer, cards, toolTrace } = await generateChatAnswer(athleteId, text, photo, history);
    await AiThread.updateOne({ _id: thread._id, activeTurnId: turnId }, {
      $set: {
        'messages.$[reply].text': answer,
        'messages.$[reply].cards': cards || [],
        'messages.$[reply].toolTrace': toolTrace || [],
        'messages.$[reply].status': 'complete',
        'messages.$[reply].error': '',
      },
      $unset: { activeTurnId: 1, activeUntil: 1 },
    }, { arrayFilters: [{ 'reply.turnId': turnId, 'reply.role': 'assistant' }] });
    return { answer, conversationId: thread.id };
  } catch (e) {
    await AiThread.updateOne({ _id: thread._id, activeTurnId: turnId }, {
      $set: { 'messages.$[reply].status': 'failed', 'messages.$[reply].error': 'The AI response could not be completed. Retry when you are ready.' },
      $unset: { activeTurnId: 1, activeUntil: 1 },
    }, { arrayFilters: [{ 'reply.turnId': turnId, 'reply.role': 'assistant' }] });
    throw new ApiError(503, 'The AI response could not be completed. Your message is saved; try again.');
  }
}
