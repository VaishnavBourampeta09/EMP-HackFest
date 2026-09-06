import { haversineMeters, pathLengthMeters } from "./geo.js";

/** A lamp is treated as covering the path within this radius. */
export const LAMP_RADIUS_METERS = 40;

/** Grid cell size in degrees, sized so one cell comfortably exceeds the radius. */
const CELL = 0.001;

function cellKey(lat, lng) {
  return `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;
}

/**
 * Bucket lamps into a coarse grid so coverage is O(points), not O(points×lamps).
 * A route has a few hundred sample points and a bbox can hold a thousand lamps.
 */
function indexLamps(lamps) {
  const grid = new Map();
  for (const lamp of lamps) {
    if (!Array.isArray(lamp) || lamp.length < 2) continue;
    const key = cellKey(lamp[0], lamp[1]);
    const bucket = grid.get(key);
    if (bucket) bucket.push(lamp);
    else grid.set(key, [lamp]);
  }
  return grid;
}

function hasLampNear(grid, point, radius) {
  const [lat, lng] = point;
  const baseLat = Math.floor(lat / CELL);
  const baseLng = Math.floor(lng / CELL);

  for (let dLat = -1; dLat <= 1; dLat += 1) {
    for (let dLng = -1; dLng <= 1; dLng += 1) {
      const bucket = grid.get(`${baseLat + dLat}:${baseLng + dLng}`);
      if (!bucket) continue;
      for (const lamp of bucket) {
        if (haversineMeters(point, lamp) <= radius) return true;
      }
    }
  }
  return false;
}

/**
 * Lit coverage for a route: what share of its sampled points sit within
 * {@link LAMP_RADIUS_METERS} of a mapped street lamp, plus the longest
 * continuous stretch with no lamp at all.
 *
 * Returns `available: false` when there is no lamp data, so callers can hide the
 * figure rather than presenting 0% as if it were a measurement.
 */
export function lightingForRoute(points = [], lamps = [], options = {}) {
  const { radiusMeters = LAMP_RADIUS_METERS } = options;

  if (points.length < 2 || lamps.length === 0) {
    return {
      available: false,
      coveragePercent: null,
      litPoints: 0,
      totalPoints: points.length,
      longestGapMeters: null,
      lampsNearby: lamps.length,
      radiusMeters,
    };
  }

  const grid = indexLamps(lamps);
  const flags = points.map((point) => hasLampNear(grid, point, radiusMeters));
  const litPoints = flags.reduce((total, lit) => total + (lit ? 1 : 0), 0);

  // Longest run of consecutive unlit points, measured in metres along the path.
  let longestGapMeters = 0;
  let runStart = -1;
  for (let i = 0; i < flags.length; i += 1) {
    if (!flags[i]) {
      if (runStart === -1) runStart = i;
      const isLast = i === flags.length - 1;
      if (isLast) {
        longestGapMeters = Math.max(
          longestGapMeters,
          pathLengthMeters(points.slice(runStart, i + 1)),
        );
      }
    } else if (runStart !== -1) {
      longestGapMeters = Math.max(
        longestGapMeters,
        pathLengthMeters(points.slice(runStart, i + 1)),
      );
      runStart = -1;
    }
  }

  return {
    available: true,
    coveragePercent: Math.round((litPoints / flags.length) * 100),
    litPoints,
    totalPoints: flags.length,
    longestGapMeters: Math.round(longestGapMeters),
    lampsNearby: lamps.length,
    radiusMeters,
  };
}

/** Padded bounding box around a route, in the west,south,east,north order the API expects. */
export function routeBbox(points = [], padDegrees = 0.004) {
  if (points.length === 0) return null;
  let minLat = points[0][0];
  let maxLat = points[0][0];
  let minLng = points[0][1];
  let maxLng = points[0][1];

  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  return [
    minLng - padDegrees,
    minLat - padDegrees,
    maxLng + padDegrees,
    maxLat + padDegrees,
  ];
}

/** How the coverage number should read to a person. */
export function lightingVerdict(lighting, afterDark) {
  if (!lighting?.available) return null;
  const coverage = lighting.coveragePercent;
  if (coverage >= 80) {
    return {
      level: "good",
      label: "Well lit",
      detail: `${coverage}% of this route is within ${lighting.radiusMeters} m of a mapped street lamp.`,
    };
  }
  if (coverage >= 50) {
    return {
      level: "mixed",
      label: "Partly lit",
      detail: `${coverage}% lit, with a ${lighting.longestGapMeters} m stretch that has no mapped lamp.`,
    };
  }
  return {
    level: "poor",
    label: afterDark ? "Poorly lit after dark" : "Poorly lit",
    detail: `Only ${coverage}% of this route is near a mapped lamp; the longest dark stretch runs ${lighting.longestGapMeters} m.`,
  };
}
