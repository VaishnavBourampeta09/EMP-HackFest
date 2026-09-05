import { distanceToPathMeters, haversineMeters } from './geo.js';

export const ZONE_LABELS = {
  property_crime: 'property crime',
  violent_crime: 'violent crime',
  collision: 'high-collision',
  low_light: 'poorly lit',
  user_reported: 'community reported'
};

export function getRecencyWeight(recencyDays) {
  if (recencyDays <= 7) return 3;
  if (recencyDays <= 30) return 2;
  if (recencyDays <= 90) return 1;
  return 0.5;
}

export function isAfterDark(date = new Date()) {
  const hour = date.getHours();
  return hour >= 19 || hour < 6;
}

export function riskLevel(score) {
  if (score <= 20) return 'Low';
  if (score <= 50) return 'Medium';
  return 'High';
}

export const PROXIMITY_BAND_METERS = 150;
export const CROSSING_WEIGHT = 3;
export const PROXIMITY_WEIGHT = 1;
export const SCORE_SCALE = 0.45;

export function scoreRoute(routePoints, incidentZones, options = {}) {
  const { currentTime = new Date(), safePlaces = [] } = options;
  let raw = 0;
  const crossed = [];
  const near = [];
  const reasons = [];

  for (const zone of incidentZones) {
    const distance = distanceToPathMeters([zone.lat, zone.lng], routePoints);
    const recencyWeight = getRecencyWeight(zone.recencyDays);
    if (distance <= zone.radiusMeters) {
      raw += zone.severity * recencyWeight * CROSSING_WEIGHT;
      crossed.push(zone);
    } else if (distance <= zone.radiusMeters + PROXIMITY_BAND_METERS) {
      raw += zone.severity * recencyWeight * PROXIMITY_WEIGHT;
      near.push(zone);
    }
  }

  let score = raw * SCORE_SCALE;

  let darkPenalty = 0;
  if (isAfterDark(currentTime)) {
    darkPenalty = 10;
    score += darkPenalty;
  }

  let safeBonus = 0;
  for (const place of safePlaces) {
    if (distanceToPathMeters([place.lat, place.lng], routePoints) <= place.radiusMeters) {
      safeBonus += 3;
    }
  }
  score = Math.max(0, score - safeBonus);

  const groupCount = (zones, type) => zones.filter((z) => z.type === type).length;
  for (const type of Object.keys(ZONE_LABELS)) {
    const c = groupCount(crossed, type);
    if (c > 0) {
      reasons.push(`Passes directly through ${c} ${ZONE_LABELS[type]} zone${c > 1 ? 's' : ''}`);
    }
  }
  for (const type of Object.keys(ZONE_LABELS)) {
    const n = groupCount(near, type);
    if (n > 0) {
      reasons.push(`Runs close to ${n} ${ZONE_LABELS[type]} zone${n > 1 ? 's' : ''}`);
    }
  }
  if (darkPenalty > 0) reasons.push('Trip happens after dark');
  if (safeBonus > 0) reasons.push('Passes trusted safe places along the way');
  if (crossed.length === 0 && near.length === 0) {
    reasons.push('Avoids every recent incident zone in the area');
  }

  const rounded = Math.min(Math.round(score), 100);
  return {
    score: rounded,
    level: riskLevel(rounded),
    reasons,
    crossedZones: crossed,
    nearbyZones: near
  };
}

export function explainScore(result, label) {
  const level = result.level.toLowerCase();
  const crossed = result.crossedZones.length;
  const near = result.nearbyZones.length;
  if (crossed === 0 && near === 0) {
    return `The ${label} route has ${level} risk because it avoids every mapped incident zone on the way.`;
  }
  const parts = [];
  if (crossed > 0) parts.push(`${crossed} zone${crossed > 1 ? 's' : ''} it passes through`);
  if (near > 0) parts.push(`${near} zone${near > 1 ? 's' : ''} it passes near`);
  return `The ${label} route has ${level} risk because of ${parts.join(' and ')}, weighted by how recent and how severe those reports are.`;
}

export function findNearbyIncidentZone(location, incidentZones) {
  let closest = null;
  let closestDistance = Infinity;
  for (const zone of incidentZones) {
    const distance = haversineMeters(location, [zone.lat, zone.lng]);
    if (distance <= zone.radiusMeters && distance < closestDistance) {
      closest = zone;
      closestDistance = distance;
    }
  }
  return closest;
}
