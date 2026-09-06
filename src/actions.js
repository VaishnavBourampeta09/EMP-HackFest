import { getState, setState, createId } from './store.js';
import incidentZones from './data/incident_zones.json';
import safePlaces from './data/safe_places.json';
import demoRoutes from './data/demo_routes.json';
import demoTransitRoutes from './data/demo_transit_routes.json';
import { interpolatePath } from './logic/geo.js';
import {
  scoreRoute,
  explainScore,
  rankRoutesByUtility
} from './logic/riskScoring.js';
import { evaluateTrip, escalationMessage } from './logic/tripMonitoring.js';
import { remainingMinutes, distanceFromRoute } from './logic/routeDeviation.js';
import { nearestIndex } from './logic/geo.js';

export const zones = incidentZones;
export const places = safePlaces;

function isPlanOptions(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ('mode' in value || 'currentTime' in value)
  );
}

function normalizePlanArguments(destinationArg, originArg, optionsArg) {
  let destination = destinationArg;
  let origin = originArg;
  let options = optionsArg;

  if (isPlanOptions(destinationArg)) {
    options = destinationArg;
    destination = undefined;
    origin = undefined;
  } else if (isPlanOptions(originArg)) {
    options = originArg;
    origin = undefined;
  }

  options = options && typeof options === 'object' ? options : {};
  const requestedMode = String(options.mode ?? 'walking').toLowerCase();
  const mode = requestedMode === 'transit' ? 'transit' : 'walking';
  const source = mode === 'transit' ? demoTransitRoutes : demoRoutes;

  return {
    destination: destination ?? source.destination,
    origin: origin ?? source.origin,
    mode,
    currentTime: options.currentTime ?? new Date(),
    source
  };
}

function routeLegs(route, origin, destination) {
  const legs = Array.isArray(route.legs) && route.legs.length > 0
    ? route.legs
    : [
        {
          legId: `${route.routeId}_walking_leg`,
          type: 'walking',
          mode: 'WALK',
          from: origin.name,
          to: destination.name,
          durationMinutes: route.durationMinutes,
          distanceKm: route.distanceKm,
          waypoints: route.waypoints
        }
      ];

  return legs.map((leg) => ({
    ...leg,
    points: Array.isArray(leg.waypoints) && leg.waypoints.length > 0
      ? interpolatePath(leg.waypoints, 50)
      : []
  }));
}

function isWalkingLeg(leg) {
  const type = String(leg.type ?? leg.mode).toLowerCase();
  return type === 'walking' || type === 'walk';
}

function isTransitLeg(leg) {
  const type = String(leg.type ?? leg.mode).toLowerCase();
  return type === 'transit' || type === 'bus' || type === 'rail';
}

export function planRoutes(
  destination = demoRoutes.destination,
  origin = demoRoutes.origin,
  options = {}
) {
  const plan = normalizePlanArguments(destination, origin, options);
  const scoredRoutes = plan.source.routes
    .map((route) => {
      const points = interpolatePath(route.waypoints, 50);
      const legs = routeLegs(route, plan.origin, plan.destination);
      const walkingLegs = legs.filter(isWalkingLeg);
      const transitLegs = legs.filter(isTransitLeg);
      const risk = scoreRoute(points, incidentZones, {
        currentTime: plan.currentTime,
        safePlaces,
        mode: plan.mode,
        walkingPaths: walkingLegs.map((leg) => leg.points),
        legs,
        transitLegs,
        waitMinutes: route.waitMinutes,
        transferCount: route.transferCount,
        serviceDisruption: route.serviceDisruption
      });
      return {
        ...route,
        mode: plan.mode,
        origin: plan.origin,
        destination: plan.destination,
        points,
        legs,
        walkingLegs,
        transitLegs,
        riskScore: risk.score,
        riskLevel: risk.level,
        reasons: risk.reasons,
        crossedZones: risk.crossedZones.map((z) => z.id),
        nearbyZones: risk.nearbyZones.map((z) => z.id),
        riskBreakdown: risk.breakdown,
        transitRisk: risk.transitRisk,
        explanation: explainScore(risk, route.label.toLowerCase())
      };
    });

  return rankRoutesByUtility(scoredRoutes, { currentTime: plan.currentTime });
}

export function startTrip(route) {
  const { users } = getState();
  const now = Date.now();
  const mode = route.mode === 'transit' ? 'transit' : 'walking';
  const legs = Array.isArray(route.legs) ? route.legs : [];
  const transitLegs = Array.isArray(route.transitLegs)
    ? route.transitLegs
    : legs.filter(isTransitLeg);
  const preservedRoute = { ...route, mode, legs, transitLegs };
  setState({
    trip: {
      id: createId('trip'),
      teenUserId: users.teen.id,
      parentUserId: users.parent.id,
      origin: route.origin,
      destination: route.destination,
      mode,
      legs,
      transitLegs,
      route: preservedRoute,
      status: 'active',
      monitoringState: 'NORMAL',
      startedAt: now,
      lastSeenAt: now,
      endedAt: null,
      location: route.points[0],
      etaMinutes: route.durationMinutes,
      expectedEta: now + route.durationMinutes * 60000,
      plannedRouteGeojson: {
        type: 'LineString',
        coordinates: route.points.map(([lat, lng]) => [lng, lat])
      },
      offRouteSeconds: 0,
      stationarySeconds: 0,
      handledKeys: []
    },
    checkin: null,
    alerts: [],
    locationUpdates: [
      { id: createId('loc'), lat: route.points[0][0], lng: route.points[0][1], speed: 0, accuracy: 12, createdAt: now }
    ],
    simulation: { running: true, index: 0, offRoute: false, stopped: false, minutesStopped: 0, lastTickAt: 0 }
  });
}

export function endTrip(status = 'completed') {
  const { trip } = getState();
  if (!trip) return;
  setState({
    trip: { ...trip, status, monitoringState: 'RESOLVED', endedAt: Date.now() },
    checkin: null,
    simulation: { ...getState().simulation, running: false }
  });
}

export function raiseAlert(alert) {
  const { alerts, trip } = getState();
  const entry = {
    id: createId('alert'),
    tripId: trip ? trip.id : null,
    status: 'pending',
    createdAt: Date.now(),
    ...alert
  };
  setState({
    alerts: [entry, ...alerts],
    trip: trip ? { ...trip, status: 'alert', monitoringState: 'GUARDIAN_ALERTED' } : trip
  });
  return entry;
}

export function acknowledgeAlert(alertId) {
  const { alerts } = getState();
  setState({
    alerts: alerts.map((a) => (a.id === alertId ? { ...a, status: 'acknowledged' } : a))
  });
}

export function resolveAlerts() {
  const { alerts, trip } = getState();
  setState({
    alerts: alerts.map((a) => (a.status === 'pending' ? { ...a, status: 'resolved' } : a)),
    trip: trip
      ? {
          ...trip,
          status: trip.status === 'alert' ? 'active' : trip.status,
          monitoringState: 'RESOLVED',
          offRouteSeconds: 0,
          stationarySeconds: 0
        }
      : trip
  });
}

export function openCheckin(trigger) {
  const { trip, settings } = getState();
  if (!trip) return;
  const now = Date.now();
  setState({
    checkin: {
      id: createId('checkin'),
      tripId: trip.id,
      key: trigger.key,
      type: trigger.type,
      reason: trigger.message,
      question: trigger.question,
      status: 'waiting',
      createdAt: now,
      expiresAt: now + settings.checkinTimeoutSeconds * 1000
    },
    trip: {
      ...trip,
      monitoringState: 'TEEN_CHECK_IN',
      handledKeys: [...(trip.handledKeys || []), trigger.key]
    }
  });
}

export function respondCheckin(response) {
  const { checkin, trip } = getState();
  if (!checkin || checkin.status !== 'waiting') return;
  if (response === 'im_ok') {
    setState({
      checkin: { ...checkin, status: 'teen_ok' },
      trip: trip ? { ...trip, monitoringState: 'RESOLVED' } : trip
    });
    resolveAlerts();
  } else if (response === 'need_help') {
    setState({ checkin: { ...checkin, status: 'teen_needs_help' } });
    raiseAlert({
      type: 'sos',
      severity: 'high',
      message: 'Teen asked for help during a safety check.'
    });
  } else if (response === 'reroute') {
    setState({
      checkin: { ...checkin, status: 'teen_ok' },
      trip: trip
        ? {
            ...trip,
            monitoringState: 'RESOLVED',
            offRouteSeconds: 0,
            stationarySeconds: 0
          }
        : trip,
      simulation: { ...getState().simulation, offRoute: false, stopped: false, minutesStopped: 0 }
    });
    if (trip) {
      setState({
        simulation: {
          ...getState().simulation,
          index: nearestIndex(trip.location, trip.route.points)
        }
      });
    }
    resolveAlerts();
  }
}

export function expireCheckin() {
  const { checkin, trip } = getState();
  if (!checkin || checkin.status !== 'waiting') return;
  setState({
    checkin: { ...checkin, status: 'expired' },
    trip: trip ? { ...trip, monitoringState: 'NO_RESPONSE' } : trip
  });
  raiseAlert({
    type: 'missed_checkin',
    severity: 'high',
    message: escalationMessage(checkin),
    checkinType: checkin.type
  });
}

export function sendSos(reason = 'Teen pressed the help button.') {
  const { trip, sos } = getState();
  if (sos && sos.status === 'active') return sos;

  const alert = raiseAlert({
    type: 'sos',
    severity: 'high',
    message: typeof reason === 'string' ? reason : 'Teen pressed the help button.'
  });

  const record = {
    id: alert.id,
    status: 'active',
    reason: alert.message,
    raisedAt: alert.createdAt,
    clearedAt: null,
    location: trip ? trip.location : null,
    etaMinutes: trip ? trip.etaMinutes : null,
    destination: trip?.destination?.name ?? null
  };
  setState({ sos: record });
  return record;
}

/** Stand down a help request the teen raised (false alarm, or resolved). */
export function clearSos(note = 'Teen marked themselves safe.') {
  const { sos, alerts, trip } = getState();
  if (!sos || sos.status !== 'active') return;

  setState({
    sos: { ...sos, status: 'cleared', clearedAt: Date.now(), note },
    alerts: alerts.map((entry) =>
      entry.id === sos.id
        ? { ...entry, status: 'resolved', resolutionNote: note }
        : entry
    ),
    trip: trip
      ? {
          ...trip,
          status: trip.status === 'alert' ? 'active' : trip.status,
          monitoringState: 'RESOLVED'
        }
      : trip
  });
}

export function pushLocation(location, extra = {}) {
  const { trip, locationUpdates, settings, checkin, simulation } = getState();
  if (!trip || trip.status === 'completed' || trip.status === 'cancelled') return;
  const now = Date.now();
  const eta = remainingMinutes(location, trip.route.points, trip.route.durationMinutes);
  const offRouteMeters = Math.round(distanceFromRoute(location, trip.route.points));
  const measuredElapsedSeconds = trip.lastSeenAt
    ? Math.max(0, (now - trip.lastSeenAt) / 1000)
    : 0;
  const elapsedSeconds = Math.min(
    120,
    Math.max(0, Number(extra.elapsedSeconds ?? measuredElapsedSeconds) || 0)
  );
  const speed = extra.speed ?? 0;
  const offRouteSeconds = offRouteMeters > settings.offRouteMeters
    ? (trip.offRouteSeconds ?? 0) + elapsedSeconds
    : 0;
  const stationarySeconds = speed <= 0.3 && extra.expectedStop !== true
    ? (trip.stationarySeconds ?? 0) + elapsedSeconds
    : 0;
  const monitoringState = checkin?.status === 'waiting'
    ? 'TEEN_CHECK_IN'
    : offRouteSeconds > 0 || stationarySeconds > 0
      ? 'POSSIBLE_ANOMALY'
      : 'NORMAL';
  const update = {
    id: createId('loc'),
    lat: location[0],
    lng: location[1],
    speed,
    accuracy: extra.accuracy ?? 12,
    createdAt: now
  };
  setState({
    trip: {
      ...trip,
      location,
      lastSeenAt: now,
      etaMinutes: eta,
      offRouteMeters,
      offRouteSeconds,
      stationarySeconds,
      monitoringState
    },
    locationUpdates: [update, ...locationUpdates].slice(0, 200)
  });

  if (checkin && checkin.status === 'waiting') return;

  const triggers = evaluateTrip({
    location,
    routePoints: trip.route.points,
    durationMinutes: trip.route.durationMinutes,
    minutesStopped: simulation.minutesStopped,
    offRouteSeconds,
    stationarySeconds,
    incidentZones: trip.route.contextFactors || incidentZones,
    settings,
    handledKeys: trip.handledKeys,
    expectedRemainingMinutes: extra.expectedRemainingMinutes
  });

  if (triggers.length > 0) openCheckin(triggers[0]);
}
