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
      author: authorOf(names, post.authorId),
    })),
  };
}

export async function createPost(user, body) {
  const post = await CommunityPost.create({ authorId: user._id, body });
  return {
    _id: post._id,
    body: post.body,
    createdAt: post.createdAt,
    likeCount: 0,
    replyCount: 0,
    liked: false,
    author: { _id: user._id, name: user.name },
  };
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
  const q = String(rawQuery || '').trim();
  if (!q) return [];
  const people = await User.find({
    roles: 'athlete',
    _id: { $ne: user._id },
    name: { $regex: escapeRegex(q), $options: 'i' },
  })
    .select('name')
    .limit(8)
    .lean();
  return people.map((person) => ({ _id: person._id, name: person.name }));
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
