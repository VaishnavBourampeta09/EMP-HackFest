import assert from "node:assert/strict";

const redmond_library_coordinates = [47.674, -122.1215];
const home_coordinates = [47.6749, -122.1291];

for (const transport_mode of ["walking", "transit"]) {
  const plan_response = await fetch("http://127.0.0.1:3011/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: redmond_library_coordinates,
      to: home_coordinates,
      travel_mode: transport_mode,
      time_of_day: "night",
    }),
  });

  const response_data = await plan_response.json();
  assert.equal(response_data.ok, true, JSON.stringify(response_data.error));
  assert.ok(response_data.routes.length >= 1 && response_data.routes.length <= 3);

  for (const candidate_route of response_data.routes) {
    const forbidden_legacy_fields = [
      "summary",
      "riskScore",
      "conditionScore",
      "explanation",
      "riskBreakdown",
    ];

    for (const deprecated_field_name of forbidden_legacy_fields)
      assert.equal(deprecated_field_name in candidate_route, false, deprecated_field_name);

    assert.equal(candidate_route.time_of_day, "night");

    assert.ok(
      typeof candidate_route.overall_safety_score === "number" &&
        candidate_route.overall_safety_score >= 0 &&
        candidate_route.overall_safety_score <= 10,
    );

    assert.ok(
      candidate_route.waypoints.every(
        ([latitude_coordinate, longitude_coordinate]) =>
          Math.abs(latitude_coordinate) <= 90 && Math.abs(longitude_coordinate) <= 180,
      ),
    );
  }

  console.log(
    JSON.stringify({
      selected_transport_mode: transport_mode,
      available_route_options: response_data.routes.map((available_option) => ({
        safety_rating: available_option.overall_safety_score,
        incident_concentration_per_km: available_option.incidentsPerKm,
        street_lighting_available: available_option.lightingDataAvailable,
        trip_segments_by_type: available_option.legs.map((segment) => segment.type),
      })),
    }),
  );
}
