import { haversineKm } from "../services/geo.js";

/** Approximate neighbourhood centres for the cities the catalogue covers. */
export const CITIES = [
  {
    name: "Bengaluru",
    aliases: ["bangalore", "blr"],
    lat: 12.9716,
    lng: 77.5946,
    areas: {
      "Indiranagar": [12.9784, 77.6408],
      "Koramangala": [12.9352, 77.6245],
      "HSR Layout": [12.9121, 77.6446],
      "Jayanagar": [12.9308, 77.5838],
      "JP Nagar": [12.9063, 77.5857],
      "Whitefield": [12.9698, 77.75],
      "Malleshwaram": [13.0031, 77.5643],
      "Hebbal": [13.0358, 77.597],
      "Electronic City": [12.8452, 77.6602],
      "Marathahalli": [12.9569, 77.7011],
      "BTM Layout": [12.9166, 77.6101],
      "Ashok Nagar": [12.9688, 77.594],
      "Cubbon Park": [12.9763, 77.5929],
      "Ulsoor": [12.9825, 77.62],
      "Sadashivanagar": [13.0068, 77.5805],
      "Yelahanka": [13.1007, 77.5963],
      "Bellandur": [12.926, 77.6762],
      "Banashankari": [12.9255, 77.5468],
      "Rajajinagar": [12.991, 77.552],
      "Sarjapur Road": [12.91, 77.687],
      "Lalbagh": [12.9507, 77.5848],
    },
  },
  {
    name: "Mumbai",
    aliases: ["bombay"],
    lat: 19.076,
    lng: 72.8777,
    areas: {
      "Bandra West": [19.0596, 72.8295],
      "Andheri West": [19.1364, 72.8296],
      "Powai": [19.1176, 72.906],
      "Lower Parel": [18.998, 72.8302],
      "Juhu": [19.1075, 72.8263],
      "Colaba": [18.9067, 72.8147],
      "Worli": [19.0176, 72.8174],
      "Goregaon": [19.1663, 72.8526],
      "Chembur": [19.0522, 72.9005],
      "Thane": [19.2183, 72.9781],
    },
  },
  {
    name: "Delhi",
    aliases: ["new delhi", "ncr"],
    lat: 28.6139,
    lng: 77.209,
    areas: {
      "Connaught Place": [28.6315, 77.2167],
      "Hauz Khas": [28.5494, 77.2001],
      "Saket": [28.5245, 77.2066],
      "Vasant Kunj": [28.52, 77.1586],
      "Dwarka": [28.5921, 77.046],
      "Rohini": [28.7495, 77.0565],
      "Lajpat Nagar": [28.5677, 77.2433],
      "Greater Kailash": [28.5482, 77.2341],
      "Karol Bagh": [28.6519, 77.1909],
      "Janakpuri": [28.6219, 77.0878],
    },
  },
  {
    name: "Gurugram",
    aliases: ["gurgaon"],
    lat: 28.4595,
    lng: 77.0266,
    areas: {
      "DLF Phase 4": [28.4664, 77.0827],
      "Golf Course Road": [28.4521, 77.0965],
      "Sohna Road": [28.4089, 77.0418],
      "Cyber City": [28.495, 77.089],
      "Sector 56": [28.4227, 77.1006],
    },
  },
  {
    name: "Hyderabad",
    aliases: ["hyd", "secunderabad"],
    lat: 17.385,
    lng: 78.4867,
    areas: {
      "Banjara Hills": [17.4156, 78.4347],
      "Jubilee Hills": [17.4325, 78.4073],
      "Gachibowli": [17.4401, 78.3489],
      "HITEC City": [17.4435, 78.3772],
      "Madhapur": [17.4483, 78.3915],
      "Kondapur": [17.47, 78.36],
      "Secunderabad": [17.4399, 78.4983],
      "Kukatpally": [17.4948, 78.3996],
      "Begumpet": [17.4447, 78.4664],
    },
  },
  {
    name: "Chennai",
    aliases: ["madras"],
    lat: 13.0827,
    lng: 80.2707,
    areas: {
      "Adyar": [13.0012, 80.2565],
      "Anna Nagar": [13.085, 80.2101],
      "T Nagar": [13.0418, 80.2341],
      "Velachery": [12.9815, 80.218],
      "Besant Nagar": [12.9986, 80.2668],
      "Nungambakkam": [13.0569, 80.2425],
      "Sholinganallur": [12.901, 80.2279],
      "Mylapore": [13.0368, 80.2676],
    },
  },
  {
    name: "Pune",
    aliases: ["poona"],
    lat: 18.5204,
    lng: 73.8567,
    areas: {
      "Koregaon Park": [18.5362, 73.894],
      "Kothrud": [18.5074, 73.8077],
      "Baner": [18.559, 73.7868],
      "Hinjewadi": [18.5913, 73.7389],
      "Viman Nagar": [18.5679, 73.9143],
      "Aundh": [18.558, 73.8075],
      "Kalyani Nagar": [18.5463, 73.9033],
      "Hadapsar": [18.5089, 73.926],
    },
  },
];

const clean = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function findCity(value) {
  const text = clean(value);
  if (!text) return null;
  return (
    CITIES.find(
      (city) =>
        clean(city.name) === text || city.aliases.includes(text),
    ) ||
    CITIES.find((city) =>
      [city.name, ...city.aliases].some((name) =>
        new RegExp(`\\b${clean(name)}\\b`).test(text),
      ),
    ) ||
    null
  );
}

function findArea(city, value) {
  const text = clean(value);
  if (!text) return null;
  const names = Object.keys(city.areas);
  const name =
    names.find((area) => clean(area) === text) ||
    names.find((area) => new RegExp(`\\b${clean(area)}\\b`).test(text)) ||
    names.find((area) => text.length >= 2 && clean(area).startsWith(`${text} `)) ||
    names.find((area) => text.length >= 4 && clean(area).includes(text));
  return name ? { name, lat: city.areas[name][0], lng: city.areas[name][1] } : null;
}

/**
 * Resolves typed city/area text to coordinates. Unknown places keep the
 * typed text with null coordinates rather than guessing.
 */
export function resolveLocation({ city, area } = {}) {
  let match = findCity(city) || findCity(area);
  let place = match ? findArea(match, area) || findArea(match, city) : null;
  if (!match && area) {
    for (const candidate of CITIES) {
      place = findArea(candidate, area);
      if (place) {
        match = candidate;
        break;
      }
    }
  }
  if (!match) {
    return {
      city: String(city || "").trim(),
      area: String(area || "").trim(),
      latitude: null,
      longitude: null,
      precision: "none",
    };
  }
  return {
    city: match.name,
    area: place?.name || String(area || "").trim(),
    latitude: place ? place.lat : match.lat,
    longitude: place ? place.lng : match.lng,
    precision: place ? "area" : "city",
  };
}

/** The catalogue city within `maxKm` of a point, or null. */
export function nearestCity(lat, lng, maxKm = 80) {
  let best = null;
  for (const city of CITIES) {
    const km = haversineKm(lat, lng, city.lat, city.lng);
    if (km <= maxKm && (!best || km < best.km)) best = { name: city.name, km };
  }
  return best?.name || null;
}

export const locationDirectory = () =>
  CITIES.map((city) => ({
    city: city.name,
    lat: city.lat,
    lng: city.lng,
    areas: Object.keys(city.areas),
  }));
