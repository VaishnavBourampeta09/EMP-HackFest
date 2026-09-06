const ZONE_COLORS = {
  property_crime: '#f59e0b',
  violent_crime: '#ef4444',
  collision: '#8b5cf6',
  low_light: '#3b82f6',
  user_reported: '#14b8a6'
};

const ROUTE_COLORS = { Fastest: '#ef4444', Balanced: '#f59e0b', Safer: '#22c55e' };

const ALERT_TITLES = {
  route_deviation: 'Off planned route',
  long_stop: 'Stopped too long',
  risk_zone: 'Entered incident zone',
  late_arrival: 'ETA slipped',
  missed_checkin: 'Missed check-in',
  sos: 'Help requested'
};

const SETTING_LABELS = {
  offRouteMeters: 'Alert if off route by 300m',
  longStopMinutes: 'Check in after 5 minutes stopped',
  checkRiskZones: 'Check in near a recent incident zone',
  etaDelayMinutes: 'Alert if ETA slips by 10+ minutes'
};

const planned = DEMO_ROUTES.routes
  .map((route) => {
    const points = interpolatePath(route.waypoints, 50);
    const risk = scoreRoute(points, INCIDENT_ZONES, { safePlaces: SAFE_PLACES });
    return {
      ...route,
      points,
      origin: DEMO_ROUTES.origin,
      destination: DEMO_ROUTES.destination,
      riskScore: risk.score,
      riskLevel: risk.level,
      reasons: risk.reasons,
      explanation: explainScore(risk, route.label.toLowerCase())
    };
  })
  .sort((a, b) => a.riskScore - b.riskScore || a.durationMinutes - b.durationMinutes);


const state = {
  mode: 'teen',
  screen: 'destination',
  selectedRouteId: null,
  trip: null,
  checkin: null,
  alerts: [],
  trail: [],
  settings: { ...DEFAULT_SETTINGS },
  sim: { running: false, index: 0, offRoute: false, stopped: false, minutesStopped: 0 },
  detourPoints: []
};

const createId = (prefix) => prefix + '_' + Math.random().toString(36).slice(2, 8);
const root = document.getElementById('root');
const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const allPoints = planned.flatMap((r) => r.points).concat(INCIDENT_ZONES.map((z) => [z.lat, z.lng]));
const bounds = allPoints.reduce(
  (acc, p) => ({
    minLat: Math.min(acc.minLat, p[0]),
    maxLat: Math.max(acc.maxLat, p[0]),
    minLng: Math.min(acc.minLng, p[1]),
    maxLng: Math.max(acc.maxLng, p[1])
  }),
  { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 }
);

const PAD = 0.004;
const view = {
  minLat: bounds.minLat - PAD,
  maxLat: bounds.maxLat + PAD,
  minLng: bounds.minLng - PAD * 1.4,
  maxLng: bounds.maxLng + PAD * 1.4
};

const WIDTH = 320;
const HEIGHT = 300;
const projectX = (lng) => ((lng - view.minLng) / (view.maxLng - view.minLng)) * WIDTH;
const projectY = (lat) => HEIGHT - ((lat - view.minLat) / (view.maxLat - view.minLat)) * HEIGHT;
const metersToPx = (meters) => (meters / haversineMeters([view.minLat, view.minLng], [view.minLat, view.maxLng])) * WIDTH;
const toPolyline = (points) => points.map((p) => projectX(p[1]).toFixed(1) + ',' + projectY(p[0]).toFixed(1)).join(' ');

function mapMarkup(options) {
  const routes = options.routes || [];
  const activeId = options.activeRouteId;
  const zoneShapes = INCIDENT_ZONES.map(
    (zone) =>
      `<circle cx="${projectX(zone.lng).toFixed(1)}" cy="${projectY(zone.lat).toFixed(1)}" r="${metersToPx(zone.radiusMeters).toFixed(1)}" fill="${ZONE_COLORS[zone.type]}" fill-opacity="0.16" stroke="${ZONE_COLORS[zone.type]}" stroke-width="0.6"><title>${escapeHtml(zone.name)} - severity ${zone.severity}, ${zone.recencyDays} days ago</title></circle>`
  ).join('');

  const placeShapes = SAFE_PLACES.map(
    (place) =>
      `<circle cx="${projectX(place.lng).toFixed(1)}" cy="${projectY(place.lat).toFixed(1)}" r="3.2" fill="#0ea5e9" stroke="#fff" stroke-width="1.2"><title>${escapeHtml(place.name)}</title></circle>` +
      `<text x="${(projectX(place.lng) + 5).toFixed(1)}" y="${(projectY(place.lat) + 2.5).toFixed(1)}">${escapeHtml(place.name)}</text>`
  ).join('');

  const routeShapes = routes
    .map((route) => {
      const isActive = !activeId || route.routeId === activeId;
      return `<polyline class="route-line" points="${toPolyline(route.points)}" stroke="${ROUTE_COLORS[route.label] || '#2563eb'}" stroke-width="${isActive ? 3.4 : 1.8}" opacity="${isActive ? 0.95 : 0.35}" />`;
    })
    .join('');

  const trail =
    options.trail && options.trail.length > 1
      ? `<polyline class="trail-line" points="${toPolyline(options.trail)}" />`
      : '';

  const teen = options.teenLocation
    ? `<circle class="teen-dot" cx="${projectX(options.teenLocation[1]).toFixed(1)}" cy="${projectY(options.teenLocation[0]).toFixed(1)}" r="5" />`
    : '';

  return `
    <div class="map-shell">
      <svg class="svg-map" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Redmond safety map">
        ${zoneShapes}${routeShapes}${trail}${placeShapes}${teen}
      </svg>
    </div>
    <div class="map-legend">
      <span><i class="swatch" style="background:#f59e0b"></i>property crime</span>
      <span><i class="swatch" style="background:#ef4444"></i>violent crime</span>
      <span><i class="swatch" style="background:#8b5cf6"></i>collision</span>
      <span><i class="swatch" style="background:#3b82f6"></i>low light</span>
      <span><i class="swatch" style="background:#14b8a6"></i>community</span>
    </div>`;
}

function destinationScreen() {
  const picks = SAFE_PLACES.filter((place) => place.name !== 'Redmond Library');
  return `
    <div class="screen">
      <h1>Where are you going?</h1>
      <p class="muted">Sentinel plans the trip, watches it, and only wakes your parent if something changes.</p>
      <input class="input" value="Home" readonly />
      <div class="quick-picks">
        ${picks.map((place) => `<button type="button" class="chip" data-action="pick">${escapeHtml(place.name)}</button>`).join('')}
      </div>
      ${mapMarkup({ routes: [] })}
      <p class="footnote">Demo incident zones seeded from Redmond public crime and traffic safety data.</p>
    </div>`;
}

function routesScreen() {
  const selected = planned.find((route) => route.routeId === state.selectedRouteId);
  return `
    <div class="screen">
      <button type="button" class="link-back" data-action="back">Change destination</button>
      <h1>Choose your route</h1>
      <p class="muted">${escapeHtml(DEMO_ROUTES.origin.name)} to ${escapeHtml(DEMO_ROUTES.destination.name)}</p>
      ${mapMarkup({ routes: planned, activeRouteId: state.selectedRouteId })}
      <div class="route-list">
        ${planned
          .map(
            (route) => `
          <button type="button" class="route-card ${route.routeId === state.selectedRouteId ? 'selected' : ''}" data-action="select" data-route="${route.routeId}">
            <div class="route-card-head">
              <div>
                <span class="route-label">${escapeHtml(route.label)}</span>
                <span class="route-summary">${escapeHtml(route.summary)}</span>
              </div>
              <span class="pill pill-${route.riskLevel.toLowerCase()}">${route.riskLevel} risk</span>
            </div>
            <div class="route-metrics"><span>${route.durationMinutes} min</span><span>${route.distanceKm} km</span><span>score ${route.riskScore}/100</span></div>
            <ul class="reasons">${route.reasons.slice(0, 3).map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
            <p class="explanation">${escapeHtml(route.explanation)}</p>
          </button>`
          )
          .join('')}
      </div>
      <button type="button" class="btn btn-primary btn-block" data-action="start" ${selected ? '' : 'disabled'}>
        ${selected ? 'Start trip on the ' + escapeHtml(selected.label) + ' route' : 'Pick a route to start'}
      </button>
    </div>`;
}

function activeTripScreen() {
  const trip = state.trip;
  const arrival = new Date(Date.now() + trip.etaMinutes * 60000);
  return `
    <div class="screen">
      <div class="status-banner">
        <div>
          <span class="kicker">Trip active</span>
          <h2>${escapeHtml(trip.destination.name)}</h2>
          <p>ETA ${arrival.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} &middot; ${escapeHtml(trip.route.label)} route &middot;
            <span class="pill pill-${trip.route.riskLevel.toLowerCase()}">${trip.route.riskLevel} risk</span></p>
        </div>
        <span class="live-dot">Parent notified</span>
      </div>
      ${mapMarkup({ routes: [trip.route], activeRouteId: trip.route.routeId, teenLocation: trip.location, trail: state.trail })}
      <div class="trip-stats">
        <div><span>Off route by</span><strong>${trip.offRouteMeters || 0} m</strong></div>
        <div><span>Stopped</span><strong>${Math.round(state.sim.minutesStopped)} min</strong></div>
        <div><span>Remaining</span><strong>${trip.etaMinutes} min</strong></div>
      </div>
      <div class="action-row">
        <button type="button" class="btn btn-primary" data-action="arrived">I arrived safely</button>
        <button type="button" class="btn btn-ghost" data-action="back-on-route">Back on route</button>
        <button type="button" class="btn btn-danger" data-action="sos">Need help</button>
      </div>
    </div>`;
}

function checkinMarkup() {
  const checkin = state.checkin;
  if (!checkin || checkin.status !== 'waiting') return '';
  const seconds = Math.max(0, Math.ceil((checkin.expiresAt - Date.now()) / 1000));
  return `
    <div class="sheet-backdrop">
      <div class="sheet">
        <span class="sheet-kicker">Safety check</span>
        <h2>${escapeHtml(checkin.question)}</h2>
        <p class="sheet-reason">${escapeHtml(checkin.reason)}</p>
        <p class="countdown">Your parent is alerted in <strong>${seconds}s</strong> if you do not respond.</p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-primary" data-action="respond" data-response="im_ok">I am okay</button>
          <button type="button" class="btn btn-ghost" data-action="respond" data-response="reroute">Reroute me</button>
          <a class="btn btn-ghost" href="tel:${DEMO_USERS.parent.phone.replace(/[^0-9+]/g, '')}">Call parent</a>
          <button type="button" class="btn btn-danger" data-action="respond" data-response="need_help">I need help</button>
        </div>
      </div>
    </div>`;
}

function parentScreen() {
  const trip = state.trip;
  const pending = state.alerts.filter((alert) => alert.status === 'pending');
  const lastSeen = trip ? Math.round((Date.now() - trip.lastSeenAt) / 1000) : null;
  return `
    <div class="screen">
      <h1>${escapeHtml(DEMO_USERS.teen.name)}</h1>
      ${
        trip
          ? `<div class="status-banner ${pending.length ? 'banner-alert' : ''}">
              <div>
                <span class="kicker">${trip.status === 'completed' ? 'Trip complete' : pending.length ? 'Needs attention' : 'On trip'}</span>
                <h2>${escapeHtml(trip.destination.name)}</h2>
                <p>ETA in ${trip.etaMinutes} min &middot; ${escapeHtml(trip.route.label)} route &middot;
                  <span class="pill pill-${trip.route.riskLevel.toLowerCase()}">${trip.route.riskLevel} risk</span></p>
                <p class="muted">Last update ${lastSeen === null ? 'never' : lastSeen + 's ago'}</p>
              </div>
            </div>
            ${mapMarkup({ routes: [trip.route], activeRouteId: trip.route.routeId, teenLocation: trip.location, trail: state.trail })}`
          : `<div class="empty-state"><p>No active trip. Location sharing is off until ${escapeHtml(DEMO_USERS.teen.name)} starts one.</p></div>`
      }
      <section>
        <h3>Alerts</h3>
        ${state.alerts.length === 0 ? '<p class="muted">No alerts. Sentinel only escalates when a check-in fails.</p>' : ''}
        ${state.alerts.map((alert) => alertMarkup(alert)).join('')}
      </section>
      <section>
        <h3>Monitoring rules</h3>
        <div class="settings-list">
          ${Object.keys(SETTING_LABELS)
            .map((key) => {
              const on = key === 'checkRiskZones' ? state.settings.checkRiskZones : state.settings[key] > 0;
              return `<label class="setting-row"><input type="checkbox" data-action="toggle" data-key="${key}" ${on ? 'checked' : ''} /><span>${SETTING_LABELS[key]}</span></label>`;
            })
            .join('')}
        </div>
      </section>
      <section class="privacy">
        <h3>Privacy by design</h3>
        <p>Location is shared only while a trip is active, stored as trip history, and deleted with the trip. No always-on tracking, no silent listening, no location sharing when the teen is not travelling.</p>
      </section>
    </div>`;
}

function alertMarkup(alert) {
  const trip = state.trip;
  const time = new Date(alert.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const nav = trip && trip.location ? 'https://www.google.com/maps/dir/?api=1&destination=' + trip.location[0] + ',' + trip.location[1] : '#';
  return `
    <div class="alert-card severity-${alert.severity}">
      <div class="alert-head"><span class="alert-title">${ALERT_TITLES[alert.type] || 'Safety alert'}</span><span class="alert-time">${time}</span></div>
      <p class="alert-message">${escapeHtml(alert.message)}</p>
      ${trip ? `<p class="alert-meta">Trip: ${escapeHtml(trip.origin.name)} to ${escapeHtml(trip.destination.name)} &middot; route ${escapeHtml(trip.route.label)}</p>` : ''}
      <div class="alert-actions">
        <a class="btn btn-ghost" href="tel:${DEMO_USERS.teen.phone.replace(/[^0-9+]/g, '')}">Call teen</a>
        <a class="btn btn-ghost" href="${nav}" target="_blank" rel="noreferrer">Navigate there</a>
        <a class="btn btn-danger" href="tel:911">Call 911</a>
      </div>
      ${alert.status === 'pending' ? `<button type="button" class="btn btn-quiet" data-action="ack" data-alert="${alert.id}">Acknowledge</button>` : `<span class="status-chip">${alert.status}</span>`}
    </div>`;
}

function demoBar() {
  const active = state.trip && state.trip.status !== 'completed';
  return `
    <footer class="demo-bar">
      <span class="demo-label">Demo controls</span>
      <div class="demo-buttons">
        <button type="button" data-action="stop" ${active ? '' : 'disabled'}>${state.sim.stopped ? 'Resume walking' : 'Stop here'}</button>
        <button type="button" data-action="detour" ${active ? '' : 'disabled'}>${state.sim.offRoute ? 'Return to route' : 'Take a detour'}</button>
        <button type="button" data-action="reset">Reset demo</button>
      </div>
    </footer>`;
}

function render() {
  const teenView = state.trip && state.trip.status !== 'completed' ? activeTripScreen() : state.screen === 'routes' ? routesScreen() : destinationScreen();
  root.innerHTML = `
    <div class="app">
      <header class="app-bar">
        <div class="brand">
          <span class="brand-mark">GR</span>
          <div><strong>Sentinel</strong><span class="tagline">From passive tracking to proactive protection</span></div>
        </div>
        <div class="mode-toggle">
          <button type="button" class="${state.mode === 'teen' ? 'active' : ''}" data-action="mode" data-mode="teen">Teen</button>
          <button type="button" class="${state.mode === 'parent' ? 'active' : ''}" data-action="mode" data-mode="parent">Parent${state.mode !== 'parent' && state.alerts.some((a) => a.status === 'pending') ? '<span class="dot"></span>' : ''}</button>
        </div>
      </header>
      <main>${state.mode === 'teen' ? teenView : parentScreen()}</main>
      ${demoBar()}
      ${state.mode === 'teen' ? checkinMarkup() : ''}
    </div>`;
}

function startTrip(route) {
  const now = Date.now();
  state.trip = {
    id: createId('trip'),
    teenUserId: DEMO_USERS.teen.id,
    parentUserId: DEMO_USERS.parent.id,
    origin: route.origin,
    destination: route.destination,
    route,
    status: 'active',
    startedAt: now,
    lastSeenAt: now,
    location: route.points[0],
    etaMinutes: route.durationMinutes,
    offRouteMeters: 0,
    handledKeys: []
  };
  state.trail = [route.points[0]];
  state.alerts = [];
  state.checkin = null;
  state.sim = { running: true, index: 0, offRoute: false, stopped: false, minutesStopped: 0 };
}

function raiseAlert(alert) {
  state.alerts.unshift({ id: createId('alert'), status: 'pending', createdAt: Date.now(), ...alert });
}

function respond(response) {
  const checkin = state.checkin;
  if (!checkin || checkin.status !== 'waiting') return;
  if (response === 'need_help') {
    checkin.status = 'teen_needs_help';
    raiseAlert({ type: 'sos', severity: 'high', message: 'Teen asked for help during a safety check.' });
    return;
  }
  checkin.status = 'teen_ok';
  state.alerts = state.alerts.map((alert) => (alert.status === 'pending' ? { ...alert, status: 'resolved' } : alert));
  if (response === 'reroute') {
    state.sim.offRoute = false;
    state.sim.stopped = false;
    state.sim.minutesStopped = 0;
    state.sim.index = nearestIndex(state.trip.location, state.trip.route.points);
  }
}

function pushLocation(location) {
  const trip = state.trip;
  trip.location = location;
  trip.lastSeenAt = Date.now();
  trip.etaMinutes = remainingMinutes(location, trip.route.points, trip.route.durationMinutes);
  trip.offRouteMeters = Math.round(distanceFromRoute(location, trip.route.points));
  state.trail = state.trail.concat([location]).slice(-400);

  if (state.checkin && state.checkin.status === 'waiting') return;

  const triggers = evaluateTrip({
    location,
    routePoints: trip.route.points,
    durationMinutes: trip.route.durationMinutes,
    minutesStopped: state.sim.minutesStopped,
    incidentZones: INCIDENT_ZONES,
    settings: state.settings,
    handledKeys: trip.handledKeys
  });

  if (triggers.length === 0) return;
  const trigger = triggers[0];
  trip.handledKeys.push(trigger.key);
  state.checkin = {
    id: createId('checkin'),
    key: trigger.key,
    type: trigger.type,
    reason: trigger.message,
    question: trigger.question,
    status: 'waiting',
    createdAt: Date.now(),
    expiresAt: Date.now() + state.settings.checkinTimeoutSeconds * 1000
  };
}

function tick() {
  const trip = state.trip;
  if (trip && trip.status !== 'completed') {
    if (state.checkin && state.checkin.status === 'waiting' && Date.now() >= state.checkin.expiresAt) {
      state.checkin.status = 'expired';
      raiseAlert({ type: 'missed_checkin', severity: 'high', message: escalationMessage(state.checkin) });
    } else if (state.sim.running) {
      if (state.sim.stopped) {
        state.sim.minutesStopped += 1;
        pushLocation(trip.location);
      } else {
        const path = state.sim.offRoute ? state.detourPoints : trip.route.points;
        state.sim.index = Math.min(state.sim.index + 1, path.length - 1);
        state.sim.minutesStopped = 0;
        pushLocation(path[state.sim.index]);
        if (!state.sim.offRoute && state.sim.index === path.length - 1) {
          trip.status = 'completed';
          state.sim.running = false;
        }
      }
    }
  }
  render();
}

root.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'mode') state.mode = target.dataset.mode;
  if (action === 'pick') state.screen = 'routes';
  if (action === 'back') {
    state.screen = 'destination';
    state.selectedRouteId = null;
  }
  if (action === 'select') state.selectedRouteId = target.dataset.route;
  if (action === 'start') {
    const route = planned.find((r) => r.routeId === state.selectedRouteId);
    if (route) startTrip(route);
  }
  if (action === 'arrived') {
    state.trip.status = 'completed';
    state.sim.running = false;
    state.checkin = null;
  }
  if (action === 'back-on-route') {
    state.sim.offRoute = false;
    state.sim.stopped = false;
    state.sim.minutesStopped = 0;
    state.sim.index = nearestIndex(state.trip.location, state.trip.route.points);
  }
  if (action === 'sos') raiseAlert({ type: 'sos', severity: 'high', message: 'Teen pressed the help button.' });
  if (action === 'respond') respond(target.dataset.response);
  if (action === 'ack') {
    state.alerts = state.alerts.map((alert) => (alert.id === target.dataset.alert ? { ...alert, status: 'acknowledged' } : alert));
  }
  if (action === 'stop') {
    state.sim.stopped = !state.sim.stopped;
    state.sim.minutesStopped = 0;
  }
  if (action === 'detour') {
    state.sim.offRoute = !state.sim.offRoute;
    state.sim.stopped = false;
    state.sim.minutesStopped = 0;
    if (state.sim.offRoute) {
      state.detourPoints = detourFrom(state.trip.location);
      state.sim.index = 0;
    } else {
      state.sim.index = nearestIndex(state.trip.location, state.trip.route.points);
    }
  }
  if (action === 'reset') {
    state.trip = null;
    state.checkin = null;
    state.alerts = [];
    state.trail = [];
    state.screen = 'destination';
    state.selectedRouteId = null;
    state.sim = { running: false, index: 0, offRoute: false, stopped: false, minutesStopped: 0 };
  }
  render();
});

root.addEventListener('change', (event) => {
  const target = event.target.closest('[data-action="toggle"]');
  if (!target) return;
  const key = target.dataset.key;
  if (key === 'checkRiskZones') state.settings.checkRiskZones = !state.settings.checkRiskZones;
  else state.settings[key] = state.settings[key] > 0 ? 0 : DEFAULT_SETTINGS[key];
  render();
});

render();
setInterval(tick, 1000);
