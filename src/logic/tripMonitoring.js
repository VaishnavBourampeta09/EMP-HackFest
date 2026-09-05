import { distanceFromRoute, remainingMinutes } from './routeDeviation.js';
import { findNearbyIncidentZone, ZONE_LABELS } from './riskScoring.js';

export const DEFAULT_SETTINGS = {
  offRouteMeters: 300,
  longStopMinutes: 5,
  checkRiskZones: true,
  etaDelayMinutes: 10,
  checkinTimeoutSeconds: 30
};

export function evaluateTrip(context) {
  const {
    location,
    routePoints,
    durationMinutes,
    minutesStopped,
    incidentZones,
    settings = DEFAULT_SETTINGS,
    handledKeys = []
  } = context;

  const triggers = [];
  const handled = new Set(handledKeys);

  const offBy = distanceFromRoute(location, routePoints);
  if (offBy > settings.offRouteMeters && !handled.has('route_deviation')) {
    triggers.push({
      key: 'route_deviation',
      type: 'route_deviation',
      severity: 'medium',
      question: 'You left the planned route. Are you okay?',
      message: `Teen is ${Math.round(offBy)}m away from the planned route.`
    });
  }

  if (minutesStopped >= settings.longStopMinutes && !handled.has('long_stop')) {
    triggers.push({
      key: 'long_stop',
      type: 'long_stop',
      severity: 'medium',
      question: `You have been stopped for ${Math.round(minutesStopped)} minutes. Everything okay?`,
      message: `Teen has been stopped for more than ${settings.longStopMinutes} minutes.`
    });
  }

  if (settings.checkRiskZones) {
    const zone = findNearbyIncidentZone(location, incidentZones);
    if (zone && !handled.has(`risk_zone:${zone.id}`)) {
      triggers.push({
        key: `risk_zone:${zone.id}`,
        type: 'risk_zone',
        severity: 'low',
        question: `This area has recent ${ZONE_LABELS[zone.type]} reports. Continue or reroute?`,
        message: `Teen entered ${zone.name}.`,
        zone
      });
    }
  }

  const eta = remainingMinutes(location, routePoints, durationMinutes);
  const expected = context.expectedRemainingMinutes;
  if (
    typeof expected === 'number' &&
    eta - expected >= settings.etaDelayMinutes &&
    !handled.has('late_arrival')
  ) {
    triggers.push({
      key: 'late_arrival',
      type: 'late_arrival',
      severity: 'medium',
      question: 'Your ETA changed a lot. Still okay?',
      message: `ETA slipped by ${Math.round(eta - expected)} minutes.`
    });
  }

  return triggers;
}

export function escalationMessage(checkin) {
  switch (checkin.type) {
    case 'route_deviation':
      return 'Teen left the planned route and did not answer the safety check.';
    case 'long_stop':
      return 'Teen stopped for several minutes and did not answer the safety check.';
    case 'risk_zone':
      return 'Teen entered a recent incident zone and did not answer the safety check.';
    case 'late_arrival':
      return 'Teen is running far behind ETA and did not answer the safety check.';
    default:
      return 'Teen did not answer the safety check.';
  }
}
