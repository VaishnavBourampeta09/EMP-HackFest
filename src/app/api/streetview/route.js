import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Street-level photography along a route, from KartaView (formerly
 * OpenStreetCam). It is an open, keyless imagery archive, so the corridor view
 * works without a Google Maps or Mapillary token.
 *
 * The route is sampled at a handful of anchor points and the nearest photo to
 * each is returned, giving an ordered sequence the client can advance through
 * as the trip progresses. Coverage is patchy outside main roads; the client
 * falls back to the map view wherever a segment has no photo.
 */

const KARTAVIEW_URL = "https://api.openstreetcam.org/2.0/photo/";
const MAX_ANCHORS = 12;
const SEARCH_RADIUS_M = 140;
const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 9_000;

const cache = new Map();

function isLatLng(point) {
  return (
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(Number(point[0])) &&
    Number.isFinite(Number(point[1]))
  );
}

/** Evenly spaced anchors along the point list, endpoints included. */
function sampleAnchors(points, count) {
  if (points.length <= count) return points.map((point, index) => ({ point, index }));
  const step = (points.length - 1) / (count - 1);
  const anchors = [];
  for (let i = 0; i < count; i += 1) {
    const index = Math.round(i * step);
    anchors.push({ point: points[index], index });
  }
  return anchors;
}

async function nearestPhoto(lat, lng) {
  const url = new URL(KARTAVIEW_URL);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));
  url.searchParams.set("radius", String(SEARCH_RADIUS_M));
  url.searchParams.set("itemsPerPage", "4");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        // Open endpoints commonly reject clients with no User-Agent.
        "User-Agent": "Sentinel/0.1 (safety routing prototype)",
      },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const payload = await response.json();
    const rows = payload?.result?.data;
    if (!Array.isArray(rows) || rows.length === 0) return [];

    // Return every usable candidate, nearest first, so a dead storage node can
    // be skipped in favour of the next photo at the same anchor.
    return rows
      .map((row) => ({ row, distance: Number(row.distance) }))
      .filter((entry) => Number.isFinite(entry.distance))
      .sort((a, b) => a.distance - b.distance)
      .map(({ row, distance }) => {
        const template = String(row.fileurl || "");
        if (!template.includes("{{sizeprefix}}")) return null;
        return {
          id: String(row.id),
          lat: Number(row.lat),
          lng: Number(row.lng),
          heading: Number(row.heading),
          distanceMeters: Math.round(distance),
          shotDate: row.shotDate ?? row.dateAdded ?? null,
          // `lth` is the ~600 KB large thumbnail; `th` is a light preview.
          imageUrl: template.replace("{{sizeprefix}}", "lth"),
          thumbUrl: template.replace("{{sizeprefix}}", "th"),
          sequenceId: row.sequenceId ? String(row.sequenceId) : null,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * KartaView spreads photos across several storage nodes and individual nodes go
 * down (502) while others serve fine. Checking here means the client is never
 * handed a frame that will render as an empty box.
 */
async function imageIsServable(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      headers: { "User-Agent": "Sentinel/0.1 (safety routing prototype)" },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function signature(points) {
  const first = points[0];
  const last = points[points.length - 1];
  return [points.length, ...first, ...last].map((n) => Number(n).toFixed(4)).join(":");
}

export async function POST(request) {
  try {
    const body = await request.json();
    const raw = Array.isArray(body?.points) ? body.points : [];
    const points = raw.filter(isLatLng).map((p) => [Number(p[0]), Number(p[1])]);

    if (points.length < 2) {
      return NextResponse.json(
        { ok: false, error: "invalid_request", message: "points must contain at least two [lat,lng] pairs." },
        { status: 400 },
      );
    }

    const key = signature(points);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return NextResponse.json({ ok: true, ...hit.value, cached: true });
    }

    const anchors = sampleAnchors(points, MAX_ANCHORS);

    // For each anchor take the nearest photo that is actually being served,
    // walking outwards through the alternates when a storage node is down.
    const results = await Promise.all(
      anchors.map(async ({ point, index }) => {
        const candidates = await nearestPhoto(point[0], point[1]);
        for (const candidate of candidates) {
          if (await imageIsServable(candidate.imageUrl)) {
            return { ...candidate, routeIndex: index, anchor: point };
          }
        }
        return null;
      }),
    );

    // Keep route order, drop misses, and collapse repeats of the same photo.
    const seen = new Set();
    const frames = results.filter(Boolean).filter((frame) => {
      if (seen.has(frame.id)) return false;
      seen.add(frame.id);
      return true;
    });

    const value = {
      frames,
      metadata: {
        provider: "KartaView",
        attribution: "Imagery © KartaView contributors (CC BY-SA)",
        anchorsRequested: anchors.length,
        framesFound: frames.length,
        coverage: anchors.length > 0 ? Math.round((frames.length / anchors.length) * 100) : 0,
        queriedAt: new Date().toISOString(),
      },
    };

    cache.set(key, { at: Date.now(), value });
    return NextResponse.json({ ok: true, ...value, cached: false });
  } catch (error) {
    console.error("Unexpected street view failure", error);
    return NextResponse.json(
      { ok: false, error: "streetview_unavailable", message: "Street-level imagery is unavailable." },
      { status: 502 },
    );
  }
}
