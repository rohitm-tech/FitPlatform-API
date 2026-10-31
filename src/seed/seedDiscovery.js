import { User } from "../models/userModel.js";
import { CoachProfile } from "../models/coachProfileModel.js";
import { MarketListing } from "../models/marketplaceModel.js";
import { Place } from "../models/placeModel.js";
import { resolveLocation } from "../constants/locations.js";
import { COACH_ROWS, PLACE_ROWS } from "./data/catalogue.js";
import { DEMO_COACHES, upsertDemoUser } from "./demoPeople.js";

const coaches = [
  {
    ...DEMO_COACHES[0],
    sport: "Strength",
    specialties: ["Strength", "General fitness", "Hybrid"],
    headline: "Strength and consistency, with a clear plan.",
    bio: "A demo coaching profile for the Bengaluru catalogue. Sessions are built around the equipment you actually have, with weekly check-ins and coach-approved changes.",
    location: "Indiranagar, Bengaluru",
    lat: 12.9784,
    lng: 77.6408,
    experienceYears: 8,
    remoteAvailable: true,
    slug: "marcus-strength-month",
    title: "Strength, month by month",
    summary: "Ongoing strength coaching from Indiranagar, in the gym or online.",
    priceMinor: 299900,
  },
  {
    ...DEMO_COACHES[1],
    sport: "Running",
    specialties: ["Running", "Hybrid"],
    headline: "A 10K that still feels like running.",
    bio: "Demo running coach based beside Cubbon Park. Plans start from your current week, not from a generic mileage chart. This profile is sample catalogue data.",
    location: "Cubbon Park, Bengaluru",
    lat: 12.976,
    lng: 77.599,
    experienceYears: 6,
    remoteAvailable: true,
    slug: "dana-running-month",
    title: "Running, month by month",
    summary: "A monthly running plan with a clear long run and recovery.",
    priceMinor: 249900,
  },
  {
    name: "Meera Iyer",
    email: "meera.iyer@fitplatform.app",
    sport: "Swimming",
    specialties: ["Swimming"],
    headline: "Lanes, stroke and a pace you can repeat.",
    bio: "Demo swim coach who meets athletes at Ashok Nagar lanes. Stroke work, sets and race pace are agreed before the first block. Sample profile, not a live booking.",
    location: "Ashok Nagar, Bengaluru",
    lat: 12.9688,
    lng: 77.594,
    experienceYears: 11,
    remoteAvailable: false,
    slug: "meera-swim-month",
    title: "Swimming, month by month",
    summary: "Lane sessions and a monthly plan for pool athletes.",
    priceMinor: 349900,
  },
  {
    name: "Arjun Deshpande",
    email: "arjun.deshpande@fitplatform.app",
    sport: "Cricket",
    specialties: ["Cricket", "Strength"],
    headline: "Nets, fielding and the gym between games.",
    bio: "Demo cricket coach working from Jayanagar nets. Batting blocks and strength work stay in one week. Rates in this catalogue are samples.",
    location: "Jayanagar, Bengaluru",
    lat: 12.9308,
    lng: 77.5838,
    experienceYears: 9,
    remoteAvailable: false,
    slug: "arjun-cricket-month",
    title: "Cricket, month by month",
    summary: "Net sessions and a strength week for club cricketers.",
    priceMinor: 199900,
  },
  {
    name: "Kabir Rahman",
    email: "kabir.rahman@fitplatform.app",
    sport: "Football",
    specialties: ["Football", "Running"],
    headline: "Turf sessions with a plan for the week.",
    bio: "Demo football coach on the Koramangala turfs. Small-sided games, conditioning and a written week. The listing is sample data for the enquiry flow.",
    location: "Koramangala, Bengaluru",
    lat: 12.9352,
    lng: 77.622,
    experienceYears: 7,
    remoteAvailable: false,
    slug: "kabir-football-month",
    title: "Football, month by month",
    summary: "Turf sessions and a weekly plan for club players.",
    priceMinor: 179900,
  },
];

const places = [
  ["ashok-nagar-lane-pool", "Ashok Nagar lane pool", "pool", "Swimming", "Ashok Nagar", "Ashok Nagar, Bengaluru", 12.9692, 77.593, 18000, "lane-hour", "05:30–21:00", "25 m lanes"],
  ["ulsoor-club-pool", "Ulsoor club pool", "pool", "Swimming", "Ulsoor", "Ulsoor, Bengaluru", 12.9825, 77.62, 25000, "hour", "06:00–20:00", "Indoor 25 m"],
  ["jayanagar-block-pool", "Jayanagar block pool", "pool", "Swimming", "Jayanagar", "4th Block, Jayanagar", 12.93, 77.583, 15000, "hour", "06:00–12:00, 16:00–20:00", "Outdoor 25 m"],
  ["whitefield-lane-pool", "Whitefield lane pool", "pool", "Swimming", "Whitefield", "Whitefield, Bengaluru", 12.9698, 77.75, 20000, "lane-hour", "06:00–21:00", "50 m lanes"],
  ["cubbon-side-nets", "Cubbon side nets", "cricket", "Cricket", "Cubbon Park", "Kasturba Road, Bengaluru", 12.9764, 77.5929, 160000, "hour", "06:00–21:00", "Practice nets"],
  ["jayanagar-outfield", "Jayanagar outfield", "cricket", "Cricket", "Jayanagar", "Jayanagar, Bengaluru", 12.9255, 77.5935, 140000, "hour", "06:00–18:00", "Grass outfield"],
  ["sadashivanagar-ground", "Sadashivanagar ground", "cricket", "Cricket", "Sadashivanagar", "Sadashivanagar, Bengaluru", 13.0068, 77.5805, 180000, "hour", "06:00–18:00", "Turf pitch, grass outfield"],
  ["koramangala-turf", "Koramangala turf", "turf", "Football", "Koramangala", "5th Block, Koramangala", 12.9352, 77.6245, 160000, "hour", "06:00–23:00", "5-a-side synthetic"],
  ["indiranagar-turf", "Indiranagar turf", "turf", "Football", "Indiranagar", "100 Feet Road, Indiranagar", 12.9784, 77.6408, 220000, "hour", "06:00–23:00", "7-a-side synthetic"],
  ["hsr-main-turf", "HSR 27th Main turf", "turf", "Football", "HSR Layout", "27th Main, HSR Layout", 12.9121, 77.6446, 140000, "hour", "06:00–23:00", "5-a-side synthetic"],
  ["cubbon-loop", "Cubbon loop", "track", "Running", "Cubbon Park", "Cubbon Park, Bengaluru", 12.9755, 77.5925, 0, "none", "Open", "Park paths"],
  ["lalbagh-east-path", "Lalbagh east path", "track", "Running", "Lalbagh", "Lalbagh East Gate", 12.9507, 77.5848, 0, "none", "06:00–19:00", "Garden paths"],
  ["warm-up-track", "Warm-up track", "track", "Running", "Ashok Nagar", "Ashok Nagar, Bengaluru", 12.9705, 77.5965, 8000, "session", "05:00–21:00", "400 m synthetic"],
];

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** A stable offset of up to ~700 m so neighbours in one area don't share a pin. */
function jitter(seed, index) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const angle = ((hash >>> 0) % 360) * (Math.PI / 180);
  const radius = 0.002 + ((index * 7) % 5) * 0.001;
  return [Math.sin(angle) * radius, Math.cos(angle) * radius];
}

function areaPoint(city, area, seed, index) {
  const resolved = resolveLocation({ city, area });
  if (resolved.precision !== "area")
    throw new Error(`Seed area "${area}, ${city}" is not in the location gazetteer`);
  const [dLat, dLng] = jitter(seed, index);
  return {
    lat: Math.round((resolved.latitude + dLat) * 1e5) / 1e5,
    lng: Math.round((resolved.longitude + dLng) * 1e5) / 1e5,
  };
}

export const catalogueCoaches = () =>
  COACH_ROWS.map(
    (
      [name, sport, city, area, experienceYears, remoteAvailable, priceInr, languages, extra, headline, approach],
      index,
    ) => {
      const slug = slugify(name);
      const { lat, lng } = areaPoint(city, area, slug, index);
      return {
        name,
        email: `${slug}@coaches.fitplatform.app`,
        sport,
        specialties: [...new Set([sport, ...extra.split(",").filter(Boolean)])],
        headline,
        bio: `${approach} Based in ${area}, ${city}${remoteAvailable ? ", and also coaches online" : ""}. Demo profile in the sample catalogue; the rate is illustrative.`,
        location: `${area}, ${city}`,
        city,
        lat,
        lng,
        experienceYears,
        remoteAvailable,
        languages: languages.split(","),
        slug: `${slug}-${slugify(sport)}-month`,
        title: `${sport} coaching with ${name.split(" ")[0]}`,
        summary: headline,
        priceMinor: priceInr * 100,
      };
    },
  );

export const cataloguePlaces = () =>
  PLACE_ROWS.map(([name, kind, sport, city, area, priceInr, priceUnit, hours, surface], index) => {
    const slug = slugify(`${name}-${city}`);
    const { lat, lng } = areaPoint(city, area, slug, index);
    return [slug, name, kind, sport, area, `${area}, ${city}`, lat, lng, priceInr * 100, priceUnit, hours, surface, city];
  });

async function upsertCoach(seed) {
  const user = await upsertDemoUser({
    name: seed.name,
    email: seed.email,
    passwordHash: "Coach1234!",
    roles: ["coach"],
  });
  await CoachProfile.updateOne(
    { coachId: user._id },
    {
      $set: {
        sport: seed.sport,
        specialties: seed.specialties,
        location: seed.location,
        city: seed.city || "Bengaluru",
        point: { type: "Point", coordinates: [seed.lng, seed.lat] },
        isPublic: true,
        isDemo: true,
        acceptingAthletes: true,
        remoteAvailable: seed.remoteAvailable,
        experienceYears: seed.experienceYears,
      },
      $setOnInsert: {
        coachId: user._id,
        headline: seed.headline,
        bio: seed.bio,
        languages: seed.languages || ["English", "Kannada"],
      },
    },
    { upsert: true },
  );
  await MarketListing.updateOne(
    { slug: seed.slug },
    {
      $setOnInsert: {
        slug: seed.slug,
        title: seed.title,
        category: "coaching",
        providerId: user._id,
        summary: seed.summary,
        description:
          "Demo coaching package in the Bengaluru catalogue. Sending a request does not start coaching or take payment. The coach confirms scope first.",
        features: ["Written week", "Check-in", "Coach confirms before you start"],
        priceMinor: seed.priceMinor,
        currency: "INR",
        billing: "month",
        duration: "Monthly",
        status: "published",
        isDemo: true,
      },
    },
    { upsert: true },
  );
}

export async function seedDiscovery() {
  const allCoaches = [...coaches, ...catalogueCoaches()];
  const allPlaces = [...places, ...cataloguePlaces()];
  for (const coach of allCoaches) await upsertCoach(coach);
  for (const [
    slug,
    name,
    kind,
    sport,
    area,
    address,
    lat,
    lng,
    priceMinor,
    priceUnit,
    hours,
    surface,
    city = "Bengaluru",
  ] of allPlaces) {
    await Place.updateOne(
      { slug },
      {
        $set: {
          slug,
          name,
          kind,
          sport,
          area,
          address,
          city,
          point: { type: "Point", coordinates: [lng, lat] },
          priceMinor,
          currency: "INR",
          priceUnit,
          hours,
          surface,
          notes:
            "Sample rate for the Bengaluru demo catalogue. Confirm the slot with the venue. This is not a live booking.",
          isDemo: true,
        },
      },
      { upsert: true },
    );
  }
  console.log(
    `  ✓ Near you catalogue: ${allCoaches.length} coaches, ${allPlaces.length} places (demo rates)`,
  );
}

const direct = process.argv[1]?.replaceAll("\\", "/").endsWith("seed/seedDiscovery.js");
if (direct) {
  const { default: mongoose } = await import("mongoose");
  const { connectDatabase } = await import("../database/connectDatabase.js");
  await connectDatabase();
  try {
    await seedDiscovery();
  } finally {
    await mongoose.disconnect();
  }
}
