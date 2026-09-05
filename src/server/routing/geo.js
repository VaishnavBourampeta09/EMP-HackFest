import { RoutingInputError } from './errors.js';

const COORDINATE_PATTERN = /^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/;

function finiteNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function assertCoordinate(lat, lng, field = 'location') {
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new RoutingInputError(
      `${field} must contain a valid latitude (-90…90) and longitude (-180…180).`,
      { field }
    );
  }
  return { lat, lng };
}

export function coordinateFromInput(input, field = 'location') {
  if (Array.isArray(input) && input.length >= 2) {
    return assertCoordinate(finiteNumber(input[0]), finiteNumber(input[1]), field);
  }

  if (typeof input === 'string') {
    const match = input.match(COORDINATE_PATTERN);
    return match
      ? assertCoordinate(finiteNumber(match[1]), finiteNumber(match[2]), field)
      : null;
  }

  if (!input || typeof input !== 'object') return null;

  if (input.type === 'Point' && Array.isArray(input.coordinates)) {
    return assertCoordinate(
      finiteNumber(input.coordinates[1]),
      finiteNumber(input.coordinates[0]),
      field
    );
  }

  const lat = finiteNumber(input.lat ?? input.latitude);
  const lng = finiteNumber(input.lng ?? input.lon ?? input.longitude);
  return lat === null && lng === null ? null : assertCoordinate(lat, lng, field);
}

export function placeFromCoordinate(coordinate, name, provider = 'coordinates') {
  return {
    name: name || `${coordinate.lat.toFixed(5)}, ${coordinate.lng.toFixed(5)}`,
    lat: coordinate.lat,
    lng: coordinate.lng,
    coordinate: [coordinate.lat, coordinate.lng],
    provider
  };
}

export function decodePolyline(encoded, precision = 5) {
  if (!encoded || typeof encoded !== 'string') return [];

  const factor = 10 ** precision;
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    const values = [];

    for (let coordinateIndex = 0; coordinateIndex < 2; coordinateIndex += 1) {
      let byte;
      let shift = 0;
      let result = 0;

      do {
        if (index >= encoded.length) {
          throw new RoutingInputError('The routing provider returned an invalid encoded route.');
        }
        byte = encoded.charCodeAt(index) - 63;
        index += 1;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      values.push(result & 1 ? ~(result >> 1) : result >> 1);
    }

    lat += values[0];
    lng += values[1];
    coordinates.push([lng / factor, lat / factor]);
  }

  return coordinates;
}

export function pointsFromGeometry(geometry) {
  return Array.isArray(geometry?.coordinates)
    ? geometry.coordinates.map(([lng, lat]) => [lat, lng])
    : [];
}

export function mergeLineCoordinates(lines) {
  const merged = [];

  for (const line of lines) {
    for (const coordinate of line || []) {
      const previous = merged[merged.length - 1];
      if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) {
        merged.push(coordinate);
      }
    }
  }

  return merged;
}

export function normalizeIsoDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RoutingInputError('departureTime must be a valid ISO-8601 date and time.', {
      field: 'departureTime'
    });
  }
  return date.toISOString();
}

export function clampCandidateCount(value, fallback = 3) {
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) ? Math.min(4, Math.max(1, count)) : fallback;
}
