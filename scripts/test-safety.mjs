import assert from 'node:assert/strict';
import { scoreSafety, rankSafety } from '../src/logic/safetyScoring.js';
import { decodePolyline } from '../src/server/routing/geo.js';
import { getValhallaRoutes } from '../src/server/routing/valhalla.js';

const route_waypoints = [[47.67, -122.12], [47.68, -122.12]];
const walking_route_sample = { mode: 'walking', points: route_waypoints, durationMinutes: 10 };
const sample_incidents_on_route = [{ id: 'a', lat: 47.675, lng: -122.12, severity: 5 }];
const daytime_safety_evaluation = scoreSafety(walking_route_sample, sample_incidents_on_route);

assert.equal(daytime_safety_evaluation.incidentCount, 1);
assert.equal(
  daytime_safety_evaluation.safetyScore,
  scoreSafety(walking_route_sample, [{ ...sample_incidents_on_route[0], severity: 1, recencyDays: 999 }]).safetyScore
);
assert.equal(scoreSafety(walking_route_sample, [...sample_incidents_on_route, ...sample_incidents_on_route]).incidentCount, 1);
assert.equal(scoreSafety(walking_route_sample, [{ id: 'far', lat: 47.675, lng: -122.125 }]).incidentCount, 0);
assert.equal(scoreSafety(walking_route_sample, [], [], 'night').safetyScore, 7.5);
assert.equal(scoreSafety(walking_route_sample, [], [{ lit: 'no', points: route_waypoints }], 'night').safetyScore, 5);
assert.equal(scoreSafety(walking_route_sample, [], [{ lit: 'yes', points: route_waypoints }], 'night').safetyScore, 10);

const unlit_street_section = { lit: 'yes', points: route_waypoints.map(point => [point[0], point[1] + 0.01]) };
assert.equal(scoreSafety(walking_route_sample, [], [unlit_street_section], 'night').lightingDataAvailable, false);

const densely_sampled_route = { ...walking_route_sample, points: [route_waypoints[0], [47.674, -122.12], [47.677, -122.12], route_waypoints[1]] };
assert.deepEqual(
  scoreSafety(densely_sampled_route, sample_incidents_on_route, [{lit:'no', points: route_waypoints}], 'night'),
  scoreSafety(walking_route_sample, sample_incidents_on_route, [{lit:'no', points: route_waypoints}], 'night')
);

const mixed_transit_route = {
  ...walking_route_sample,
  mode: 'transit',
  legs: [
    { type: 'walking', waypoints: route_waypoints },
    { type: 'transit', waypoints: [[47.68, -122.12], [47.7, -122.12]] },
  ]
};

assert.deepEqual(scoreSafety(mixed_transit_route, sample_incidents_on_route), daytime_safety_evaluation);
assert.equal(scoreSafety(mixed_transit_route, [{id:'bus-only',lat:47.69,lng:-122.12}]).incidentCount, 0);
assert.equal(scoreSafety({mode:'transit', legs:[]}).safetyScore, null);

const ranked_routes = rankSafety([
  {id:'slow', safetyScore:8, durationMinutes:20},
  {id:'fast',safetyScore:8,durationMinutes:10}
]);
assert.equal(ranked_routes[0].id, 'fast');

let valhalla_request_count = 0;
globalThis.fetch = async (request_url, request_options) => {
  valhalla_request_count++;
  const request_body = JSON.parse(request_options.body);
  assert.equal(request_body.costing, 'pedestrian');
  assert.equal(request_body.alternates, request_body.locations.length === 3 ? 0 : 2);
  assert.equal(request_body.exclude_polygons, undefined);

  const mock_trip_response = {
    status: 0,
    summary: {time: 600, length: 1},
    legs: [{
      shape: {
        type: 'LineString',
        coordinates: route_waypoints.map(([latitude, longitude]) => [longitude, latitude])
      },
      summary: {time: 600, length: 1}
    }]
  };

  return new Response(JSON.stringify({trip: mock_trip_response}));
};

const discovered_walking_routes = await getValhallaRoutes({lat:47.67,lng:-122.12},{lat:47.68,lng:-122.12});
assert.equal(discovered_walking_routes.length, 1);
assert.equal(valhalla_request_count, 3);
console.log('Passed: scoring, unknown lighting, vertex density, walking-only transit, ranking, and bounded waypoint attempts.');

function encode_polyline_value(numeric_value) {
  let shifted_value = numeric_value < 0 ? -numeric_value * 2 - 1 : numeric_value * 2;
  let encoded_characters = '';
  while (shifted_value >= 32) {
    encoded_characters += String.fromCharCode((shifted_value % 32) + 32 + 63);
    shifted_value = Math.floor(shifted_value / 32);
  }
  return encoded_characters + String.fromCharCode(shifted_value + 63);
}

assert.deepEqual(
  decodePolyline(encode_polyline_value(476740000) + encode_polyline_value(-1221215000), 7),
  [[-122.1215, 47.674]]
);
console.log('Passed: precision-7 transit longitude regression.');

const shaped_route_requests = [];
globalThis.fetch = async (request_url, request_options) => {
  const request_body = JSON.parse(request_options.body);
  shaped_route_requests.push(request_body);
  assert.equal(request_body.exclude_polygons, undefined);

  const waypoint_in_middle = request_body.locations.length === 3 ? request_body.locations[1] : null;
  if (waypoint_in_middle) assert.equal(waypoint_in_middle.type, 'through');

  const complete_path = [
    route_waypoints[0],
    ...(waypoint_in_middle ? [[waypoint_in_middle.lat, waypoint_in_middle.lon]] : []),
    route_waypoints[1]
  ];

  const shaped_trip_response = {
    status: 0,
    summary: {
      time: waypoint_in_middle ? 800 : 600,
      length: waypoint_in_middle ? 1.3 : 1
    },
    legs: [{
      shape: {
        type: 'LineString',
        coordinates: complete_path.map(([latitude, longitude]) => [longitude, latitude])
      }
    }]
  };

  return new Response(JSON.stringify({
    trip: shaped_trip_response,
    ...(waypoint_in_middle ? {} : {alternates: [{trip: shaped_trip_response}, {trip: shaped_trip_response}]})
  }));
};

const shaped_alternative_routes = await getValhallaRoutes({lat:47.67,lng:-122.12},{lat:47.68,lng:-122.12});
assert.equal(shaped_alternative_routes.length, 3);
assert.equal(shaped_route_requests.length, 3);
assert.equal(new Set(shaped_alternative_routes.map(route_option => route_option.id)).size, 3);

assert.ok(
  (shaped_route_requests[1].locations[1].lon + 122.12) *
  (shaped_route_requests[2].locations[1].lon + 122.12) < 0
);

let network_failures_encountered = 0;
globalThis.fetch = async () => {
  if (network_failures_encountered++) throw new Error('Unreachable waypoint');
  return new Response(JSON.stringify({
    trip: {
      status: 0,
      summary: {time: 600, length: 1},
      legs: [{
        shape: {
          type: 'LineString',
          coordinates: route_waypoints.map(([latitude, longitude]) => [longitude, latitude])
        }
      }]
    }
  }));
};

const routes_after_failure_recovery = await getValhallaRoutes({lat:47.67,lng:-122.12},{lat:47.68,lng:-122.12});
assert.equal(routes_after_failure_recovery.length, 1);
assert.equal(network_failures_encountered, 3);
console.log('Passed: duplicate alternatives trigger opposite-side routes; failed waypoints preserve baseline.');
