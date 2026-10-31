import { User } from "../models/userModel.js";
import { nearestCity, resolveLocation } from "../constants/locations.js";

const EMPTY_LOCATION = { city: "", area: "", latitude: null, longitude: null, source: "" };

/** Device coordinates win; otherwise typed city/area text is resolved through the gazetteer. */
export function locationFrom(input, source = "typed") {
  if (!input) return EMPTY_LOCATION;
  const hasPoint = input.latitude != null && input.longitude != null;
  if (hasPoint) {
    return {
      city: String(input.city || "").trim() || nearestCity(input.latitude, input.longitude) || "",
      area: String(input.area || "").trim(),
      latitude: input.latitude,
      longitude: input.longitude,
      source: source === "chat" ? "chat" : "device",
    };
  }
  const resolved = resolveLocation(input);
  if (!resolved.city && !resolved.area) return EMPTY_LOCATION;
  return {
    city: resolved.city,
    area: resolved.area,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    source,
  };
}

export function profileUpdate(updates, source = "typed") {
  const set = {};
  for (const [key, value] of Object.entries(updates)) {
    if (key === "location" || key === "name" || value === undefined) continue;
    set[`profile.${key}`] = value;
  }
  if (updates.location !== undefined) set["profile.location"] = locationFrom(updates.location, source);
  return set;
}

export async function updateAthleteProfile(userId, updates, { source = "typed", completeOnboarding = false } = {}) {
  const set = profileUpdate(updates, source);
  if (typeof updates.name === "string" && updates.name.trim()) set.name = updates.name.trim();
  if (completeOnboarding) set.onboardingCompleted = true;
  return User.findByIdAndUpdate(userId, { $set: set }, { new: true, runValidators: true }).select("-passwordHash");
}
