import { NextResponse } from 'next/server';
import { publicRoutingError, searchPlaces } from '../../../server/routing/index.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const limit = url.searchParams.get('limit');
    const results = await searchPlaces(query, { limit });
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return NextResponse.json(
      { ok: false, error: publicRoutingError(error) },
      { status }
    );
  }
}
