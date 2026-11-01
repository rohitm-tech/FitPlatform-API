import { SPORTS } from "./sports.js";

export const SESSION_KINDS = [
  "strength",
  "swim",
  "endurance",
  "station",
  "rounds",
  "practice",
];

/** How a catalogue sport is measured when a coach assigns a session. */
export const SPORT_KIND = {
  Strength: "strength",
  Calisthenics: "strength",
  Swimming: "swim",
  Running: "endurance",
  Cycling: "endurance",
  Triathlon: "endurance",
  HYROX: "station",
  CrossFit: "station",
  Boxing: "rounds",
  "Martial Arts": "rounds",
  Yoga: "practice",
  Pilates: "practice",
  Dance: "practice",
  Tennis: "practice",
  Badminton: "practice",
  Basketball: "practice",
  Football: "practice",
  Cricket: "practice",
  Squash: "practice",
  Climbing: "practice",
};

export const SWIM_STROKES = [
  "Freestyle",
  "Backstroke",
  "Breaststroke",
  "Butterfly",
  "Medley",
  "Kick",
  "Drill",
];

export const HYROX_STATIONS = [
  { name: "1 km run", metric: "distance", amount: 1000 },
  { name: "SkiErg", metric: "distance", amount: 1000 },
  { name: "Sled push", metric: "distance", amount: 50 },
  { name: "Sled pull", metric: "distance", amount: 50 },
  { name: "Burpee broad jumps", metric: "distance", amount: 80 },
  { name: "Rowing", metric: "distance", amount: 1000 },
  { name: "Farmers carry", metric: "distance", amount: 200 },
  { name: "Sandbag lunges", metric: "distance", amount: 100 },
  { name: "Wall balls", metric: "reps", amount: 100 },
];

export function kindForSport(sport) {
  return SPORT_KIND[sport] || "practice";
}

export function isKnownSport(sport) {
  return SPORTS.includes(sport);
}
