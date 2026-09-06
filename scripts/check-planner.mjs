import assert from "node:assert/strict";

const REDMOND_LIBRARY_COORDINATES = [47.674, -122.1215];
const homeCoordinates = [47.6749, -122.1291];

for (const transportMode of ["walking", "transit"]) {
  const PLAN_RESPONSE = await fetch("http://127.0.0.1:3011/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: REDMOND_LIBRARY_COORDINATES,
      to: homeCoordinates,
      travel_mode: transportMode,
      time_of_day: "night",
    }),
  });

  const responsedata = await PLAN_RESPONSE.json();
  assert.equal(responsedata.ok, true, JSON.stringify(responsedata.error));
  assert.ok(responsedata.routes.length >= 1 && responsedata.routes.length <= 3);

  for (const CandidateRoute of responsedata.routes) {
    const FORBIDDEN_LEGACY_FIELDS = [
      "summary",
      "riskScore",
      "conditionScore",
      "explanation",
      "riskBreakdown",
    ];

    for (const deprecatedFieldName of FORBIDDEN_LEGACY_FIELDS)
      assert.equal(deprecatedFieldName in CandidateRoute, false, deprecatedFieldName);

    assert.equal(CandidateRoute.time_of_day, "night");

    assert.ok(
      typeof CandidateRoute.overall_safety_score === "number" &&
        CandidateRoute.overall_safety_score >= 0 &&
        CandidateRoute.overall_safety_score <= 10,
    );

    assert.ok(
      CandidateRoute.waypoints.every(
        ([LATITUDE_COORDINATE, longitudeCoordinate]) =>
          Math.abs(LATITUDE_COORDINATE) <= 90 && Math.abs(longitudeCoordinate) <= 180,
      ),
    );
  }

  console.log(
    JSON.stringify({
      SELECTED_TRANSPORT_MODE: transportMode,
      availableRouteOptions: responsedata.routes.map((availableOption) => ({
        safety_rating: availableOption.overall_safety_score,
        INCIDENT_CONCENTRATION_PER_KM: availableOption.incidentsPerKm,
        streetLightingAvailable: availableOption.lightingDataAvailable,
        trip_segments_by_type: availableOption.legs.map((SEGMENT) => SEGMENT.type),
      })),
    }),
  );
}
