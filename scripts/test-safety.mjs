import assert from 'node:assert/strict';
import { scoreSafety, rankSafety } from '../src/logic/safetyScoring.js';
import { decodePolyline } from '../src/server/routing/geo.js';
import { getValhallaRoutes } from '../src/server/routing/valhalla.js';

const points = [[47.67, -122.12], [47.68, -122.12]];
const route = { mode: 'walking', points, durationMinutes: 10 };
const incidents = [{ id: 'a', lat: 47.675, lng: -122.12, severity: 5 }];
const day = scoreSafety(route, incidents);
assert.equal(day.incidentCount, 1);
assert.equal(day.safetyScore, scoreSafety(route, [{ ...incidents[0], severity: 1, recencyDays: 999 }]).safetyScore);
assert.equal(scoreSafety(route, [...incidents, ...incidents]).incidentCount, 1);
assert.equal(scoreSafety(route, [{ id: 'far', lat: 47.675, lng: -122.125 }]).incidentCount, 0);
assert.equal(scoreSafety(route, [], [], 'night').safetyScore, 7.5);
assert.equal(scoreSafety(route, [], [{ lit: 'no', points }], 'night').safetyScore, 5);
assert.equal(scoreSafety(route, [], [{ lit: 'yes', points }], 'night').safetyScore, 10);
assert.equal(scoreSafety(route, [], [{ lit: 'yes', points: points.map(p => [p[0], p[1] + 0.01]) }], 'night').lightingDataAvailable, false);
const dense = { ...route, points: [points[0], [47.674, -122.12], [47.677, -122.12], points[1]] };
assert.deepEqual(scoreSafety(dense, incidents, [{lit:'no', points}], 'night'), scoreSafety(route, incidents, [{lit:'no', points}], 'night'));
const transit = { ...route, mode: 'transit', legs: [
  { type: 'walking', waypoints: points },
  { type: 'transit', waypoints: [[47.68, -122.12], [47.7, -122.12]] },
] };
assert.deepEqual(scoreSafety(transit, incidents), day);
assert.equal(scoreSafety(transit, [{id:'bus-only',lat:47.69,lng:-122.12}]).incidentCount, 0);
assert.equal(scoreSafety({mode:'transit', legs:[]}).safetyScore, null);
assert.equal(rankSafety([{id:'slow', safetyScore:8, durationMinutes:20},{id:'fast',safetyScore:8,durationMinutes:10}])[0].id, 'fast');

let calls = 0;
globalThis.fetch = async (url, options) => {
  calls++;
  const body = JSON.parse(options.body);
  assert.equal(body.costing, 'pedestrian');
  assert.equal(body.alternates, body.locations.length === 3 ? 0 : 2);
  assert.equal(body.exclude_polygons, undefined);
  const trip = { status: 0, summary: {time:600,length:1}, legs:[{shape:{type:'LineString',coordinates:points.map(([lat,lng])=>[lng,lat])},summary:{time:600,length:1}}] };
  return new Response(JSON.stringify({trip}));
};
const routes = await getValhallaRoutes({lat:47.67,lng:-122.12},{lat:47.68,lng:-122.12});
assert.equal(routes.length, 1);
assert.equal(calls, 3);
console.log('Passed: scoring, unknown lighting, vertex density, walking-only transit, ranking, and bounded waypoint attempts.');

function encodeValue(value) {
  let n = value < 0 ? -value * 2 - 1 : value * 2, encoded = '';
  while (n >= 32) { encoded += String.fromCharCode((n % 32) + 32 + 63); n = Math.floor(n / 32); }
  return encoded + String.fromCharCode(n + 63);
}
assert.deepEqual(decodePolyline(encodeValue(476740000) + encodeValue(-1221215000), 7), [[-122.1215, 47.674]]);
console.log('Passed: precision-7 transit longitude regression.');

const shapedRequests = [];
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  shapedRequests.push(body);
  assert.equal(body.exclude_polygons, undefined);
  const middle = body.locations.length === 3 ? body.locations[1] : null;
  if (middle) assert.equal(middle.type, 'through');
  const line = [points[0], ...(middle ? [[middle.lat, middle.lon]] : []), points[1]];
  const trip = {status:0,summary:{time:middle ? 800 : 600,length:middle ? 1.3 : 1},
    legs:[{shape:{type:'LineString',coordinates:line.map(([lat,lng])=>[lng,lat])}}]};
  return new Response(JSON.stringify({trip, ...(middle ? {} : {alternates:[{trip},{trip}]})}));
};
const shaped = await getValhallaRoutes({lat:47.67,lng:-122.12},{lat:47.68,lng:-122.12});
assert.equal(shaped.length, 3);
assert.equal(shapedRequests.length, 3);
assert.equal(new Set(shaped.map(r=>r.id)).size, 3);
assert.ok((shapedRequests[1].locations[1].lon + 122.12) * (shapedRequests[2].locations[1].lon + 122.12) < 0);

let failures = 0;
globalThis.fetch = async () => {
  if (failures++) throw new Error('Unreachable waypoint');
  return new Response(JSON.stringify({trip:{status:0,summary:{time:600,length:1},
    legs:[{shape:{type:'LineString',coordinates:points.map(([lat,lng])=>[lng,lat])}}]}}));
};
assert.equal((await getValhallaRoutes({lat:47.67,lng:-122.12},{lat:47.68,lng:-122.12})).length, 1);
assert.equal(failures, 3);
console.log('Passed: duplicate alternatives trigger opposite-side routes; failed waypoints preserve baseline.');
