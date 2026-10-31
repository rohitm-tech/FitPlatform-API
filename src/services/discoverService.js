import { PLACE_KINDS, SPORTS } from "../constants/sports.js";
import { haversineKm, roundKm } from "./geo.js";

export { SPORTS, haversineKm, roundKm };
export const BENGALURU = { lat: 12.9716, lng: 77.5946, label: "Bengaluru" };
export const KINDS = ["coach", ...PLACE_KINDS];
const SPORT_BY_KIND = {
  gym: "Strength",
  pool: "Swimming",
  box: "CrossFit",
  studio: "Yoga",
  court: "Badminton",
  wall: "Climbing",
  dojo: "Martial Arts",
  cricket: "Cricket",
  turf: "Football",
  track: "Running",
};

function textOf(item) {
  return [item.name, item.area, item.sport, item.detail, item.kind]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function coachSport(profile) {
  if (SPORTS.includes(profile.sport)) return profile.sport;
  return SPORTS.find((sport) => profile.specialties?.includes(sport)) || "Strength";
}

/** A coach matches a sport when it is their main sport or one of their specialties. */
export function coachTeaches(profile, sport) {
  return coachSport(profile) === sport || Boolean(profile.specialties?.includes(sport));
}

export function cheapestPackage(packages) {
  const coaching = (packages || []).filter((item) => item.category === "coaching");
  if (!coaching.length) return null;
  return coaching.reduce((lowest, item) =>
    item.priceMinor < lowest.priceMinor ? item : lowest,
  );
}

/**
 * `coaches` are public profiles with a populated coachId and a `packages` array.
 * `places` are venue documents. Distances are measured from `origin`.
 * Counts and the list use the same rounded kilometres.
 */
export function assembleDiscover({
  coaches = [],
  places = [],
  origin,
  radiusKm,
  kind,
  sport = "all",
  q = "",
  acceptingOnly = false,
}) {
  const needle = q.trim().toLowerCase();
  const rows = [];

  for (const profile of coaches) {
    const coords = profile.point?.coordinates;
    if (!profile.coachId || !coords || coords.length < 2) continue;
    const [lng, lat] = coords;
    const itemSport = coachSport(profile);
    const pack = cheapestPackage(profile.packages);
    rows.push({
      id: String(profile.coachId._id || profile.coachId),
      kind: "coach",
      name: profile.coachId.name,
      area: profile.location || "",
      sport: itemSport,
      sports: (profile.specialties || []).filter((value) => SPORTS.includes(value)),
      detail: profile.headline || "",
      distanceKm: roundKm(haversineKm(origin.lat, origin.lng, lat, lng)),
      priceMinor: pack ? pack.priceMinor : null,
      priceUnit: pack ? (pack.billing === "month" ? "month" : "package") : "",
      pricePrefix: pack ? "From" : "",
      accepting: Boolean(profile.acceptingAthletes),
      remote: Boolean(profile.remoteAvailable),
      isDemo: Boolean(profile.isDemo),
      lat,
      lng,
    });
  }

  for (const place of places) {
    const coords = place.point?.coordinates;
    if (!coords || coords.length < 2) continue;
    const [lng, lat] = coords;
    rows.push({
      id: String(place._id),
      kind: place.kind,
      name: place.name,
      area: place.area || "",
      sport: place.sport || SPORT_BY_KIND[place.kind] || "",
      detail: place.surface || "",
      distanceKm: roundKm(haversineKm(origin.lat, origin.lng, lat, lng)),
      priceMinor: place.priceMinor,
      priceUnit: place.priceMinor === 0 ? "none" : place.priceUnit,
      pricePrefix: "",
      accepting: null,
      remote: false,
      isDemo: Boolean(place.isDemo),
      lat,
      lng,
      hours: place.hours || "",
      address: place.address || "",
    });
  }

  const matching = rows.filter((item) => {
    if (sport !== "all" && item.sport !== sport && !item.sports?.includes(sport))
      return false;
    if (needle && !textOf(item).includes(needle)) return false;
    if (acceptingOnly && item.kind === "coach" && !item.accepting) return false;
    return true;
  });

  const inside = matching.filter((item) => item.distanceKm <= radiusKm);
  const counts = Object.fromEntries(KINDS.map((key) => [key, 0]));
  for (const item of inside) counts[item.kind] += 1;

  const results = inside
    .filter((item) => item.kind === kind)
    .sort(
      (a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name),
    );

  const outside = matching
    .filter((item) => item.kind === kind && item.distanceKm > radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const nearest = outside[0]
    ? { id: outside[0].id, name: outside[0].name, distanceKm: outside[0].distanceKm, kind }
    : null;

  return { counts, results, nearest };
}
