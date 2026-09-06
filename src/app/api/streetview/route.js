import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Street-level photography along a route, from KartaView (formerly
 * OpenStreetCam) — an open, keyless imagery archive.
 *
 * Sparse per-anchor lookups gave a dozen disconnected stills. Instead this
 * discovers which capture *sequences* cover the route and pulls their
 * consecutive frames, which sit roughly every 5–25 m. Ordering those by
 * progress along the route produces a continuous walk down the street rather
 * than a slideshow.
 */

const KARTAVIEW = "https://api.openstreetcam.org/2.0";
const UA = "Sentinel/0.1 (safety routing prototype)";
const DISCOVERY_ANCHORS = 10;
const DISCOVERY_RADIUS_M = 160;
const SEQUENCE_PAGE = 150;
// Sequences run to several hundred frames; one page covers only a fraction.
const SEQUENCE_PAGES = 4;
const CORRIDOR_M = 55;
const MAX_FRAMES = 160;
const CACHE_TTL_MS = 60 * 60 * 1000;

const cache = new Map();

const R = 6371000;
const rad = (value) => (value * Math.PI) / 180;

function haversine(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function isLatLng(point) {
  return (
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(Number(point[0])) &&
    Number.isFinite(Number(point[1]))
  );
}

/** Nearest route vertex plus its cumulative distance, used to order frames. */
function buildRouteIndex(points) {
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(cumulative[i - 1] + haversine(points[i - 1], points[i]));
  }
  return cumulative;
}

/**
 * Perpendicular distance to the route *line* and how far along it the nearest
 * point sits. Measuring to vertices instead would miss frames that fall between
 * two widely spaced route points.
 */
function projectOntoRoute(point, points, cumulative) {
  let offRoute = Infinity;
  let along = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];

    // Local flat-earth projection is plenty accurate over a segment.
    const scale = Math.cos(rad(a[0]));
    const ax = 0;
    const ay = 0;
    const bx = (b[1] - a[1]) * scale;
    const by = b[0] - a[0];
    const px = (point[1] - a[1]) * scale;
    const py = point[0] - a[0];

    const segLenSq = bx * bx + by * by;
    const t = segLenSq === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / segLenSq));
    const projLat = a[0] + t * (b[0] - a[0]);
    const projLng = a[1] + t * (b[1] - a[1]);
    const distance = haversine(point, [projLat, projLng]);

    if (distance < offRoute) {
      offRoute = distance;
      const segmentLength = cumulative[i + 1] - cumulative[i];
      along = cumulative[i] + t * segmentLength;
    }
  }

  return { offRoute, along };
}

async function getJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function toFrame(row) {
  const template = String(row?.fileurl || "");
  if (!template.includes("{{sizeprefix}}")) return null;
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: String(row.id),
    lat,
    lng,
    heading: Number(row.heading),
    shotDate: row.shotDate ?? row.dateAdded ?? null,
    imageUrl: template.replace("{{sizeprefix}}", "lth"),
    thumbUrl: template.replace("{{sizeprefix}}", "th"),
    sequenceId: row.sequenceId ? String(row.sequenceId) : null,
    sequenceIndex: Number(row.sequenceIndex),
  };
}

/** One HEAD per sequence: frames in a sequence share a storage host. */
async function sequenceIsServable(frame) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(frame.imageUrl, {
      method: "HEAD",
      cache: "no-store",
      headers: { "User-Agent": UA },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request) {
  try {
    // A client that aborts mid-flight leaves an empty body, which would throw
    // out of request.json() and surface as a 502 with a stack trace.
    let body = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "invalid_request", message: "Request body was empty." },
        { status: 400 },
      );
    }

    const raw = Array.isArray(body?.points) ? body.points : [];
    const points = raw.filter(isLatLng).map((p) => [Number(p[0]), Number(p[1])]);

    if (points.length < 2) {
      return NextResponse.json(
        { ok: false, error: "invalid_request", message: "points must contain at least two [lat,lng] pairs." },
        { status: 400 },
      );
    }

    const first = points[0];
    const last = points[points.length - 1];
    const key = [points.length, ...first, ...last]
      .map((n) => Number(n).toFixed(4))
      .join(":");
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return NextResponse.json({ ok: true, ...hit.value, cached: true });
    }

    // 1. Discover which capture sequences run along this route.
    const step = (points.length - 1) / Math.max(1, DISCOVERY_ANCHORS - 1);
    const anchors = [];
    for (let i = 0; i < DISCOVERY_ANCHORS; i += 1) {
      anchors.push(points[Math.round(i * step)]);
    }

    const discovered = await Promise.all(
      anchors.map(async ([lat, lng]) => {
        const url = new URL(`${KARTAVIEW}/photo/`);
        url.searchParams.set("lat", String(lat));
        url.searchParams.set("lng", String(lng));
        url.searchParams.set("radius", String(DISCOVERY_RADIUS_M));
        url.searchParams.set("itemsPerPage", "5");
        const payload = await getJson(url);
        return (payload?.result?.data ?? [])
          .map((row) => row?.sequenceId)
          .filter(Boolean)
          .map(String);
      }),
    );

    const sequenceIds = [...new Set(discovered.flat())].slice(0, 8);

    // 2. Pull each sequence's consecutive frames. Sequences run to several
    //    hundred frames and the stretch covering this route can sit well past
    //    the first page, so walk a few pages.
    const cumulative = buildRouteIndex(points);
    const sequences = await Promise.all(
      sequenceIds.map(async (id) => {
        const collected = [];
        for (let page = 1; page <= SEQUENCE_PAGES; page += 1) {
          const url = new URL(`${KARTAVIEW}/sequence/${id}/photos`);
          url.searchParams.set("itemsPerPage", String(SEQUENCE_PAGE));
          url.searchParams.set("page", String(page));
          const payload = await getJson(url);
          const rows = payload?.result?.data ?? [];
          if (rows.length === 0) break;
          collected.push(...rows.map(toFrame).filter(Boolean));
          if (rows.length < SEQUENCE_PAGE) break;
        }
        return collected;
      }),
    );

    // 3. Keep frames inside the route corridor, ordered by progress along it.
    const candidates = [];
    for (const frames of sequences) {
      if (frames.length === 0) continue;
      const withinCorridor = frames
        .map((frame) => ({
          frame,
          ...projectOntoRoute([frame.lat, frame.lng], points, cumulative),
        }))
        .filter((entry) => entry.offRoute <= CORRIDOR_M);
      if (withinCorridor.length === 0) continue;

      // One reachability check per sequence rather than per frame.
      if (!(await sequenceIsServable(withinCorridor[0].frame))) continue;
      candidates.push(...withinCorridor);
    }

    candidates.sort((a, b) => a.along - b.along);

    // Collapse near-duplicates so playback advances rather than stalling.
    const frames = [];
    let lastAlong = -Infinity;
    const seen = new Set();
    for (const entry of candidates) {
      if (seen.has(entry.frame.id)) continue;
      if (entry.along - lastAlong < 8) continue;
      seen.add(entry.frame.id);
      frames.push({ ...entry.frame, alongMeters: Math.round(entry.along) });
      lastAlong = entry.along;
      if (frames.length >= MAX_FRAMES) break;
    }

    const value = {
      frames,
      metadata: {
        provider: "KartaView",
        attribution: "Imagery © KartaView contributors (CC BY-SA)",
        sequences: sequenceIds.length,
        framesFound: frames.length,
        routeMeters: Math.round(cumulative[cumulative.length - 1]),
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
