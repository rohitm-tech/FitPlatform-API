import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/models/userModel.js";
import { CoachProfile } from "../src/models/coachProfileModel.js";
import { MarketListing } from "../src/models/marketplaceModel.js";
import { Place } from "../src/models/placeModel.js";
import { SPORTS, normalizeSport } from "../src/constants/sports.js";
import { resolveLocation, nearestCity } from "../src/constants/locations.js";
import { rankCoaches } from "../src/services/coachMatchService.js";
import { buildCoachTools } from "../src/services/ai/agent/tools.js";
import { seedDiscovery } from "../src/seed/seedDiscovery.js";

const HSR = { lat: 12.9121, lng: 77.6446, label: "HSR Layout" };
const offset = (base, northKm, eastKm = 0) => [
  base.lng + eastKm / 108.4,
  base.lat + northKm / 111,
];

const coachProfile = (name, fields) => ({
  coachId: { _id: `id-${name}`, name },
  headline: `${name} headline`,
  bio: `${name} teaches carefully. Based in HSR Layout, Bengaluru. Demo profile in the sample catalogue.`,
  acceptingAthletes: true,
  remoteAvailable: false,
  isPublic: true,
  languages: ["English"],
  packages: [],
  ...fields,
});

const pack = (inr) => [{ category: "coaching", priceMinor: inr * 100, billing: "month" }];

describe("sport and location parsing", () => {
  it("maps everyday words, including HYROX said aloud, to catalogue sports", () => {
    expect(normalizeSport("swim")).toBe("Swimming");
    expect(normalizeSport("high rocks")).toBe("HYROX");
    expect(normalizeSport("I want to do HYROX")).toBe("HYROX");
    expect(normalizeSport("MMA")).toBe("Martial Arts");
    expect(normalizeSport("gym")).toBe("Strength");
    expect(normalizeSport("bouldering")).toBe("Climbing");
    expect(normalizeSport("chess")).toBeNull();
  });

  it("resolves neighbourhoods and city aliases, and never guesses unknown places", () => {
    expect(resolveLocation({ city: "Bangalore", area: "HSR" })).toMatchObject({
      city: "Bengaluru",
      area: "HSR Layout",
      precision: "area",
    });
    expect(resolveLocation({ area: "Bandra West" })).toMatchObject({ city: "Mumbai", precision: "area" });
    expect(resolveLocation({ city: "Gurgaon" })).toMatchObject({ city: "Gurugram", precision: "city" });
    expect(resolveLocation({ city: "Kochi", area: "Kakkanad" })).toMatchObject({
      city: "Kochi",
      latitude: null,
      precision: "none",
    });
    expect(nearestCity(12.93, 77.62)).toBe("Bengaluru");
    expect(nearestCity(9.93, 76.26)).toBeNull();
  });
});

describe("rankCoaches", () => {
  const coaches = [
    coachProfile("Near Swim", {
      sport: "Swimming",
      specialties: ["Swimming", "Beginners"],
      point: { coordinates: offset(HSR, 1) },
      experienceYears: 9,
      languages: ["English", "Kannada"],
      packages: pack(3000),
    }),
    coachProfile("Pricey Swim", {
      sport: "Swimming",
      specialties: ["Swimming"],
      point: { coordinates: offset(HSR, 2) },
      experienceYears: 15,
      packages: pack(6000),
    }),
    coachProfile("Far Swim", {
      sport: "Swimming",
      specialties: ["Swimming"],
      point: { coordinates: offset(HSR, 30) },
      packages: pack(2000),
    }),
    coachProfile("Far Online Swim", {
      sport: "Swimming",
      specialties: ["Swimming"],
      point: { coordinates: offset(HSR, 30) },
      remoteAvailable: true,
      packages: pack(2500),
    }),
    coachProfile("Full Swim", {
      sport: "Swimming",
      specialties: ["Swimming"],
      point: { coordinates: offset(HSR, 0.5) },
      acceptingAthletes: false,
    }),
    coachProfile("Tri Coach", {
      sport: "Triathlon",
      specialties: ["Triathlon", "Swimming"],
      point: { coordinates: offset(HSR, 3) },
    }),
    coachProfile("Near Boxer", {
      sport: "Boxing",
      specialties: ["Boxing"],
      point: { coordinates: offset(HSR, 0.2) },
    }),
  ];

  it("ranks reachable, in-budget specialists first and explains why with facts", () => {
    const { matches, total } = rankCoaches(coaches, {
      sport: "Swimming",
      origin: HSR,
      budgetMonthlyInr: 4000,
      languages: ["Kannada"],
      experienceLevel: "beginner",
      limit: 5,
    });
    const names = matches.map((m) => m.name);
    expect(names[0]).toBe("Near Swim");
    expect(names).not.toContain("Far Swim");
    expect(names).not.toContain("Full Swim");
    expect(names).not.toContain("Near Boxer");
    expect(names).toContain("Tri Coach");
    expect(total).toBe(4);

    const top = matches[0];
    expect(top).toMatchObject({ type: "coach", delivery: "in_person", distanceKm: 1, priceUnit: "month" });
    expect(top.reasons).toEqual(
      expect.arrayContaining([
        "Swimming is their main sport",
        "1 km from HSR Layout",
        "From ₹3,000/month, inside your ₹4,000 budget",
      ]),
    );
    expect(top.reasons.length).toBeLessThanOrEqual(4);
    expect(top.summary).toBe("Near Swim teaches carefully.");

    const pricey = matches.find((m) => m.name === "Pricey Swim");
    expect(pricey.cautions).toContain("From ₹6,000/month, above your ₹4,000 budget");
    const online = matches.find((m) => m.name === "Far Online Swim");
    expect(online.delivery).toBe("online");
    expect(online.reasons[1]).toMatch(/km away, but coaches online/);
    const otherCity = rankCoaches(
      [coachProfile("Mumbai Online", { sport: "Swimming", specialties: ["Swimming"], city: "Mumbai", remoteAvailable: true, point: { coordinates: [72.83, 19.06] } })],
      { sport: "Swimming", origin: HSR },
    ).matches[0];
    expect(otherCity.reasons[1]).toBe("Coaches online from Mumbai");
    expect(matches.find((m) => m.name === "Tri Coach").reasons[0]).toBe("Also coaches Swimming");
  });

  it("respects an in-person-only preference and an online-only preference", () => {
    const inPerson = rankCoaches(coaches, { sport: "Swimming", origin: HSR, setting: "in_person", limit: 5 });
    expect(inPerson.matches.map((m) => m.name)).not.toContain("Far Online Swim");
    const online = rankCoaches(coaches, { sport: "Swimming", origin: HSR, setting: "online", limit: 5 });
    expect(online.matches.map((m) => m.name)).toEqual(["Far Online Swim"]);
  });
});

describe("AI coach tools", () => {
  const run = (tool, args) => tool.invoke(args);

  async function seededWorld() {
    const athlete = await User.create({
      name: "Swim Athlete",
      email: "swimmer@match.test",
      passwordHash: "Password123!",
      roles: ["athlete"],
      profile: { experienceLevel: "beginner" },
    });
    const near = await User.create({ name: "Lane Coach", email: "lane@match.test", passwordHash: "Password123!", roles: ["coach"] });
    const far = await User.create({ name: "Mumbai Coach", email: "mumbai@match.test", passwordHash: "Password123!", roles: ["coach"] });
    await CoachProfile.create({
      coachId: near._id,
      headline: "Calm water confidence.",
      bio: "Patient adult lessons. Demo profile.",
      sport: "Swimming",
      specialties: ["Swimming", "Beginners"],
      location: "HSR Layout, Bengaluru",
      city: "Bengaluru",
      point: { type: "Point", coordinates: offset(HSR, 0.8) },
      experienceYears: 8,
      remoteAvailable: false,
      isPublic: true,
    });
    await CoachProfile.create({
      coachId: far._id,
      headline: "Sea swims.",
      bio: "Open water in Mumbai.",
      sport: "Swimming",
      specialties: ["Swimming"],
      location: "Bandra West, Mumbai",
      city: "Mumbai",
      point: { type: "Point", coordinates: [72.8295, 19.0596] },
      remoteAvailable: false,
      isPublic: true,
    });
    await MarketListing.create({
      slug: "lane-coach-month",
      title: "Swim month",
      category: "coaching",
      providerId: near._id,
      summary: "Monthly lessons for this test.",
      description: "Test package. It is not a live coaching contract.",
      features: ["Lessons"],
      priceMinor: 300000,
      currency: "INR",
      billing: "month",
      status: "published",
    });
    await Place.create({
      slug: "hsr-test-pool",
      name: "HSR test pool",
      kind: "pool",
      sport: "Swimming",
      area: "HSR Layout",
      address: "HSR Layout",
      point: { type: "Point", coordinates: offset(HSR, 0.5) },
      priceMinor: 15000,
      priceUnit: "hour",
    });
    return athlete;
  }

  it("asks for a location before searching, saves what the athlete says, then returns coach cards", async () => {
    const athlete = await seededWorld();
    const trace = [];
    const cards = [];
    const tools = Object.fromEntries(buildCoachTools(athlete._id, trace, cards).map((t) => [t.name, t]));

    const before = await run(tools.find_coaches, { sport: "swimming" });
    expect(before).toMatch(/location is unknown/i);
    expect(cards).toHaveLength(0);

    const saved = await run(tools.save_athlete_details, {
      city: "Bangalore",
      area: "HSR Layout",
      sports: ["swim", "high rocks", "not-a-sport"],
      budgetMonthlyInr: 4000,
      about: "Works in tech, wants to learn swimming properly.",
    });
    expect(saved).toMatch(/HSR Layout, Bengaluru/);
    const profile = (await User.findById(athlete._id).lean()).profile;
    expect(profile.location).toMatchObject({ city: "Bengaluru", area: "HSR Layout", latitude: 12.9121, source: "chat" });
    expect(profile.sports).toEqual(["Swimming", "HYROX"]);
    expect(profile.budgetMonthlyInr).toBe(4000);

    const found = JSON.parse(await run(tools.find_coaches, { sport: "swimming" }));
    expect(found.shownAsCards.map((c) => c.name)).toEqual(["Lane Coach"]);
    expect(found.shownAsCards[0].whyRecommended).toEqual(
      expect.arrayContaining(["Swimming is their main sport", "From ₹3,000/month, inside your ₹4,000 budget"]),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ type: "coach", name: "Lane Coach", delivery: "in_person" });
    expect(cards[0].distanceKm).toBeLessThan(1.5);

    const unknown = await run(tools.find_coaches, { sport: "chess" });
    expect(unknown).toMatch(/no coaches for "chess"/);

    const pools = JSON.parse(await run(tools.find_places, { sport: "swim" }));
    expect(pools[0].name).toBe("HSR test pool");
    expect(cards.at(-1)).toMatchObject({ type: "place", kind: "pool" });
    expect(trace.map((t) => t.tool)).toEqual([
      "find_coaches",
      "save_athlete_details",
      "find_coaches",
      "find_coaches",
      "find_places",
    ]);
  });

  it("searches an explicitly named city instead of the saved one", async () => {
    const athlete = await seededWorld();
    await User.updateOne(
      { _id: athlete._id },
      { $set: { "profile.location": { city: "Bengaluru", area: "HSR Layout", latitude: 12.9121, longitude: 77.6446 } } },
    );
    const cards = [];
    const tools = Object.fromEntries(buildCoachTools(athlete._id, [], cards).map((t) => [t.name, t]));
    await run(tools.find_coaches, { sport: "swimming", city: "Mumbai", area: "Bandra" });
    expect(cards.map((c) => c.name)).toEqual(["Mumbai Coach"]);
  });
});

describe("athlete profile API", () => {
  it("saves a typed location with resolved coordinates, and validates sports", async () => {
    const athlete = await User.create({ name: "Typed", email: "typed@match.test", passwordHash: "Password123!", roles: ["athlete"] });
    const headers = { Authorization: `Bearer ${athlete.generateAccessToken()}` };
    const saved = await request(app)
      .post("/api/v1/users/onboarding")
      .set(headers)
      .send({
        location: { city: "Pune", area: "Koregaon Park" },
        sports: ["HYROX", "Swimming"],
        trainingSetting: "in_person",
        budgetMonthlyInr: 5000,
        languages: ["English", "Marathi"],
        availability: "Weekday mornings",
        about: "Training for a first HYROX.",
      });
    expect(saved.status).toBe(200);
    expect(saved.body.data.profile.location).toMatchObject({
      city: "Pune",
      area: "Koregaon Park",
      latitude: 18.5362,
      longitude: 73.894,
      source: "typed",
    });
    expect(saved.body.data.profile.sports).toEqual(["HYROX", "Swimming"]);

    const device = await request(app)
      .post("/api/v1/users/onboarding")
      .set(headers)
      .send({ location: { city: "", area: "", latitude: 17.44, longitude: 78.38 } });
    expect(device.body.data.profile.location).toMatchObject({ city: "Hyderabad", source: "device" });
    expect(device.body.data.profile.sports).toEqual(["HYROX", "Swimming"]);

    const invalid = await request(app).post("/api/v1/users/onboarding").set(headers).send({ sports: ["Chess"] });
    expect(invalid.status).toBe(400);
  });
});

describe("discover across every sport", () => {
  it("filters new sports and venue kinds, and lists catalogue cities", async () => {
    await Place.create({
      slug: "test-hyrox-box",
      name: "Test HYROX box",
      kind: "box",
      sport: "HYROX",
      area: "Bellandur",
      address: "Bellandur",
      point: { type: "Point", coordinates: offset(HSR, 2) },
      priceMinor: 60000,
      priceUnit: "session",
    });
    const body = (
      await request(app)
        .get("/api/v1/discover")
        .query({ lat: HSR.lat, lng: HSR.lng, radiusKm: 8, kind: "box", sport: "HYROX", origin: "profile", label: "HSR Layout" })
    ).body.data;
    expect(body.counts.box).toBe(1);
    expect(body.results[0].name).toBe("Test HYROX box");
    expect(body.origin).toMatchObject({ label: "HSR Layout", source: "profile" });

    const meta = (await request(app).get("/api/v1/discover/locations")).body.data;
    expect(meta.sports).toEqual(SPORTS);
    expect(meta.cities.map((c) => c.city)).toEqual(
      expect.arrayContaining(["Bengaluru", "Mumbai", "Delhi", "Gurugram", "Hyderabad", "Chennai", "Pune"]),
    );
  });

  it("seeds coaches for every sport, each with a city and a published package", async () => {
    await seedDiscovery();
    const profiles = await CoachProfile.find({ isDemo: true }).lean();
    for (const sport of SPORTS) {
      expect(profiles.some((p) => p.sport === sport)).toBe(true);
    }
    expect(profiles.every((p) => p.city && p.point?.coordinates?.length === 2)).toBe(true);
    const listings = await MarketListing.countDocuments({ category: "coaching", status: "published" });
    expect(listings).toBe(profiles.length);
    expect(await Place.distinct("city")).toHaveLength(7);
    await seedDiscovery();
    expect(await CoachProfile.countDocuments({ isDemo: true })).toBe(profiles.length);
  }, 240000);
});
