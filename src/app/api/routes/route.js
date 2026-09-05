import { NextResponse } from 'next/server';
import {
  planPointToPoint,
  publicRoutingError,
  routingCapabilities,
  RoutingInputError
} from '../../../server/routing/index.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/routes',
    capabilities: routingCapabilities(),
    request: {
      method: 'POST',
      body: {
        origin: 'place text, "lat,lng", [lat,lng], or {lat,lng}',
        destination: 'place text, "lat,lng", [lat,lng], or {lat,lng}',
        mode: 'walking | transit',
        departureTime: 'optional ISO-8601 value',
        maxCandidates: 'optional integer, 1–4'
      }
    }
  });
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      throw new RoutingInputError('Request body must be valid JSON.');
    }
    const result = await planPointToPoint(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return NextResponse.json(
      { ok: false, error: publicRoutingError(error) },
      { status }
    );
  }
}
