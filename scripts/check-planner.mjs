import assert from 'node:assert/strict';

for (const mode of ['walking', 'transit']) {
  const response = await fetch('http://127.0.0.1:3011/api/plan', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({origin:[47.674,-122.1215],destination:[47.6749,-122.1291],mode,safetyMode:'night'}),
  });
  const payload = await response.json();
  assert.equal(payload.ok, true, JSON.stringify(payload.error));
  assert.ok(payload.routes.length >= 1 && payload.routes.length <= 3);
  for (const route of payload.routes) {
    for (const field of ['summary','riskScore','conditionScore','explanation','riskBreakdown']) assert.equal(field in route, false, field);
    assert.equal(route.safetyMode, 'night');
    assert.ok(typeof route.safetyScore === 'number' && route.safetyScore >= 0 && route.safetyScore <= 10);
    assert.ok(route.points.every(([lat, lng]) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180));
  }
  console.log(JSON.stringify({mode, routes:payload.routes.map(r=>({score:r.safetyScore,density:r.incidentsPerKm,lit:r.lightingDataAvailable,legs:r.legs.map(l=>l.type)}))}));
}
