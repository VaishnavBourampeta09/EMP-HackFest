import assert from 'node:assert/strict';
import { scoreSafety, rankSafety } from '../src/logic/safetyScoring.js';
import { decodePolyline } from '../src/server/routing/geo.js';
import { getValhallaRoutes } from '../src/server/routing/valhalla.js';

const ROUTE_WAYPOINTS = [[47.67, -122.12], [47.68, -122.12]];
const walkingRouteSample = { mode: 'walking', points: ROUTE_WAYPOINTS, durationMinutes: 10 };
const SAMPLE_INCIDENTS_ON_ROUTE = [{ id: 'a', lat: 47.675, lng: -122.12, severity: 5 }];
const daytimeSafetyEvaluation = scoreSafety(walkingRouteSample, SAMPLE_INCIDENTS_ON_ROUTE);

assert.equal(daytimeSafetyEvaluation.incidentCount, 1);
assert.equal(
  daytimeSafetyEvaluation.safetyScore,
  scoreSafety(walkingRouteSample, [{ ...SAMPLE_INCIDENTS_ON_ROUTE[0], severity: 1, recencyDays: 999 }]).safetyScore
);
assert.equal(scoreSafety(walkingRouteSample, [...SAMPLE_INCIDENTS_ON_ROUTE, ...SAMPLE_INCIDENTS_ON_ROUTE]).incidentCount, 1);
assert.equal(scoreSafety(walkingRouteSample, [{ id: 'far', lat: 47.675, lng: -122.125 }]).incidentCount, 0);
assert.equal(scoreSafety(walkingRouteSample, [], [], 'night').safetyScore, 7.5);
assert.equal(scoreSafety(walkingRouteSample, [], [{ lit: 'no', points: ROUTE_WAYPOINTS }], 'night').safetyScore, 5);
assert.equal(scoreSafety(walkingRouteSample, [], [{ lit: 'yes', points: ROUTE_WAYPOINTS }], 'night').safetyScore, 10);

const unlitstreet = { lit: 'yes', points: ROUTE_WAYPOINTS.map(point => [point[0], point[1] + 0.01]) };
assert.equal(scoreSafety(walkingRouteSample, [], [unlitstreet], 'night').lightingDataAvailable, false);

const DENSELY_SAMPLED_ROUTE = { ...walkingRouteSample, points: [ROUTE_WAYPOINTS[0], [47.674, -122.12], [47.677, -122.12], ROUTE_WAYPOINTS[1]] };
assert.deepEqual(
  scoreSafety(DENSELY_SAMPLED_ROUTE, SAMPLE_INCIDENTS_ON_ROUTE, [{lit:'no', points: ROUTE_WAYPOINTS}], 'night'),
  scoreSafety(walkingRouteSample, SAMPLE_INCIDENTS_ON_ROUTE, [{lit:'no', points: ROUTE_WAYPOINTS}], 'night')
);

const mixedTransitRoute = {
  ...walkingRouteSample,
  mode: 'transit',
  legs: [
    { type: 'walking', waypoints: ROUTE_WAYPOINTS },
    { type: 'transit', waypoints: [[47.68, -122.12], [47.7, -122.12]] },
  ]
};

assert.deepEqual(scoreSafety(mixedTransitRoute, SAMPLE_INCIDENTS_ON_ROUTE), daytimeSafetyEvaluation);
assert.equal(scoreSafety(mixedTransitRoute, [{id:'bus-only',lat:47.69,lng:-122.12}]).incidentCount, 0);
assert.equal(scoreSafety({mode:'transit', legs:[]}).safetyScore, null);

const RANKED_ROUTES = rankSafety([
  {id:'slow', safetyScore:8, durationMinutes:20},
  {id:'fast',safetyScore:8,durationMinutes:10}
]);
assert.equal(RANKED_ROUTES[0].id, 'fast');

let valhallaRequestCount = 0;
globalThis.fetch = async (REQUEST_URL, requestOptions) => {
  valhallaRequestCount++;
  const requestbody = JSON.parse(requestOptions.body);
  assert.equal(requestbody.costing, 'pedestrian');
  assert.equal(requestbody.alternates, requestbody.locations.length === 3 ? 0 : 2);
  assert.equal(requestbody.exclude_polygons, undefined);

  const MOCK_TRIP_RESPONSE = {
    status: 0,
    summary: {time: 600, length: 1},
    legs: [{
      shape: {
        type: 'LineString',
        coordinates: ROUTE_WAYPOINTS.map(([latitude, longitude]) => [longitude, latitude])
      },
      summary: {time: 600, length: 1}
    }]
  };

  return new Response(JSON.stringify({trip: MOCK_TRIP_RESPONSE}));
};

const discoveredWalkingRoutes = await getValhallaRoutes({lat:47.67,lng:-122.12},{lat:47.68,lng:-122.12});
assert.equal(discoveredWalkingRoutes.length, 1);
assert.equal(valhallaRequestCount, 3);
console.log('Passed: scoring, unknown lighting, vertex density, walking-only transit, ranking, and bounded waypoint attempts.');

function encodePolylineValue(NUMERIC_VALUE) {
  let shiftedvalue = NUMERIC_VALUE < 0 ? -NUMERIC_VALUE * 2 - 1 : NUMERIC_VALUE * 2;
  let encoded_chars = '';
  while (shiftedvalue >= 32) {
    encoded_chars += String.fromCharCode((shiftedvalue % 32) + 32 + 63);
    shiftedvalue = Math.floor(shiftedvalue / 32);
  }
  return encoded_chars + String.fromCharCode(shiftedvalue + 63);
}

assert.deepEqual(
  decodePolyline(encodePolylineValue(476740000) + encodePolylineValue(-1221215000), 7),
  [[-122.1215, 47.674]]
);
console.log('Passed: precision-7 transit longitude regression.');

const shapedRouteRequests = [];
globalThis.fetch = async (REQUEST_URL, requestOptions) => {
  const REQUEST_BODY = JSON.parse(requestOptions.body);
  shapedRouteRequests.push(REQUEST_BODY);
  assert.equal(REQUEST_BODY.exclude_polygons, undefined);

  const waypointInMiddle = REQUEST_BODY.locations.length === 3 ? REQUEST_BODY.locations[1] : null;
  if (waypointInMiddle) assert.equal(waypointInMiddle.type, 'through');

  const COMPLETE_PATH = [
    ROUTE_WAYPOINTS[0],
    ...(waypointInMiddle ? [[waypointInMiddle.lat, waypointInMiddle.lon]] : []),
    ROUTE_WAYPOINTS[1]
  ];

  const shapedtripresponse = {
    status: 0,
    summary: {
      time: waypointInMiddle ? 800 : 600,
      length: waypointInMiddle ? 1.3 : 1
    },
    legs: [{
      shape: {
        type: 'LineString',
        coordinates: COMPLETE_PATH.map(([latitude, longitude]) => [longitude, latitude])
      }
    }]
  };

  return new Response(JSON.stringify({
    trip: shapedtripresponse,
    ...(waypointInMiddle ? {} : {alternates: [{trip: shapedtripresponse}, {trip: shapedtripresponse}]})
  }));
};

const SHAPED_ALTERNATIVE_ROUTES = await getValhallaRoutes({lat:47.67,lng:-122.12},{lat:47.68,lng:-122.12});
assert.equal(SHAPED_ALTERNATIVE_ROUTES.length, 3);
assert.equal(shapedRouteRequests.length, 3);
assert.equal(new Set(SHAPED_ALTERNATIVE_ROUTES.map(routeOption => routeOption.id)).size, 3);

assert.ok(
  (shapedRouteRequests[1].locations[1].lon + 122.12) *
  (shapedRouteRequests[2].locations[1].lon + 122.12) < 0
);

let networkfailures = 0;
globalThis.fetch = async () => {
  if (networkfailures++) throw new Error('Unreachable waypoint');
  return new Response(JSON.stringify({
    trip: {
      status: 0,
      summary: {time: 600, length: 1},
      legs: [{
        shape: {
          type: 'LineString',
          coordinates: ROUTE_WAYPOINTS.map(([latitude, longitude]) => [longitude, latitude])
        }
      }]
    }
  }));
};

const routesAfterFailureRecovery = await getValhallaRoutes({lat:47.67,lng:-122.12},{lat:47.68,lng:-122.12});
assert.equal(routesAfterFailureRecovery.length, 1);
assert.equal(networkfailures, 3);
console.log('Passed: duplicate alternatives trigger opposite-side routes; failed waypoints preserve baseline.');
