import { NextResponse } from "next/server";
import safePlaces from "../../../data/safe_places.json";
import { distanceToPathMeters } from "../../../logic/geo.js";
import {
  rankRoutesByUtility,
  scoreRoute,
  explainScore,
} from "../../../logic/riskScoring.js";
import { getRedmondIncidents } from "../../../lib/redmondIncidents.js";
import {
  planPointToPoint,
  publicRoutingError,
} from "../../../server/routing/index.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INCIDENT_PADDING_DEGREES = 0.004;
const MAX_INCIDENT_BBOX_SPAN = 0.95;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function incidentEnvelope(routes) {
  const points = routes.flatMap((route) => route.points || []);
  if (points.length === 0) return null;

  const latitudes = points.map(([lat]) => Number(lat)).filter(Number.isFinite);
  const longitudes = points.map(([, lng]) => Number(lng)).filter(Number.isFinite);
  if (latitudes.length === 0 || longitudes.length === 0) return null;

  const south = clamp(Math.min(...latitudes) - INCIDENT_PADDING_DEGREES, -90, 90);
  const north = clamp(Math.max(...latitudes) + INCIDENT_PADDING_DEGREES, -90, 90);
  const west = clamp(Math.min(...longitudes) - INCIDENT_PADDING_DEGREES, -180, 180);
  const east = clamp(Math.max(...longitudes) + INCIDENT_PADDING_DEGREES, -180, 180);

  if (east - west > MAX_INCIDENT_BBOX_SPAN || north - south > MAX_INCIDENT_BBOX_SPAN) {
    return null;
  }
  return [west, south, east, north];
}

function walkingPaths(route) {
  return (route.legs || [])
    .filter((leg) => String(leg.type || leg.mode).toLowerCase() === "walking" || String(leg.mode).toUpperCase() === "WALK")
    .map((leg) => leg.waypoints || [])
    .filter((points) => points.length > 0);
}

function displayIncidents(incidents, routes) {
  const paths = routes.map((route) => route.points || []).filter((path) => path.length > 1);
  return incidents
    .map((incident) => {
      const distance = Math.min(
        ...paths.map((path) => distanceToPathMeters([incident.lat, incident.lng], path)),
      );
      const recency = Math.exp(-Math.max(0, Number(incident.recencyDays) || 0) / 90);
      const impact = (Number(incident.severity) || 1) * recency * Math.exp(-distance / 250);
      return { incident, distance, impact };
    })
    .filter(({ distance }) => distance <= 750)
    .sort((a, b) => b.impact - a.impact || a.distance - b.distance)
    .slice(0, 80)
    .map(({ incident }) => incident);
}

function routeSummary(route) {
  if (route.mode === "transit") {
    const names = (route.transitLegs || [])
      .map((leg) => leg.routeShortName || leg.routeLongName || leg.mode)
      .filter(Boolean);
    if (names.length) return `${names.join(" → ")} · ${route.transferCount || 0} transfer${route.transferCount === 1 ? "" : "s"}`;
    return "Transit itinerary with mapped access walking";
  }
  return route.instructions?.[0]?.instruction || "Pedestrian route with turn-by-turn directions";
}

async function incidentContext(routes, currentTime) {
  const bbox = incidentEnvelope(routes);
  if (!bbox) {
    return {
      incidents: [],
      metadata: {
        applicable: false,
        live: false,
        fallback: false,
        reason: "Candidate envelope is too broad for a route-scoped Redmond query.",
      },
    };
  }

  try {
    const until = currentTime > new Date() ? new Date() : currentTime;
    const collection = await getRedmondIncidents({
      bbox,
      until,
      limit: 500,
    });
    return {
      incidents: collection.features.map((feature) => feature.properties),
      metadata: { applicable: true, ...collection.metadata },
    };
  } catch (error) {
    return {
      incidents: [],
      metadata: {
        applicable: true,
        live: false,
        fallback: false,
        reason: error.message || "Incident context could not be loaded.",
      },
    };
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const currentTime = body.departureTime ? new Date(body.departureTime) : new Date();
    if (Number.isNaN(currentTime.getTime())) {
      return NextResponse.json(
        { ok: false, error: { code: "invalid_departure_time", message: "Departure time must be a valid date." } },
        { status: 400 },
      );
    }

    const planned = await planPointToPoint(body);
    const context = await incidentContext(planned.routes, currentTime);
    const scored = planned.routes.map((route) => {
      const risk = scoreRoute(route.points, context.incidents, {
        currentTime,
        safePlaces,
        mode: planned.mode,
        walkingPaths: walkingPaths(route),
        legs: route.legs,
        transitLegs: route.transitLegs,
        waitMinutes: route.waitMinutes,
        transferCount: route.transferCount,
        serviceDisruption: route.serviceDisruption,
      });

      return {
        ...route,
        summary: routeSummary(route),
        riskScore: risk.score,
        riskLevel: risk.level,
        reasons: risk.reasons,
        crossedIncidentCount: risk.crossedZones.length,
        nearbyIncidentCount: risk.nearbyZones.length,
        riskBreakdown: risk.breakdown,
        transitRisk: risk.transitRisk,
        explanation: explainScore(risk, route.label.toLowerCase()),
      };
    });
    const routes = rankRoutesByUtility(scored, { currentTime });

    const mapIncidents = displayIncidents(context.incidents, routes);

    return NextResponse.json({
      ok: true,
      origin: planned.origin,
      destination: planned.destination,
      mode: planned.mode,
      routes,
      incidents: mapIncidents,
      metadata: {
        ...planned.metadata,
        incidents: {
          ...context.metadata,
          scoredCount: context.incidents.length,
          mapCount: mapIncidents.length,
        },
      },
    });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return NextResponse.json(
      { ok: false, error: publicRoutingError(error) },
      { status },
    );
  }
}
