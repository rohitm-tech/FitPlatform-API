import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/models/userModel.js";
import { CoachProfile } from "../src/models/coachProfileModel.js";
import { MarketListing } from "../src/models/marketplaceModel.js";
import { Place } from "../src/models/placeModel.js";
import { PlaceEnquiry } from "../src/models/placeEnquiryModel.js";
import { roundKm, haversineKm } from "../src/services/discoverService.js";

const origin = { lat: 12.9716, lng: 77.5946 };

const point = (northKm, eastKm = 0) => ({
  type: "Point",
  coordinates: [origin.lng + eastKm / 108.4, origin.lat + northKm / 111],
});

it("keeps in-radius counts, prices and the list on the same kilometres", async () => {
  const nearCoach = await User.create({
    name: "Near Coach",
    email: "near.coach@discover.test",
    passwordHash: "Password123!",
    roles: ["coach"],
  });
  const farCoach = await User.create({
    name: "Far Coach",
    email: "far.coach@discover.test",
    passwordHash: "Password123!",
    roles: ["coach"],
  });
  await CoachProfile.create({
    coachId: nearCoach._id,
    headline: "Lanes before breakfast.",
    bio: "A public swim coach used only in this test.",
    specialties: ["Swimming"],
    sport: "Swimming",
    location: "Ashok Nagar",
    point: point(0.4),
    isPublic: true,
    acceptingAthletes: true,
    isDemo: true,
  });
  await CoachProfile.create({
    coachId: farCoach._id,
    headline: "Strength across town.",
    bio: "A public strength coach used only in this test.",
    specialties: ["Strength"],
    sport: "Strength",
    location: "Whitefield",
    point: point(12),
    isPublic: true,
    acceptingAthletes: true,
    isDemo: true,
  });
  await MarketListing.create({
    slug: "near-swim-coach",
    title: "Swim month",
    category: "coaching",
    providerId: nearCoach._id,
    summary: "A monthly lane plan for this test.",
    description: "Test package. It is not a live coaching contract.",
    features: ["Sets"],
    priceMinor: 349900,
    currency: "INR",
    billing: "month",
    status: "published",
  });
  await Place.create({
    slug: "test-pool",
    name: "Test lane pool",
    kind: "pool",
    sport: "Swimming",
    area: "Ashok Nagar",
    address: "Ashok Nagar",
    point: point(0.3),
    priceMinor: 18000,
    priceUnit: "lane-hour",
    hours: "05:30–21:00",
    surface: "25 m lanes",
    isDemo: true,
  });
  await Place.create({
    slug: "test-turf",
    name: "Test turf",
    kind: "turf",
    sport: "Football",
    area: "Koramangala",
    address: "Koramangala",
    point: point(6),
    priceMinor: 160000,
    priceUnit: "hour",
    hours: "06:00–23:00",
    surface: "5-a-side",
    isDemo: true,
  });
  await Place.create({
    slug: "test-loop",
    name: "Test loop",
    kind: "track",
    sport: "Running",
    area: "Cubbon Park",
    address: "Cubbon Park",
    point: point(0.2),
    priceMinor: 0,
    priceUnit: "none",
    hours: "Open",
    surface: "Park paths",
    isDemo: true,
  });

  const body = (
    await request(app).get("/api/v1/discover").query({
      lat: origin.lat,
      lng: origin.lng,
      radiusKm: 8,
      kind: "coach",
      sport: "Swimming",
    })
  ).body.data;

  expect(body.counts.coach).toBe(1);
  expect(body.counts.pool).toBe(1);
  expect(body.counts.turf).toBe(0);
  expect(body.counts.track).toBe(0);
  expect(body.counts.cricket).toBe(0);
  expect(body.results).toHaveLength(body.counts.coach);
  expect(body.results[0].name).toBe("Near Coach");
  expect(body.results[0].priceMinor).toBe(349900);
  expect(body.results[0].pricePrefix).toBe("From");
  expect(body.results[0].distanceKm).toBeLessThanOrEqual(8);
  expect(body.results.every((row) => row.distanceKm <= body.radiusKm)).toBe(true);

  const pools = (
    await request(app).get("/api/v1/discover").query({
      lat: origin.lat,
      lng: origin.lng,
      radiusKm: 8,
      kind: "pool",
    })
  ).body.data;
  expect(pools.results).toHaveLength(pools.counts.pool);
  expect(pools.results[0].priceMinor).toBe(18000);

  const tight = (
    await request(app).get("/api/v1/discover").query({
      lat: origin.lat,
      lng: origin.lng,
      radiusKm: 2,
      kind: "turf",
    })
  ).body.data;
  expect(tight.counts.turf).toBe(0);
  expect(tight.results).toHaveLength(0);
  expect(tight.nearest.name).toBe("Test turf");
  expect(tight.nearest.distanceKm).toBeGreaterThan(2);
  expect(roundKm(haversineKm(origin.lat, origin.lng, origin.lat + 6 / 111, origin.lng))).toBe(
    tight.nearest.distanceKm,
  );

  const free = (
    await request(app).get("/api/v1/discover").query({
      lat: origin.lat,
      lng: origin.lng,
      radiusKm: 8,
      kind: "track",
    })
  ).body.data;
  expect(free.results[0].priceMinor).toBe(0);
  expect(free.results[0].priceUnit).toBe("none");
});

it("saves a slot request without taking payment, and rejects a past date", async () => {
  const athlete = await User.create({
    name: "Lane Athlete",
    email: "lane@discover.test",
    passwordHash: "Password123!",
    roles: ["athlete"],
  });
  const place = await Place.create({
    slug: "enquiry-pool",
    name: "Enquiry pool",
    kind: "pool",
    sport: "Swimming",
    area: "Ulsoor",
    address: "Ulsoor",
    point: point(1),
    priceMinor: 25000,
    priceUnit: "hour",
    hours: "06:00–20:00",
    surface: "Indoor 25 m",
    isDemo: true,
  });
  const headers = { Authorization: `Bearer ${athlete.generateAccessToken()}` };
  expect(
    (await request(app).post(`/api/v1/places/${place._id}/enquiries`).send({
      date: "2026-11-02",
      startTime: "07:00",
      note: "A lane if one is free",
    })).status,
  ).toBe(401);
  const saved = await request(app)
    .post(`/api/v1/places/${place._id}/enquiries`)
    .set(headers)
    .send({ date: "2026-11-02", startTime: "07:00", note: "A lane if one is free" });
  expect(saved.status).toBe(201);
  expect(saved.body.data.priceMinor).toBe(25000);
  expect(saved.body.data.status).toBe("requested");
  expect(await PlaceEnquiry.countDocuments({ placeId: place._id })).toBe(1);
  const past = await request(app)
    .post(`/api/v1/places/${place._id}/enquiries`)
    .set(headers)
    .send({ date: "2020-01-01", startTime: "07:00" });
  expect(past.status).toBe(400);
});
