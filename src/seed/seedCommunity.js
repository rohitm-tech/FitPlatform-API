import { User } from '../models/userModel.js';
import { CommunityPost } from '../models/communityPostModel.js';
import { CommunityReply } from '../models/communityReplyModel.js';
import { CommunityLike } from '../models/communityLikeModel.js';
import { PlatformEvent } from '../models/platformEventModel.js';

const day = 24 * 60 * 60 * 1000;

async function ensurePost(author, body) {
  const existing = await CommunityPost.findOne({ authorId: author._id, body });
  if (existing) return existing;
  return CommunityPost.create({ authorId: author._id, body, likeCount: 0, replyCount: 0 });
}

async function ensureReply(post, author, body) {
  const existing = await CommunityReply.findOne({ postId: post._id, authorId: author._id, body });
  if (existing) return existing;
  const reply = await CommunityReply.create({ postId: post._id, authorId: author._id, body });
  await CommunityPost.updateOne({ _id: post._id }, { $inc: { replyCount: 1 } });
  return reply;
}

async function ensureLike(post, user) {
  const existing = await CommunityLike.findOne({ postId: post._id, userId: user._id });
  if (existing) return existing;
  await CommunityLike.create({ postId: post._id, userId: user._id });
  await CommunityPost.updateOne({ _id: post._id }, { $inc: { likeCount: 1 } });
}

export async function seedCommunity() {
  const [admin, aarav, diya] = await Promise.all([
    User.findOne({ roles: 'admin' }),
    User.findOne({ email: 'athlete1@fitplatform.app' }),
    User.findOne({ email: 'athlete2@fitplatform.app' }),
  ]);

  if (diya && diya.plan !== 'premium') {
    diya.plan = 'premium';
    await diya.save();
    console.log('  ✓ Diya Patel is on Premium so the community has two members');
  }

  if (aarav && diya) {
    const cubbon = await ensurePost(
      aarav,
      'Cubbon Park loop this Sunday, starting at the bandstand at 6:30. Easy pace for the first 5 km if anyone wants company.',
    );
    await ensureReply(cubbon, diya, 'I will be there. Saving the last kilometre for a few strides.');
    await ensureLike(cubbon, diya);

    const bench = await ensurePost(
      diya,
      'Looking for a spotter at Ironclad on Thursday evening. Bench is moving again after two easy weeks.',
    );
    await ensureReply(bench, aarav, 'I finish coaching notes by 7. I can spot the last sets.');
    console.log('  ✓ Seeded community posts');
  } else {
    console.log('  • Demo athletes missing, skipping community posts');
  }

  if (!admin) {
    console.log('  • Admin missing, skipping events');
    return;
  }

  const now = Date.now();
  const events = [
    {
      title: 'Cubbon Park sunrise run',
      summary: 'An easy 8 km from the bandstand and back. Premium members can book before it opens to everyone.',
      place: 'Cubbon Park, Bengaluru',
      startsAt: new Date(now + 21 * day),
      endsAt: new Date(now + 21 * day + 2 * 60 * 60 * 1000),
      publicOpensAt: new Date(now + 10 * day),
      capacity: 40,
      fullPriceMinor: 79900,
      premiumPriceMinor: 49900,
      status: 'published',
    },
    {
      title: 'Indiranagar strength workshop',
      summary: 'A Saturday session on squat and bench setup at Ironclad. Open to every athlete now. Premium keeps the lower price.',
      place: 'Ironclad Fitness, 12th Main Road, Indiranagar, Bengaluru',
      startsAt: new Date(now + 7 * day),
      endsAt: new Date(now + 7 * day + 2 * 60 * 60 * 1000),
      publicOpensAt: new Date(now - day),
      capacity: 16,
      fullPriceMinor: 150000,
      premiumPriceMinor: 99900,
      status: 'published',
    },
    {
      title: 'Ulsoor Lake swim meet',
      summary: 'A short open-water swim that has already finished. Signups are closed.',
      place: 'Ulsoor Lake, Bengaluru',
      startsAt: new Date(now - 2 * day),
      endsAt: new Date(now - 2 * day + 2 * 60 * 60 * 1000),
      publicOpensAt: new Date(now - 14 * day),
      capacity: 20,
      fullPriceMinor: 60000,
      premiumPriceMinor: 40000,
      status: 'published',
    },
  ];

  for (const event of events) {
    await PlatformEvent.findOneAndUpdate(
      { title: event.title },
      { $set: { ...event, createdBy: admin._id } },
      { upsert: true },
    );
  }
  console.log('  ✓ Seeded events');
}
