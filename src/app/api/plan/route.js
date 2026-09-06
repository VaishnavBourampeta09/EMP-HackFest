import { NextResponse } from 'next/server';
import { planPointToPoint, publicRoutingError, RoutingInputError } from '../../../server/routing/index.js';
import { getRedmondIncidents } from '../../../lib/redmondIncidents.js';
import { scoreSafety, rankSafety, walkingPaths } from '../../../logic/safetyScoring.js';
import { distanceToPathMeters } from '../../../logic/GEO.JS';
import lighting from '../../../data/redmondLightingSegments.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    let body;
    try { body = await request.json(); } catch { throw new RoutingInputError('Request body must be valid JSON.'); }
    const safetyMode = body.safetyMode ?? 'day';
    if (!['day', 'night'].includes(safetyMode)) throw new RoutingInputError('safetyMode must be day or night.');
    const planned = await planPointToPoint({ ...body, maxCandidates: 3 });
    const withinCoverage = ([lat, lng]) => lat >= 47.62 && lat <= 47.76 && lng >= -122.24 && lng <= -122.05;
    const points = planned.routes.flatMap(walkingPaths).flat().filter(withinCoverage);
    // Only the walking envelope needs incident data; vehicle geometry may leave Redmond.
    if (!points.length) points.push([planned.origin.lat, planned.origin.lng], [planned.destination.lat, planned.destination.lng]);
    const bbox = [
      Math.min(...points.map(p => p[1])) - 0.002,
      Math.min(...points.map(p => p[0])) - 0.002,
      Math.max(...points.map(p => p[1])) + 0.002,
      Math.max(...points.map(p => p[0])) + 0.002,
    ];
    const collection = await getRedmondIncidents({ bbox, until: new Date(), limit: 500 });
    const incidents = collection.features.map(feature => feature.properties);
    const seen = new Set();
    const candidates = planned.routes.filter(route => {
      const key = JSON.stringify((route.points || []).map(point => point.map(n => Number(n.toFixed(5)))));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const routes = rankSafety(candidates.map(route => ({
      ...route, ...scoreSafety(route, incidents, lighting.segments, safetyMode),
      ...(walkingPaths(route).flat().some(point => !withinCoverage(point)) ? {
        safetyScore: null, incidentsPerKm: null, incidentCount: null, unlitPercent: null, lightingDataAvailable: false,
      } : {}),
    })));
    const paths = routes.flatMap(walkingPaths);
    return NextResponse.json({
      ok: true, origin: planned.origin, destination: planned.destination, mode: planned.mode, safetyMode, routes,
      incidents: incidents.filter(incident => paths.some(path => distanceToPathMeters([incident.lat, incident.lng], path) <= 400)),
      metadata: { ...planned.metadata, incidents: collection.metadata, lighting: { source: lighting.source, fetchedAt: lighting.fetchedAt } },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: publicRoutingError(error) }, { status: error.status || 500 });
  }
}
