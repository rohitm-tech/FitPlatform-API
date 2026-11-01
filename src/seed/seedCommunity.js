import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
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

const DEMO_SPORTS = {
  'athlete1@fitplatform.app': ['Running', 'Strength'],
  'athlete2@fitplatform.app': ['Strength'],
  'athlete3@fitplatform.app': ['Running'],
  'athlete4@fitplatform.app': ['Yoga', 'Pilates'],
  'athlete5@fitplatform.app': ['Running', 'Triathlon'],
  'athlete6@fitplatform.app': ['Swimming'],
  'athlete7@fitplatform.app': ['Cricket', 'Strength'],
  'athlete8@fitplatform.app': ['Yoga'],
  'athlete9@fitplatform.app': ['Boxing', 'Calisthenics'],
  'athlete10@fitplatform.app': ['Swimming', 'Running'],
};

async function ensureAthleteSports() {
  const people = await User.find({ email: { $in: Object.keys(DEMO_SPORTS) } });
  let updated = 0;
  for (const person of people) {
    const sports = DEMO_SPORTS[person.email];
    const missingSports = !person.profile?.sports?.length;
    const missingCity = !person.profile?.location?.city;
    if (!missingSports && !missingCity) continue;
    if (missingSports) person.profile.sports = sports;
    if (missingCity) person.profile.location.city = 'Bengaluru';
    person.markModified('profile');
    await person.save();
    updated += 1;
  }
  if (updated) console.log(`  ✓ Set sports for ${updated} demo athletes`);
}

export async function seedCommunity() {
  await ensureAthleteSports();
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
  await ensureEventPhotos();
  console.log('  ✓ Seeded events');
}

const EVENT_PHOTOS = {
  'Cubbon Park sunrise run': 'File:Some of the 300 runners at the start of the Milton Country Park Parkrun - geograph.org.uk - 7456442.jpg',
  'Indiranagar strength workshop': 'File:District Crossfit Class Warfare-50.jpg',
  'Ulsoor Lake swim meet': 'File:Race Start for Wet Suit Swimmers (49171557952).jpg',
  'Lalbagh evening walk': 'File:Lalbagh (4273615826).jpg',
};

function plainCredit(info) {
  const meta = info.extmetadata || {};
  const artist = String(meta.Artist?.value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const license = String(meta.LicenseShortName?.value || '').replace(/<[^>]+>/g, ' ').trim();
  const parts = [artist && `Photo by ${artist}`, license, 'Wikimedia Commons'].filter(Boolean);
  return parts.join(', ').slice(0, 240);
}

async function commonsFile(title) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', title);
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|mime|size|extmetadata');
  url.searchParams.set('iiurlwidth', '1600');
  url.searchParams.set('format', 'json');
  const response = await fetch(url, {
    headers: { 'User-Agent': 'RhythmFitPlatform/1.0 (demo event photos)' },
  });
  if (!response.ok) return null;
  const data = await response.json();
  const page = Object.values(data.query?.pages || {})[0];
  const info = page?.imageinfo?.[0];
  if (!info || info.mime !== 'image/jpeg' || !info.thumburl) return null;
  return info;
}

async function ensureEventPhotos() {
  const titles = Object.keys(EVENT_PHOTOS);
  const saved = await PlatformEvent.find({ title: { $in: titles } });
  let added = 0;
  for (const event of saved) {
    const photo = await commonsFile(EVENT_PHOTOS[event.title]);
    if (!photo) {
      console.log(`  • No photo found for ${event.title}`);
      continue;
    }
    const credit = plainCredit(photo);
    if (event.images?.[0]?.credit === credit) continue;
    const file = await fetch(photo.thumburl, {
      headers: { 'User-Agent': 'RhythmFitPlatform/1.0 (demo event photos)' },
    });
    if (!file.ok) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length < 1000 || buffer[0] !== 0xff || buffer[1] !== 0xd8) continue;
    const filename = `${crypto.randomBytes(8).toString('hex')}.jpg`;
    const dir = path.resolve('uploads/events', String(event._id));
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), buffer);
    event.images = [{ filename, mimeType: 'image/jpeg', credit }];
    await event.save();
    added += 1;
  }
  if (added) console.log(`  ✓ Saved photos for ${added} events`);
}

export { ensureEventPhotos as refreshEventPhotos };
