export const SPORTS = [
  "Strength",
  "Running",
  "Swimming",
  "Cricket",
  "Football",
  "HYROX",
  "CrossFit",
  "Yoga",
  "Pilates",
  "Cycling",
  "Boxing",
  "Martial Arts",
  "Tennis",
  "Badminton",
  "Basketball",
  "Climbing",
  "Calisthenics",
  "Dance",
  "Triathlon",
  "Squash",
];

/** Facility types. A place also carries one explicit sport. */
export const PLACE_KINDS = [
  "gym",
  "pool",
  "box",
  "studio",
  "court",
  "wall",
  "dojo",
  "turf",
  "cricket",
  "track",
];

export const PRICE_UNITS = ["hour", "session", "lane-hour", "class", "month", "none"];

const ALIASES = {
  strength: "Strength",
  gym: "Strength",
  weights: "Strength",
  weightlifting: "Strength",
  bodybuilding: "Strength",
  powerlifting: "Strength",
  "personal training": "Strength",
  running: "Running",
  run: "Running",
  jogging: "Running",
  marathon: "Running",
  swimming: "Swimming",
  swim: "Swimming",
  swimmer: "Swimming",
  cricket: "Cricket",
  football: "Football",
  soccer: "Football",
  hyrox: "HYROX",
  "high rox": "HYROX",
  "high rocks": "HYROX",
  "hi rox": "HYROX",
  crossfit: "CrossFit",
  "cross fit": "CrossFit",
  yoga: "Yoga",
  pilates: "Pilates",
  cycling: "Cycling",
  cyclist: "Cycling",
  bike: "Cycling",
  spin: "Cycling",
  boxing: "Boxing",
  kickboxing: "Boxing",
  "martial arts": "Martial Arts",
  mma: "Martial Arts",
  karate: "Martial Arts",
  taekwondo: "Martial Arts",
  judo: "Martial Arts",
  "jiu jitsu": "Martial Arts",
  "jiu-jitsu": "Martial Arts",
  bjj: "Martial Arts",
  muaythai: "Martial Arts",
  "muay thai": "Martial Arts",
  tennis: "Tennis",
  badminton: "Badminton",
  basketball: "Basketball",
  climbing: "Climbing",
  bouldering: "Climbing",
  calisthenics: "Calisthenics",
  "street workout": "Calisthenics",
  dance: "Dance",
  zumba: "Dance",
  triathlon: "Triathlon",
  ironman: "Triathlon",
  squash: "Squash",
};

/** Maps free text ("swim", "high rocks", "MMA") to a catalogue sport, or null. */
export function normalizeSport(value) {
  if (!value) return null;
  const text = String(value).trim().toLowerCase();
  const exact = SPORTS.find((sport) => sport.toLowerCase() === text);
  if (exact) return exact;
  if (ALIASES[text]) return ALIASES[text];
  const words = text.replace(/[^a-z\s-]/g, " ");
  const alias = Object.keys(ALIASES)
    .sort((a, b) => b.length - a.length)
    .find((key) => new RegExp(`\\b${key}\\b`).test(words));
  return alias ? ALIASES[alias] : null;
}
