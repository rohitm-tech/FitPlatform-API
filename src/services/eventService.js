import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { PlatformEvent } from '../models/platformEventModel.js';
import { EventRsvp } from '../models/eventRsvpModel.js';
import { User } from '../models/userModel.js';
import { ApiError } from '../utils/apiError.js';

function parseId(value, label) {
  if (!/^[a-fA-F0-9]{24}$/.test(String(value || ''))) {
    throw new ApiError(400, `Invalid ${label}`);
  }
  return value;
}

function formatWhen(date) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(date));
}

const EVENT_MEDIA = path.resolve('uploads/events');
const IMAGE_TYPES = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.length > 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG' },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

function presentImages(event) {
  return (event.images || []).map((image) => ({
    url: `/api/v1/events/media/${event._id}/${image.filename}`,
    credit: image.credit || '',
  }));
}

async function storeEventPhotos(eventId, photos) {
  const stored = [];
  let total = 0;
  for (const photo of photos || []) {
    const buffer = Buffer.from(String(photo.data || ''), 'base64');
    const type = IMAGE_TYPES.find((entry) => entry.mime === photo.mimeType && entry.test(buffer));
    if (!type) throw new ApiError(400, 'Use a JPEG, PNG, or WebP photo.');
    if (buffer.length > 4 * 1024 * 1024) throw new ApiError(400, 'Each photo must be 4 MB or smaller.');
    total += buffer.length;
    if (total > 8 * 1024 * 1024) throw new ApiError(400, 'Keep the photos under 8 MB together.');
    stored.push({
      filename: `${crypto.randomBytes(8).toString('hex')}.${type.ext}`,
      mimeType: type.mime,
      credit: '',
      buffer,
    });
  }
  if (!stored.length) return;
  const dir = path.join(EVENT_MEDIA, String(eventId));
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  await Promise.all(stored.map((item) => fs.writeFile(path.join(dir, item.filename), item.buffer)));
  await PlatformEvent.updateOne(
    { _id: eventId },
    { $set: { images: stored.map(({ filename, mimeType, credit }) => ({ filename, mimeType, credit })) } },
  );
}

function decorate(event, user, goingCount, rsvp) {
  const now = new Date();
  const premium = user?.plan === 'premium';
  const started = now >= new Date(event.startsAt);
  const early = now < new Date(event.publicOpensAt);
  const booked = rsvp?.status === 'going';
  let access = 'open';
  if (event.status !== 'published' || started) access = 'closed';
  else if (early) access = 'early';
  const canRsvp = event.status === 'published'
    && !started
    && goingCount < event.capacity
    && !booked
    && (premium || !early);
  return {
    _id: event._id,
    title: event.title,
    summary: event.summary,
    place: event.place,
    images: presentImages(event),
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    capacity: event.capacity,
    fullPriceMinor: event.fullPriceMinor,
    premiumPriceMinor: event.premiumPriceMinor,
    publicOpensAt: event.publicOpensAt,
    status: event.status,
    goingCount,
    yourPriceMinor: premium ? event.premiumPriceMinor : event.fullPriceMinor,
    access,
    canRsvp,
    rsvp: rsvp
      ? { status: rsvp.status, priceMinor: rsvp.priceMinor, planAtSignup: rsvp.planAtSignup }
      : null,
  };
}

function adminView(event, goingCount) {
  return {
    _id: event._id,
    title: event.title,
    summary: event.summary,
    place: event.place,
    images: presentImages(event),
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    capacity: event.capacity,
    fullPriceMinor: event.fullPriceMinor,
    premiumPriceMinor: event.premiumPriceMinor,
    publicOpensAt: event.publicOpensAt,
    status: event.status,
    goingCount,
  };
}

function fieldsFrom(input, adminId) {
  return {
    title: input.title,
    summary: input.summary,
    place: input.place,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    capacity: input.capacity,
    fullPriceMinor: input.fullPriceMinor,
    premiumPriceMinor: input.premiumPriceMinor,
    publicOpensAt: new Date(input.publicOpensAt),
    status: input.status,
    ...(adminId ? { createdBy: adminId } : {}),
  };
}

async function countsFor(ids) {
  if (!ids.length) return new Map();
  const rows = await EventRsvp.aggregate([
    { $match: { eventId: { $in: ids }, status: 'going' } },
    { $group: { _id: '$eventId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

export async function listPublished(user) {
  const events = await PlatformEvent.find({ status: 'published' }).sort({ startsAt: 1 }).lean();
  const ids = events.map((event) => event._id);
  const [counts, rsvps] = await Promise.all([
    countsFor(ids),
    ids.length
      ? EventRsvp.find({ eventId: { $in: ids }, userId: user._id }).lean()
      : [],
  ]);
  const rsvpBy = new Map(rsvps.map((row) => [String(row.eventId), row]));
  return events.map((event) => decorate(
    event,
    user,
    counts.get(String(event._id)) || 0,
    rsvpBy.get(String(event._id)) || null,
  ));
}

export async function getPublished(user, eventId) {
  parseId(eventId, 'event');
  const event = await PlatformEvent.findOne({ _id: eventId, status: 'published' }).lean();
  if (!event) throw new ApiError(404, 'That event could not be found.');
  const [goingCount, rsvp] = await Promise.all([
    EventRsvp.countDocuments({ eventId: event._id, status: 'going' }),
    EventRsvp.findOne({ eventId: event._id, userId: user._id }).lean(),
  ]);
  return decorate(event, user, goingCount, rsvp);
}

export async function rsvp(user, eventId) {
  parseId(eventId, 'event');
  const event = await PlatformEvent.findById(eventId);
  if (!event || event.status !== 'published') {
    throw new ApiError(404, 'That event could not be found.');
  }
  const now = new Date();
  if (now >= new Date(event.startsAt)) {
    throw new ApiError(403, 'This event has already started.');
  }
  const early = now < new Date(event.publicOpensAt);
  const premium = user.plan === 'premium';
  if (early && !premium) {
    throw new ApiError(
      403,
      `Premium members can book until ${formatWhen(event.publicOpensAt)}. Booking opens to everyone after that.`,
    );
  }
  const existing = await EventRsvp.findOne({ eventId: event._id, userId: user._id });
  if (existing?.status === 'going') return getPublished(user, eventId);
  const going = await EventRsvp.countDocuments({ eventId: event._id, status: 'going' });
  if (going >= event.capacity) throw new ApiError(409, 'This event is full.');
  const priceMinor = premium ? event.premiumPriceMinor : event.fullPriceMinor;
  const planAtSignup = premium ? 'premium' : 'free';
  if (existing) {
    existing.status = 'going';
    existing.priceMinor = priceMinor;
    existing.planAtSignup = planAtSignup;
    await existing.save();
  } else {
    await EventRsvp.create({
      eventId: event._id,
      userId: user._id,
      status: 'going',
      priceMinor,
      planAtSignup,
    });
  }
  return getPublished(user, eventId);
}

export async function cancelRsvp(user, eventId) {
  parseId(eventId, 'event');
  const event = await PlatformEvent.findOne({ _id: eventId, status: 'published' });
  if (!event) throw new ApiError(404, 'That event could not be found.');
  const existing = await EventRsvp.findOne({ eventId, userId: user._id, status: 'going' });
  if (!existing) throw new ApiError(404, 'You are not booked on this event.');
  existing.status = 'cancelled';
  await existing.save();
  return getPublished(user, eventId);
}

export async function listAdminEvents() {
  const events = await PlatformEvent.find().sort({ startsAt: 1 }).lean();
  const counts = await countsFor(events.map((event) => event._id));
  return events.map((event) => adminView(event, counts.get(String(event._id)) || 0));
}

export async function createEvent(admin, input) {
  const event = await PlatformEvent.create(fieldsFrom(input, admin._id));
  if (input.photos?.length) await storeEventPhotos(event._id, input.photos);
  const fresh = await PlatformEvent.findById(event._id).lean();
  return adminView(fresh, 0);
}

export async function updateEvent(eventId, input) {
  parseId(eventId, 'event');
  const event = await PlatformEvent.findByIdAndUpdate(
    eventId,
    { $set: fieldsFrom(input) },
    { new: true, runValidators: true },
  ).lean();
  if (!event) throw new ApiError(404, 'That event could not be found.');
  if (input.photos?.length) await storeEventPhotos(eventId, input.photos);
  const fresh = input.photos?.length ? await PlatformEvent.findById(eventId).lean() : event;
  const goingCount = await EventRsvp.countDocuments({ eventId, status: 'going' });
  return adminView(fresh, goingCount);
}

export async function openEventMedia(eventId, file) {
  parseId(eventId, 'event');
  if (!/^[a-f0-9]{16}\.(jpg|png|webp)$/.test(String(file || ''))) {
    throw new ApiError(404, 'That photo could not be found.');
  }
  const event = await PlatformEvent.findById(eventId).select('images').lean();
  const image = event?.images?.find((item) => item.filename === file);
  if (!image) throw new ApiError(404, 'That photo could not be found.');
  const full = path.resolve(EVENT_MEDIA, String(eventId), file);
  if (!full.startsWith(`${path.resolve(EVENT_MEDIA)}${path.sep}`)) {
    throw new ApiError(404, 'That photo could not be found.');
  }
  try {
    return { mimeType: image.mimeType, data: await fs.readFile(full) };
  } catch {
    throw new ApiError(404, 'That photo could not be found.');
  }
}

export async function listRsvps(eventId) {
  parseId(eventId, 'event');
  const event = await PlatformEvent.findById(eventId).select('_id').lean();
  if (!event) throw new ApiError(404, 'That event could not be found.');
  const rows = await EventRsvp.find({ eventId, status: 'going' }).sort({ createdAt: 1 }).lean();
  const people = await User.find({ _id: { $in: rows.map((row) => row.userId) } }).select('name').lean();
  const names = new Map(people.map((person) => [String(person._id), person.name]));
  return rows.map((row) => ({
    _id: row._id,
    status: row.status,
    priceMinor: row.priceMinor,
    planAtSignup: row.planAtSignup,
    createdAt: row.createdAt,
    athlete: { _id: row.userId, name: names.get(String(row.userId)) || 'Athlete' },
  }));
}
