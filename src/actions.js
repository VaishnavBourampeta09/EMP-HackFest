import { getState, setState, createId } from './store.js';
import incidentZones from './data/incident_zones.json';
import safePlaces from './data/safe_places.json';
import demoRoutes from './data/demo_routes.json';
import { interpolatePath } from './logic/geo.js';
import { scoreRoute, explainScore } from './logic/riskScoring.js';
import { evaluateTrip, escalationMessage } from './logic/tripMonitoring.js';
import { remainingMinutes, distanceFromRoute } from './logic/routeDeviation.js';
import { nearestIndex } from './logic/geo.js';

export const zones = incidentZones;
export const places = safePlaces;

export function planRoutes(destination = demoRoutes.destination, origin = demoRoutes.origin) {
  return demoRoutes.routes
    .map((route) => {
      const points = interpolatePath(route.waypoints, 50);
      const risk = scoreRoute(points, incidentZones, { safePlaces });
      return {
        ...route,
        origin,
        destination,
        points,
        riskScore: risk.score,
        riskLevel: risk.level,
        reasons: risk.reasons,
        crossedZones: risk.crossedZones.map((z) => z.id),
        nearbyZones: risk.nearbyZones.map((z) => z.id),
        explanation: explainScore(risk, route.label.toLowerCase())
      };
    })
    .sort((a, b) => a.riskScore - b.riskScore || a.durationMinutes - b.durationMinutes);
}

export function startTrip(route) {
  const { users } = getState();
  const now = Date.now();
  setState({
    trip: {
      id: createId('trip'),
      teenUserId: users.teen.id,
      parentUserId: users.parent.id,
      origin: route.origin,
      destination: route.destination,
      route,
      status: 'active',
      startedAt: now,
      lastSeenAt: now,
      endedAt: null,
      location: route.points[0],
      etaMinutes: route.durationMinutes,
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
    trip: { ...trip, status, endedAt: Date.now() },
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
    trip: trip ? { ...trip, status: 'alert' } : trip
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
    trip: trip && trip.status === 'alert' ? { ...trip, status: 'active' } : trip
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
    trip: { ...trip, handledKeys: [...trip.handledKeys, trigger.key] }
  });
}

export function respondCheckin(response) {
  const { checkin, trip } = getState();
  if (!checkin || checkin.status !== 'waiting') return;
  if (response === 'im_ok') {
    setState({ checkin: { ...checkin, status: 'teen_ok' } });
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
  const { checkin } = getState();
  if (!checkin || checkin.status !== 'waiting') return;
  setState({ checkin: { ...checkin, status: 'expired' } });
  raiseAlert({
    type: 'missed_checkin',
    severity: 'high',
    message: escalationMessage(checkin),
    checkinType: checkin.type
  });
}

export function sendSos() {
  raiseAlert({
    type: 'sos',
    severity: 'high',
    message: 'Teen pressed the help button.'
  });
}

export function pushLocation(location, extra = {}) {
  const { trip, locationUpdates, settings, checkin, simulation } = getState();
  if (!trip || trip.status === 'completed' || trip.status === 'cancelled') return;
  const now = Date.now();
  const eta = remainingMinutes(location, trip.route.points, trip.route.durationMinutes);
  const update = {
    id: createId('loc'),
    lat: location[0],
    lng: location[1],
    speed: extra.speed ?? 0,
    accuracy: extra.accuracy ?? 12,
    createdAt: now
  };
  setState({
    trip: {
      ...trip,
      location,
      lastSeenAt: now,
      etaMinutes: eta,
      offRouteMeters: Math.round(distanceFromRoute(location, trip.route.points))
    },
    locationUpdates: [update, ...locationUpdates].slice(0, 200)
  });

  if (checkin && checkin.status === 'waiting') return;

  const triggers = evaluateTrip({
    location,
    routePoints: trip.route.points,
    durationMinutes: trip.route.durationMinutes,
    minutesStopped: simulation.minutesStopped,
    incidentZones,
    settings,
    handledKeys: trip.handledKeys,
    expectedRemainingMinutes: extra.expectedRemainingMinutes
  });

  if (triggers.length > 0) openCheckin(triggers[0]);
}
