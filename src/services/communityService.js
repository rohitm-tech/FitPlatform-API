import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { CommunityPost } from '../models/communityPostModel.js';
import { CommunityReply } from '../models/communityReplyModel.js';
import { CommunityLike } from '../models/communityLikeModel.js';
import { CommunityThread } from '../models/communityThreadModel.js';
import { CommunityMessage } from '../models/communityMessageModel.js';
import { User } from '../models/userModel.js';
import { ApiError } from '../utils/apiError.js';

function parseId(value, label) {
  if (!/^[a-fA-F0-9]{24}$/.test(String(value || ''))) {
    throw new ApiError(400, `Invalid ${label}`);
  }
  return value;
}

function pairKey(a, b) {
  return [String(a), String(b)].sort().join(':');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function namesById(ids) {
  const people = await User.find({ _id: { $in: ids } }).select('name').lean();
  return new Map(people.map((person) => [String(person._id), person.name]));
}

function authorOf(names, id) {
  return { _id: id, name: names.get(String(id)) || 'Athlete' };
}

const MEDIA_DIR = path.resolve('uploads/community');
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 6 * 1024 * 1024;
const MEDIA_TYPES = [
  { mime: 'image/jpeg', kind: 'image', ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', kind: 'image', ext: 'png', test: (b) => b.length > 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG' },
  { mime: 'image/webp', kind: 'image', ext: 'webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { mime: 'image/gif', kind: 'image', ext: 'gif', test: (b) => b.length > 6 && (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a') },
  { mime: 'video/mp4', kind: 'video', ext: 'mp4', test: (b) => b.length > 12 && b.toString('ascii', 4, 8) === 'ftyp' },
  { mime: 'video/webm', kind: 'video', ext: 'webm', test: (b) => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
];

function presentMedia(post) {
  return (post.media || []).map((item) => ({
    kind: item.kind,
    mimeType: item.mimeType,
    url: `/api/v1/community/media/${post._id}/${item.filename}`,
  }));
}

function prepareMedia(items) {
  const prepared = [];
  let total = 0;
  for (const item of items || []) {
    const buffer = Buffer.from(String(item.data || ''), 'base64');
    const type = MEDIA_TYPES.find((entry) => entry.mime === item.mimeType && entry.test(buffer));
    if (!type) throw new ApiError(400, 'Use a JPEG, PNG, WebP, GIF, MP4, or WebM file.');
    if (buffer.length > MAX_FILE_BYTES) throw new ApiError(400, 'Each photo or video must be 4 MB or smaller.');
    total += buffer.length;
    if (total > MAX_TOTAL_BYTES) throw new ApiError(400, 'Keep photos and videos under 6 MB together.');
    prepared.push({
      kind: type.kind,
      mimeType: type.mime,
      ext: type.ext,
      buffer,
    });
  }
  return prepared;
}

export async function listPosts(user, before) {
  const query = {};
  if (before) {
    const cursor = new Date(before);
    if (Number.isNaN(cursor.getTime())) throw new ApiError(400, 'Invalid cursor');
    query.createdAt = { $lt: cursor };
  }
  const posts = await CommunityPost.find(query).sort({ createdAt: -1 }).limit(30).lean();
  const [names, likes] = await Promise.all([
    namesById(posts.map((post) => post.authorId)),
    CommunityLike.find({
      userId: user._id,
      postId: { $in: posts.map((post) => post._id) },
    }).select('postId').lean(),
  ]);
  const liked = new Set(likes.map((like) => String(like.postId)));
  return {
    posts: posts.map((post) => ({
      _id: post._id,
      body: post.body,
      createdAt: post.createdAt,
      likeCount: post.likeCount,
      replyCount: post.replyCount,
      liked: liked.has(String(post._id)),
      media: presentMedia(post),
      author: authorOf(names, post.authorId),
    })),
  };
}

export async function createPost(user, { body = '', media = [] }) {
  const text = String(body || '').trim();
  const prepared = prepareMedia(media);
  if (!text && prepared.length === 0) {
    throw new ApiError(400, 'Write something or add a photo or video.');
  }
  const stored = prepared.map((item) => ({
    kind: item.kind,
    mimeType: item.mimeType,
    filename: `${crypto.randomBytes(8).toString('hex')}.${item.ext}`,
    buffer: item.buffer,
  }));
  const post = await CommunityPost.create({
    authorId: user._id,
    body: text,
    media: stored.map(({ kind, mimeType, filename }) => ({ kind, mimeType, filename })),
  });
  try {
    if (stored.length) {
      const dir = path.join(MEDIA_DIR, String(post._id));
      await fs.mkdir(dir, { recursive: true });
      await Promise.all(stored.map((item) => fs.writeFile(path.join(dir, item.filename), item.buffer)));
    }
  } catch (error) {
    await CommunityPost.deleteOne({ _id: post._id });
    throw error;
  }
  return {
    _id: post._id,
    body: post.body,
    createdAt: post.createdAt,
    likeCount: 0,
    replyCount: 0,
    liked: false,
    media: presentMedia(post),
    author: { _id: user._id, name: user.name },
  };
}

export async function openCommunityMedia(postId, file) {
  parseId(postId, 'post');
  if (!/^[a-f0-9]{16}\.(jpg|png|webp|gif|mp4|webm)$/.test(String(file || ''))) {
    throw new ApiError(404, 'That file could not be found.');
  }
  const post = await CommunityPost.findById(postId).select('media').lean();
  const item = post?.media?.find((entry) => entry.filename === file);
  if (!item) throw new ApiError(404, 'That file could not be found.');
  const full = path.resolve(MEDIA_DIR, String(postId), file);
  if (!full.startsWith(`${path.resolve(MEDIA_DIR)}${path.sep}`)) {
    throw new ApiError(404, 'That file could not be found.');
  }
  try {
    return { mimeType: item.mimeType, data: await fs.readFile(full) };
  } catch {
    throw new ApiError(404, 'That file could not be found.');
  }
}

export async function listReplies(postId) {
  parseId(postId, 'post');
  const post = await CommunityPost.findById(postId).select('_id').lean();
  if (!post) throw new ApiError(404, 'That post could not be found.');
  const replies = await CommunityReply.find({ postId }).sort({ createdAt: 1 }).lean();
  const names = await namesById(replies.map((reply) => reply.authorId));
  return {
    replies: replies.map((reply) => ({
      _id: reply._id,
      body: reply.body,
      createdAt: reply.createdAt,
      author: authorOf(names, reply.authorId),
    })),
  };
}

export async function createReply(user, postId, body) {
  parseId(postId, 'post');
  const post = await CommunityPost.findById(postId);
  if (!post) throw new ApiError(404, 'That post could not be found.');
  const reply = await CommunityReply.create({ postId, authorId: user._id, body });
  await CommunityPost.updateOne({ _id: postId }, { $inc: { replyCount: 1 } });
  return {
    _id: reply._id,
    body: reply.body,
    createdAt: reply.createdAt,
    author: { _id: user._id, name: user.name },
  };
}

export async function toggleLike(user, postId) {
  parseId(postId, 'post');
  const post = await CommunityPost.findById(postId);
  if (!post) throw new ApiError(404, 'That post could not be found.');
  const removed = await CommunityLike.findOneAndDelete({ postId, userId: user._id });
  if (removed) {
    post.likeCount = Math.max(0, post.likeCount - 1);
    await post.save();
    return { liked: false, likeCount: post.likeCount };
  }
  try {
    await CommunityLike.create({ postId, userId: user._id });
  } catch (error) {
    if (error.code === 11000) {
      const current = await CommunityPost.findById(postId).select('likeCount').lean();
      return { liked: true, likeCount: current?.likeCount || 0 };
    }
    throw error;
  }
  post.likeCount += 1;
  await post.save();
  return { liked: true, likeCount: post.likeCount };
}

export async function searchAthletes(user, rawQuery) {
  const me = await User.findById(user._id).select('profile.sports').lean();
  const mine = me?.profile?.sports || [];
  const q = String(rawQuery || '').trim();
  const filter = { roles: 'athlete', _id: { $ne: user._id } };
  if (q) {
    const pattern = escapeRegex(q);
    filter.$or = [
      { name: { $regex: pattern, $options: 'i' } },
      { 'profile.sports': { $regex: pattern, $options: 'i' } },
      { 'profile.location.city': { $regex: pattern, $options: 'i' } },
    ];
  }
  const people = await User.find(filter)
    .select('name profile.sports profile.location.city')
    .limit(q ? 12 : 24)
    .lean();
  const athletes = people
    .map((person) => {
      const sports = person.profile?.sports || [];
      return {
        _id: person._id,
        name: person.name,
        sports,
        city: person.profile?.location?.city || '',
        shared: sports.filter((sport) => mine.includes(sport)),
      };
    })
    .sort((a, b) => b.shared.length - a.shared.length || a.name.localeCompare(b.name));
  return { you: { sports: mine }, athletes };
}

async function threadFor(user, other, key) {
  const ids = [user._id, other._id].sort((a, b) => String(a).localeCompare(String(b)));
  try {
    return await CommunityThread.create({
      participantIds: ids,
      participantKey: key,
      lastMessageAt: new Date(),
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    return CommunityThread.findOne({ participantKey: key });
  }
}

export async function startThread(user, athleteId, body) {
  parseId(athleteId, 'athlete');
  if (String(athleteId) === String(user._id)) {
    throw new ApiError(400, 'Choose another athlete.');
  }
  const other = await User.findById(athleteId).select('name roles');
  if (!other?.roles?.includes('athlete')) {
    throw new ApiError(404, 'That athlete could not be found.');
  }
  const key = pairKey(user._id, other._id);
  const thread = await threadFor(user, other, key);
  const message = await CommunityMessage.create({ threadId: thread._id, senderId: user._id, body });
  thread.lastMessageAt = message.createdAt;
  await thread.save();
  return {
    thread: {
      _id: thread._id,
      other: { _id: other._id, name: other.name },
      lastMessageAt: thread.lastMessageAt,
      preview: message.body,
    },
    message: {
      _id: message._id,
      body: message.body,
      createdAt: message.createdAt,
      senderId: message.senderId,
      mine: true,
    },
  };
}

async function loadThread(user, threadId) {
  parseId(threadId, 'conversation');
  const thread = await CommunityThread.findById(threadId);
  if (!thread?.participantIds?.some((id) => String(id) === String(user._id))) {
    throw new ApiError(404, 'You are not in this conversation.');
  }
  return thread;
}

export async function listThreads(user) {
  const threads = await CommunityThread.find({ participantIds: user._id })
    .sort({ lastMessageAt: -1 })
    .lean();
  if (!threads.length) return { threads: [] };
  const ids = threads.map((thread) => thread._id);
  const otherIds = threads.map(
    (thread) => thread.participantIds.find((id) => String(id) !== String(user._id)),
  );
  const [names, previews] = await Promise.all([
    namesById(otherIds),
    CommunityMessage.aggregate([
      { $match: { threadId: { $in: ids } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$threadId', body: { $first: '$body' } } },
    ]),
  ]);
  const previewBy = new Map(previews.map((row) => [String(row._id), row.body]));
  return {
    threads: threads.map((thread) => {
      const otherId = thread.participantIds.find((id) => String(id) !== String(user._id));
      return {
        _id: thread._id,
        other: authorOf(names, otherId),
        lastMessageAt: thread.lastMessageAt,
        preview: previewBy.get(String(thread._id)) || '',
      };
    }),
  };
}

export async function getThread(user, threadId) {
  const thread = await loadThread(user, threadId);
  const otherId = thread.participantIds.find((id) => String(id) !== String(user._id));
  const [other, messages] = await Promise.all([
    User.findById(otherId).select('name').lean(),
    CommunityMessage.find({ threadId: thread._id }).sort({ createdAt: 1 }).limit(100).lean(),
  ]);
  return {
    _id: thread._id,
    other: { _id: otherId, name: other?.name || 'Athlete' },
    messages: messages.map((message) => ({
      _id: message._id,
      body: message.body,
      createdAt: message.createdAt,
      senderId: message.senderId,
      mine: String(message.senderId) === String(user._id),
    })),
  };
}

export async function sendMessage(user, threadId, body) {
  const thread = await loadThread(user, threadId);
  const message = await CommunityMessage.create({ threadId: thread._id, senderId: user._id, body });
  thread.lastMessageAt = message.createdAt;
  await thread.save();
  return {
    _id: message._id,
    body: message.body,
    createdAt: message.createdAt,
    senderId: message.senderId,
    mine: true,
  };
}
