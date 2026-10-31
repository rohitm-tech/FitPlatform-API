import { CoachProfile } from "../models/coachProfileModel.js";
import { MarketListing } from "../models/marketplaceModel.js";
import { Place } from "../models/placeModel.js";
import { findCity, nearestCity, resolveLocation } from "../constants/locations.js";
import { cheapestPackage, coachSport, coachTeaches } from "./discoverService.js";
import { haversineKm, roundKm } from "./geo.js";

const GOAL_SPECIALTIES = {
  fat_loss: ["weight management", "fat loss", "conditioning"],
  muscle_gain: ["hypertrophy", "muscle gain", "bodybuilding"],
  strength: ["strength", "powerlifting", "olympic lifting"],
  race: ["race prep", "endurance", "marathon"],
  general_fitness: ["general fitness", "hybrid", "mobility"],
};
const LEVEL_SPECIALTIES = {
  beginner: ["beginners", "adult learners", "learn to swim", "fundamentals"],
  advanced: ["competition", "race prep", "performance"],
};

export const formatInr = (minor) => `₹${Math.round(minor / 100).toLocaleString("en-IN")}`;

function firstSentences(text, max = 220) {
  const sentences = String(text || "").match(/[^.!?]+[.!?]+/g) || [String(text || "")];
  let summary = "";
  for (const sentence of sentences) {
    if (/\b(demo|sample)\b/i.test(sentence) || /^\s*Based in\b/.test(sentence)) continue;
    if ((summary + sentence).length > max) break;
    summary += sentence;
  }
  return summary.trim() || sentences[0].slice(0, max).trim();
}

function specialtyFit(specialties, keywords) {
  const lower = (specialties || []).map((value) => value.toLowerCase());
  const hit = keywords.find((word) => lower.includes(word));
  return hit ? specialties[lower.indexOf(hit)] : null;
}

/**
 * Pure ranking. `coaches` are public profiles with a populated `coachId`
 * ({ _id, name }) and a `packages` array. `origin` is { lat, lng, label } or null.
 */
export function rankCoaches(coaches, criteria = {}) {
  const {
    sport,
    origin = null,
    city = "",
    maxKm = 15,
    setting = "either",
    budgetMonthlyInr = null,
    languages = [],
    goal,
    experienceLevel,
    query = "",
    includeFull = false,
    limit = 3,
  } = criteria;
  const needle = query.trim().toLowerCase();
  const wantedLanguages = languages.map((value) => value.toLowerCase());
  const knowsLocation = Boolean(origin || city);
  const ranked = [];

  for (const profile of coaches) {
    if (!profile.coachId) continue;
    if (sport && !coachTeaches(profile, sport)) continue;
    if (!includeFull && !profile.acceptingAthletes) continue;

    const reasons = [];
    const cautions = [];
    let score = 0;
    const main = coachSport(profile);
    if (sport) {
      score += main === sport ? 30 : 18;
      reasons.push(main === sport ? `${sport} is their main sport` : `Also coaches ${sport}`);
    }

    const coords = profile.point?.coordinates;
    const hasCoords = Array.isArray(coords) && coords.length === 2;
    const coachCity =
      profile.city ||
      (hasCoords ? nearestCity(coords[1], coords[0]) : null) ||
      findCity(profile.location)?.name ||
      "";
    const distanceKm =
      origin && hasCoords
        ? roundKm(haversineKm(origin.lat, origin.lng, coords[1], coords[0]))
        : null;
    const remote = Boolean(profile.remoteAvailable);
    let delivery = "in_person";

    if (setting === "online") {
      if (!remote) continue;
      delivery = "online";
      score += 20;
      reasons.push("Coaches online, as you prefer");
    } else if (knowsLocation) {
      const reachable =
        distanceKm != null ? distanceKm <= maxKm : Boolean(city) && coachCity === city;
      if (reachable) {
        if (distanceKm != null) {
          score += 10 + 20 * (1 - distanceKm / maxKm);
          reasons.push(`${distanceKm} km from ${origin.label}`);
        } else {
          score += 18;
          reasons.push(`Based in ${coachCity}`);
        }
      } else if (remote && setting === "either") {
        delivery = "online";
        score += 6;
        reasons.push(
          distanceKm != null && distanceKm <= 100
            ? `${distanceKm} km away, but coaches online`
            : `Coaches online from ${coachCity || profile.location}`,
        );
      } else {
        continue;
      }
    }

    const pack = cheapestPackage(profile.packages);
    const priceUnit = pack ? (pack.billing === "month" ? "month" : "package") : "";
    if (pack && budgetMonthlyInr != null) {
      const price = `From ${formatInr(pack.priceMinor)}/${priceUnit}`;
      if (pack.priceMinor <= budgetMonthlyInr * 100) {
        score += 12;
        reasons.push(`${price}, inside your ${formatInr(budgetMonthlyInr * 100)} budget`);
      } else {
        score -= 8;
        cautions.push(`${price}, above your ${formatInr(budgetMonthlyInr * 100)} budget`);
      }
    }

    const years = profile.experienceYears || 0;
    score += Math.min(years, 15) * 0.8;
    if (years >= 5) reasons.push(`${years} years coaching`);

    const goalFit = goal ? specialtyFit(profile.specialties, GOAL_SPECIALTIES[goal] || []) : null;
    if (goalFit) {
      score += 6;
      reasons.push(`Works on ${goalFit.toLowerCase()}, matching your goal`);
    }
    const levelFit = experienceLevel
      ? specialtyFit(profile.specialties, LEVEL_SPECIALTIES[experienceLevel] || [])
      : null;
    if (levelFit) {
      score += 5;
      reasons.push(`Specialises in ${levelFit.toLowerCase()}`);
    }

    const language = (profile.languages || []).find(
      (value) => wantedLanguages.includes(value.toLowerCase()) && value.toLowerCase() !== "english",
    );
    if (language) {
      score += 5;
      reasons.push(`Coaches in ${language}`);
    }

    if (needle) {
      const text = [profile.coachId.name, profile.headline, profile.bio, ...(profile.specialties || [])]
        .join(" ")
        .toLowerCase();
      if (text.includes(needle)) {
        score += 8;
        reasons.push(`Mentions “${query.trim()}”`);
      }
    }
    if (!profile.acceptingAthletes) cautions.push("Not accepting new athletes right now");

    ranked.push({
      type: "coach",
      coachId: String(profile.coachId._id || profile.coachId),
      name: profile.coachId.name,
      sport: main,
      sports: (profile.specialties || []).filter((value) => value !== main),
      headline: profile.headline || "",
      summary: firstSentences(profile.bio),
      area: profile.location || "",
      city: coachCity,
      distanceKm,
      delivery,
      experienceYears: profile.experienceYears ?? null,
      priceMinor: pack ? pack.priceMinor : null,
      priceUnit,
      remote,
      accepting: Boolean(profile.acceptingAthletes),
      languages: profile.languages || [],
      reasons: reasons.slice(0, 4),
      cautions,
      matchScore: Math.max(0, Math.min(100, Math.round(score))),
      isDemo: Boolean(profile.isDemo),
    });
  }

  ranked.sort(
    (a, b) =>
      b.matchScore - a.matchScore ||
      (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) ||
      a.name.localeCompare(b.name),
  );
  return { total: ranked.length, matches: ranked.slice(0, limit) };
}

/** The search origin: an explicitly named place wins over the saved profile location. */
export function searchOrigin(profileLocation, { city, area } = {}) {
  if (city || area) {
    const resolved = resolveLocation({ city, area });
    return {
      origin:
        resolved.latitude != null
          ? { lat: resolved.latitude, lng: resolved.longitude, label: resolved.area || resolved.city }
          : null,
      city: resolved.city,
    };
  }
  const saved = profileLocation || {};
  return {
    origin:
      saved.latitude != null && saved.longitude != null
        ? { lat: saved.latitude, lng: saved.longitude, label: saved.area || saved.city || "you" }
        : null,
    city: saved.city || "",
  };
}

export async function loadPublicCoaches() {
  const profiles = await CoachProfile.find({ isPublic: true })
    .populate({ path: "coachId", match: { roles: "coach" }, select: "name" })
    .lean();
  const visible = profiles.filter((profile) => profile.coachId);
  const packages = await MarketListing.find({
    providerId: { $in: visible.map((profile) => profile.coachId._id) },
    category: "coaching",
    status: "published",
  })
    .select("providerId priceMinor currency billing category")
    .lean();
  return visible.map((profile) => ({
    ...profile,
    packages: packages.filter((item) => String(item.providerId) === String(profile.coachId._id)),
  }));
}

/**
 * Coach search for one athlete. Arguments override the saved profile; when
 * nothing is reachable in person, the radius widens once before giving up.
 */
export async function findCoachMatches(athlete, args = {}) {
  const profile = athlete?.profile || {};
  const { origin, city } = searchOrigin(profile.location, args);
  const criteria = {
    sport: args.sport,
    origin,
    city,
    maxKm: args.maxKm || 15,
    setting: args.setting || profile.trainingSetting || "either",
    budgetMonthlyInr: args.budgetMonthlyInr ?? profile.budgetMonthlyInr ?? null,
    languages: args.language ? [args.language] : profile.languages || [],
    goal: profile.goal,
    experienceLevel: profile.experienceLevel,
    query: args.query || "",
    limit: Math.min(args.limit || 3, 5),
  };
  const coaches = await loadPublicCoaches();
  let result = rankCoaches(coaches, criteria);
  let widenedToKm = null;
  let onlineFallback = false;
  if (!result.total && origin && criteria.setting !== "online") {
    widenedToKm = criteria.maxKm * 3;
    result = rankCoaches(coaches, { ...criteria, maxKm: widenedToKm });
  }
  if (!result.total && criteria.setting === "in_person") {
    onlineFallback = true;
    result = rankCoaches(coaches, { ...criteria, setting: "online" });
  }
  return {
    ...result,
    searched: {
      sport: criteria.sport || null,
      near: origin?.label || city || null,
      maxKm: widenedToKm || criteria.maxKm,
      widened: widenedToKm != null,
      onlineFallback,
      setting: criteria.setting,
    },
  };
}

export async function findPlaceMatches(athlete, args = {}) {
  const { origin, city } = searchOrigin(athlete?.profile?.location, args);
  const filter = {};
  if (args.sport) filter.sport = args.sport;
  if (args.kind) filter.kind = args.kind;
  const maxKm = args.maxKm || 10;
  const places = await Place.find(filter).lean();
  const rows = places
    .map((place) => {
      const [lng, lat] = place.point.coordinates;
      return {
        type: "place",
        placeId: String(place._id),
        name: place.name,
        kind: place.kind,
        sport: place.sport,
        area: place.area,
        city: place.city,
        distanceKm: origin ? roundKm(haversineKm(origin.lat, origin.lng, lat, lng)) : null,
        priceMinor: place.priceMinor,
        priceUnit: place.priceMinor === 0 ? "none" : place.priceUnit,
        hours: place.hours || "",
        summary: place.surface || "",
        isDemo: Boolean(place.isDemo),
      };
    })
    .filter((row) =>
      origin ? row.distanceKm <= maxKm : city ? row.city === city : true,
    )
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0) || a.name.localeCompare(b.name));
  return {
    total: rows.length,
    matches: rows.slice(0, Math.min(args.limit || 4, 6)),
    searched: { sport: args.sport || null, kind: args.kind || null, near: origin?.label || city || null, maxKm },
  };
}
