import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Street lamp positions from OpenStreetMap via the public Overpass API.
 *
 * This is the real lighting layer behind the "lit coverage" figures the app
 * shows. Overpass needs no key but is shared infrastructure, so responses are
 * cached in-process and bounding boxes are snapped to a coarse grid to keep the
 * number of distinct upstream queries small.
 */

const OVERPASS_URL =
  process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_SPAN_DEGREES = 0.5;
const GRID = 0.01; // ≈1.1 km cells

const cache = new Map();

class LightingQueryError extends Error {}

function parseBbox(raw) {
  if (!raw) throw new LightingQueryError("bbox is required as west,south,east,north");
  const parts = String(raw)
    .split(",")
    .map((value) => Number(value.trim()));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw new LightingQueryError("bbox must contain west,south,east,north coordinates");
  }

  const [west, south, east, north] = parts;
  if (west >= east || south >= north) {
    throw new LightingQueryError("bbox must be ordered west,south,east,north");
  }
  if (east - west > MAX_SPAN_DEGREES || north - south > MAX_SPAN_DEGREES) {
    throw new LightingQueryError(
      `bbox may not span more than ${MAX_SPAN_DEGREES} degrees on a side`,
    );
  }
  return { west, south, east, north };
}

/** Snap outward to a grid so nearby requests reuse one cached Overpass result. */
function snap({ west, south, east, north }) {
  return {
    west: Math.floor(west / GRID) * GRID,
    south: Math.floor(south / GRID) * GRID,
    east: Math.ceil(east / GRID) * GRID,
    north: Math.ceil(north / GRID) * GRID,
  };
}

async function fetchLamps(box) {
  const query = `[out:json][timeout:25];node["highway"="street_lamp"](${box.south},${box.west},${box.north},${box.east});out skel qt;`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        // Overpass answers 406 to clients that send no User-Agent.
        "User-Agent": "Sentinel/0.1 (safety routing prototype)",
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Overpass responded ${response.status}`);
    }
    const payload = await response.json();
    return (payload.elements || [])
      .filter((el) => Number.isFinite(el.lat) && Number.isFinite(el.lon))
      .map((el) => [Number(el.lat.toFixed(6)), Number(el.lon.toFixed(6))]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const box = snap(parseBbox(searchParams.get("bbox")));
    const key = [box.west, box.south, box.east, box.north]
      .map((value) => value.toFixed(3))
      .join(",");

    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return NextResponse.json({
        ok: true,
        lamps: hit.lamps,
        metadata: { ...hit.metadata, cached: true },
      });
    }

    let lamps = [];
    let live = true;
    let error = null;
    try {
      lamps = await fetchLamps(box);
    } catch (cause) {
      // Overpass is best-effort; the rest of the trip must still work.
      live = false;
      error = cause?.name === "AbortError" ? "Overpass timed out" : String(cause?.message ?? cause);
    }

    const metadata = {
      provider: "OpenStreetMap",
      source: "Overpass API — highway=street_lamp",
      attribution: "© OpenStreetMap contributors (ODbL)",
      live,
      error,
      bbox: [box.west, box.south, box.east, box.north],
      count: lamps.length,
      queriedAt: new Date().toISOString(),
      cached: false,
    };

    if (live) cache.set(key, { at: Date.now(), lamps, metadata });

    return NextResponse.json({ ok: true, lamps, metadata });
  } catch (error) {
    if (error instanceof LightingQueryError) {
      return NextResponse.json(
        { ok: false, error: "invalid_lighting_query", message: error.message },
        { status: 400 },
      );
    }
    console.error("Unexpected lighting API failure", error);
    return NextResponse.json(
      { ok: false, error: "lighting_unavailable", message: "Street lighting data is unavailable." },
      { status: 502 },
    );
  }
}
