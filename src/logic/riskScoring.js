import { distanceToPathMeters, haversineMeters } from './geo.js';

export const ZONE_LABELS = {
  property_crime: 'property crime',
  violent_crime: 'violent crime',
  collision: 'high-collision',
  low_light: 'poorly lit',
  user_reported: 'community reported'
};

export function getRecencyWeight(recencyDays) {
  const age = Math.max(0, Number(recencyDays) || 0);
  return Math.exp(-age / 90);
}

export function isAfterDark(date = new Date()) {
  const parsed = date instanceof Date ? date : new Date(date);
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const hour = safeDate.getHours();
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
export const DISTANCE_DECAY_METERS = 250;
export const SCORE_SCALE = 2.5;

export const ROUTING_WEIGHTS = Object.freeze({
  day: Object.freeze({ safety: 0.7, travelTime: 0.3 }),
  night: Object.freeze({ safety: 0.85, travelTime: 0.15 })
});

const TRANSIT_RISK_WEIGHTS = Object.freeze({
  day: Object.freeze({ waitMinute: 0.55, transfer: 3 }),
  night: Object.freeze({ waitMinute: 0.9, transfer: 5 })
});

const DISRUPTION_SEVERITY_RISK = Object.freeze({
  none: 0,
  clear: 0,
  info: 1,
  minor: 4,
  moderate: 8,
  major: 14,
  severe: 18
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const roundTo = (value, places = 1) => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

function distanceToPathsMeters(point, paths) {
  let closest = Infinity;
  for (const path of paths) {
    const distance = distanceToPathMeters(point, path);
    if (distance < closest) closest = distance;
  }
  return closest;
}

function disruptionPenalty(disruption) {
  if (!disruption) return 0;
  if (Array.isArray(disruption)) {
    return disruption.reduce((total, item) => total + disruptionPenalty(item), 0);
  }
  if (typeof disruption === 'string') {
    return DISRUPTION_SEVERITY_RISK[disruption.toLowerCase()] ?? 4;
  }
  if (disruption.active === false || disruption.status === 'clear') return 0;

  const severity = String(disruption.severity ?? disruption.status ?? 'minor').toLowerCase();
  const severityRisk = DISRUPTION_SEVERITY_RISK[severity] ?? 4;
  const delayMinutes = Math.max(0, Number(disruption.delayMinutes) || 0);
  return severityRisk + Math.min(delayMinutes * 0.25, 5);
}

export function getRoutingWeights(currentTime = new Date()) {
  const period = isAfterDark(currentTime) ? 'night' : 'day';
  return { ...ROUTING_WEIGHTS[period] };
}

export function scoreTransitFactors(transit = {}, currentTime = new Date()) {
  const legs = transit.legs ?? transit.transitLegs ?? [];
  const waitLegs = legs.filter(
    (leg) => String(leg.type ?? leg.mode).toLowerCase() === 'wait'
  );
  const waitLegMinutes = waitLegs
    .reduce((total, leg) => total + (Number(leg.durationMinutes) || 0), 0);
  const busLegCount = legs.filter((leg) => {
    const type = String(leg.type ?? leg.mode).toLowerCase();
    return type === 'transit' || type === 'bus' || type === 'rail';
  }).length;
  const explicitWait = Number(transit.waitMinutes);
  const waitMinutes = Math.max(0, Number.isFinite(explicitWait) ? explicitWait : waitLegMinutes);
  const explicitTransfers = Number(transit.transferCount ?? transit.transfers);
  const transferCount = Math.max(
    0,
    Number.isFinite(explicitTransfers) ? explicitTransfers : Math.max(0, busLegCount - 1)
  );
  const period = isAfterDark(currentTime) ? 'night' : 'day';
  const factorWeights = TRANSIT_RISK_WEIGHTS[period];
  const weightedWaitMinutes = waitLegs.reduce((total, leg) => {
    const minutes = Math.max(0, Number(leg.durationMinutes) || 0);
    let exposureMultiplier = 1;
    if (leg.wellLit === true) exposureMultiplier -= 0.15;
    if (leg.wellLit === false) exposureMultiplier += 0.15;
    if (leg.sheltered === true) exposureMultiplier -= 0.1;
    if (leg.sheltered === false) exposureMultiplier += 0.05;
    return total + minutes * clamp(exposureMultiplier, 0.65, 1.35);
  }, 0);
  const waitExposureMultiplier = waitLegMinutes > 0
    ? weightedWaitMinutes / waitLegMinutes
    : 1;
  const waitRisk = waitMinutes * factorWeights.waitMinute * waitExposureMultiplier;
  const transferRisk = transferCount * factorWeights.transfer;
  const disruptionRisk = disruptionPenalty(
    transit.serviceDisruption ?? transit.disruption ?? transit.disruptions
  );

  return {
    waitMinutes: roundTo(waitMinutes, 1),
    transferCount,
    waitExposureMultiplier: roundTo(waitExposureMultiplier, 2),
    waitRisk: roundTo(waitRisk, 2),
    transferRisk: roundTo(transferRisk, 2),
    disruptionRisk: roundTo(disruptionRisk, 2),
    total: roundTo(waitRisk + transferRisk + disruptionRisk, 2)
  };
}

export function conditionScoreFromRisk(score) {
  const numericScore = Number(score);
  const safeScore = Number.isFinite(numericScore) ? numericScore : 100;
  return roundTo(100 - clamp(safeScore, 0, 100), 1);
}

export function calculateRouteUtility({
  riskScore,
  durationMinutes,
  fastestDurationMinutes,
  currentTime = new Date()
}) {
  const duration = Math.max(1, Number(durationMinutes) || 1);
  const fastest = Math.max(1, Number(fastestDurationMinutes) || duration);
  const conditionScore = conditionScoreFromRisk(riskScore);
  const normalizedSafety = conditionScore / 100;
  // A ratio keeps a very long detour from looking reasonable merely because it
  // is the second-best time in a small candidate set.
  const normalizedTravelTime = clamp(fastest / duration, 0, 1);
  const weights = getRoutingWeights(currentTime);
  const utilityScore = 100 * (
    weights.safety * normalizedSafety +
    weights.travelTime * normalizedTravelTime
  );

  return {
    utilityScore: roundTo(utilityScore, 1),
    conditionScore,
    normalizedSafety: roundTo(normalizedSafety, 4),
    normalizedTravelTime: roundTo(normalizedTravelTime, 4),
    timeDeltaMinutes: roundTo(Math.max(0, duration - fastest), 1),
    weights
  };
}

export function rankRoutesByUtility(routes, options = {}) {
  if (!Array.isArray(routes) || routes.length === 0) return [];
  const { currentTime = new Date() } = options;
  const durations = routes
    .map((route) => Number(route.durationMinutes))
    .filter((duration) => Number.isFinite(duration) && duration > 0);
  const fastestDurationMinutes = durations.length > 0 ? Math.min(...durations) : 1;

  return routes
    .map((route, originalIndex) => ({
      ...route,
      ...calculateRouteUtility({
        riskScore: route.riskScore,
        durationMinutes: route.durationMinutes,
        fastestDurationMinutes,
        currentTime
      }),
      originalIndex
    }))
    .sort(
      (a, b) =>
        b.utilityScore - a.utilityScore ||
        b.conditionScore - a.conditionScore ||
        a.durationMinutes - b.durationMinutes ||
        a.originalIndex - b.originalIndex
    )
    .map(({ originalIndex, ...route }, index) => ({
      ...route,
      recommended: index === 0,
      rank: index + 1
    }));
}

export function scoreRoute(routePoints, incidentZones = [], options = {}) {
  const {
    currentTime = new Date(),
    safePlaces = [],
    mode = 'walking',
    walkingPaths = []
  } = options;
  const normalizedMode = String(mode).toLowerCase() === 'transit' ? 'transit' : 'walking';
  const usableWalkingPaths = (Array.isArray(walkingPaths) ? walkingPaths : []).filter(
    (path) => Array.isArray(path) && path.length > 0
  );
  const assessmentPaths = normalizedMode === 'transit' && usableWalkingPaths.length > 0
    ? usableWalkingPaths
    : [routePoints];
  let raw = 0;
  const crossed = [];
  const near = [];
  const reasons = [];

  for (const zone of incidentZones) {
    const distance = distanceToPathsMeters([zone.lat, zone.lng], assessmentPaths);
    const recencyWeight = getRecencyWeight(zone.recencyDays);
    const distanceWeight = Math.exp(-distance / DISTANCE_DECAY_METERS);
    raw += zone.severity * recencyWeight * distanceWeight;
    if (distance <= zone.radiusMeters) {
      crossed.push(zone);
    } else if (distance <= zone.radiusMeters + PROXIMITY_BAND_METERS) {
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
    if (distanceToPathsMeters([place.lat, place.lng], assessmentPaths) <= place.radiusMeters) {
      safeBonus += 3;
    }
  }
  score = Math.max(0, score - safeBonus);

  const walkingRisk = score;
  const transitRisk = normalizedMode === 'transit'
    ? scoreTransitFactors(options, currentTime)
    : {
        waitMinutes: 0,
        transferCount: 0,
        waitExposureMultiplier: 1,
        waitRisk: 0,
        transferRisk: 0,
        disruptionRisk: 0,
        total: 0
      };
  score += transitRisk.total;

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
  if (normalizedMode === 'transit') {
    reasons.push(`${transitRisk.waitMinutes} minutes of stop waiting included in the safety score`);
    if (transitRisk.transferCount > 0) {
      reasons.push(
        `${transitRisk.transferCount} transfer${transitRisk.transferCount > 1 ? 's' : ''} add waiting exposure`
      );
    } else {
      reasons.push('Direct ride avoids an additional transfer wait');
    }
    if (transitRisk.disruptionRisk > 0) {
      reasons.push('An active service disruption adds uncertainty to this trip');
    }
  }

  const rounded = Math.min(Math.round(score), 100);
  return {
    score: rounded,
    level: riskLevel(rounded),
    mode: normalizedMode,
    reasons,
    crossedZones: crossed,
    nearbyZones: near,
    transitRisk,
    breakdown: {
      walkingRisk: roundTo(walkingRisk, 2),
      incidentRisk: roundTo(raw * SCORE_SCALE, 2),
      afterDarkRisk: darkPenalty,
      safePlaceCredit: safeBonus,
      transitRisk: transitRisk.total
    }
  };
}

export function explainScore(result, label) {
  const level = result.level.toLowerCase();
  const crossed = result.crossedZones.length;
  const near = result.nearbyZones.length;
  const transitContext = result.mode === 'transit'
    ? ` Waiting, transfers, and service status add ${result.transitRisk.total} risk points.`
    : '';
  if (crossed === 0 && near === 0) {
    return `The ${label} route has ${level} risk because it avoids every mapped incident zone on the way.${transitContext}`;
  }
  const parts = [];
  if (crossed > 0) parts.push(`${crossed} zone${crossed > 1 ? 's' : ''} it passes through`);
  if (near > 0) parts.push(`${near} zone${near > 1 ? 's' : ''} it passes near`);
  return `The ${label} route has ${level} risk because of ${parts.join(' and ')}, weighted by how recent and how severe those reports are.${transitContext}`;
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
