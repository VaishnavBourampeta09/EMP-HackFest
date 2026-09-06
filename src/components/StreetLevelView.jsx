"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowSquareOut,
  CaretLeft,
  CaretRight,
  Compass,
  Eye,
  Pause,
  Play,
  Spinner,
} from "@phosphor-icons/react";
import { haversineMeters } from "../logic/geo.js";

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function bearingLabel(heading) {
  if (!Number.isFinite(heading)) return null;
  return COMPASS[Math.round(((heading % 360) + 360) % 360 / 45) % 8];
}

function shotYear(shotDate) {
  if (!shotDate) return null;
  const year = String(shotDate).slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

function googleStreetViewUrl(point, heading) {
  if (!Array.isArray(point)) return null;
  const url = new URL("https://www.google.com/maps/@");
  url.searchParams.set("api", "1");
  url.searchParams.set("map_action", "pano");
  url.searchParams.set("viewpoint", `${point[0]},${point[1]}`);
  if (Number.isFinite(heading)) url.searchParams.set("heading", String(Math.round(heading)));
  return url.toString();
}

/**
 * A street-level walk-through of the route corridor.
 *
 * Frames come from KartaView's open imagery archive (no API key), sampled along
 * the route. When a trip is live the view follows the traveller's position; when
 * it is not, it plays through the corridor so a rider can preview what the walk
 * actually looks like before they set off.
 */
export default function StreetLevelView({
  points = [],
  position = null,
  title = "Street-level view",
  subtitle,
  autoPlay = true,
  height = 260,
}) {
  const [frames, setFrames] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [status, setStatus] = useState("idle");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [failedIds, setFailedIds] = useState(() => new Set());
  // Frames are ~600 KB, so track which have painted to avoid flashing an empty
  // stage between the element mounting and the photo arriving.
  const [loadedIds, setLoadedIds] = useState(() => new Set());
  const requestRef = useRef(null);

  // Only refetch when the route itself changes, not on every position tick.
  const routeKey = useMemo(() => {
    if (points.length < 2) return null;
    const first = points[0];
    const last = points[points.length - 1];
    return [points.length, ...first, ...last].map((n) => Number(n).toFixed(4)).join(":");
  }, [points]);

  useEffect(() => {
    if (!routeKey || points.length < 2) {
      setFrames([]);
      setStatus("idle");
      return undefined;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus("loading");

    fetch("/api/streetview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ points }),
    })
      .then((response) => response.json())
      .then((payload) => {
        if (controller.signal.aborted) return;
        if (!payload?.ok) throw new Error(payload?.message || "No imagery");
        setFrames(payload.frames || []);
        setMetadata(payload.metadata || null);
        setStatus((payload.frames || []).length > 0 ? "ready" : "empty");
        setIndex(0);
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setFrames([]);
        setStatus("empty");
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  const usable = useMemo(
    () => frames.filter((frame) => !failedIds.has(frame.id)),
    [frames, failedIds],
  );

  // While a trip is live the corridor follows the traveller instead of playing.
  const followIndex = useMemo(() => {
    if (!Array.isArray(position) || usable.length === 0) return null;
    let best = 0;
    let bestDistance = Infinity;
    usable.forEach((frame, i) => {
      const distance = haversineMeters(position, [frame.lat, frame.lng]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    return best;
  }, [position, usable]);

  useEffect(() => {
    if (followIndex !== null) setIndex(followIndex);
  }, [followIndex]);

  useEffect(() => {
    if (followIndex !== null || !playing || usable.length < 2) return undefined;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % usable.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, [followIndex, playing, usable.length]);

  const safeIndex = usable.length > 0 ? Math.min(index, usable.length - 1) : 0;
  const frame = usable[safeIndex] ?? null;
  const anchor = frame ? [frame.lat, frame.lng] : points[0] ?? null;
  const externalUrl = googleStreetViewUrl(anchor, frame?.heading);
  const isFollowing = followIndex !== null;

  return (
    <section className="street-view" aria-label={title}>
      <header className="street-view-head">
        <span className="street-view-icon" aria-hidden="true">
          <Eye size={17} weight="fill" />
        </span>
        <div className="street-view-titles">
          <strong>{title}</strong>
          <span>
            {subtitle ??
              (isFollowing
                ? "Following the live position along the route"
                : "Playing through the route corridor")}
          </span>
        </div>

        {!isFollowing && usable.length > 1 && (
          <button
            type="button"
            className="street-view-play"
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? "Pause the corridor walk-through" : "Play the corridor walk-through"}
          >
            {playing ? <Pause size={15} weight="fill" /> : <Play size={15} weight="fill" />}
          </button>
        )}
      </header>

      <div className="street-view-stage" style={{ height }}>
        {status === "loading" && (
          <div className="street-view-state" role="status">
            <Spinner size={20} weight="bold" className="spin" aria-hidden="true" />
            <span>Looking for street-level imagery…</span>
          </div>
        )}

        {status !== "loading" && !frame && (
          <div className="street-view-state">
            <Compass size={22} weight="regular" aria-hidden="true" />
            <span>No open street imagery covers this route yet.</span>
            {externalUrl && (
              <a
                className="street-view-external"
                href={externalUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Google Street View
                <ArrowSquareOut size={14} weight="bold" aria-hidden="true" />
              </a>
            )}
          </div>
        )}

        {frame && (
          <>
            <img
              key={frame.id}
              className="street-view-image"
              src={frame.imageUrl}
              alt={`Street-level view along the route, facing ${bearingLabel(frame.heading) ?? "ahead"}`}
              // Only the current frame is mounted, so it must load immediately;
              // no-referrer avoids the archive's hotlink protection.
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={() =>
                setLoadedIds((current) => {
                  const next = new Set(current);
                  next.add(frame.id);
                  return next;
                })
              }
              onError={() =>
                setFailedIds((current) => {
                  const next = new Set(current);
                  next.add(frame.id);
                  return next;
                })
              }
            />

            {!loadedIds.has(frame.id) && (
              <div className="street-view-loading" role="status">
                <Spinner size={18} weight="bold" className="spin" aria-hidden="true" />
                <span>Loading the view along this block…</span>
              </div>
            )}

            <div className="street-view-badges">
              {bearingLabel(frame.heading) && (
                <span className="street-view-badge">
                  <Compass size={13} weight="bold" aria-hidden="true" />
                  Facing {bearingLabel(frame.heading)}
                </span>
              )}
              {shotYear(frame.shotDate) && (
                <span className="street-view-badge street-view-badge-muted">
                  Imagery {shotYear(frame.shotDate)}
                </span>
              )}
            </div>

            {!isFollowing && usable.length > 1 && (
              <div className="street-view-nav">
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setIndex((current) => (current - 1 + usable.length) % usable.length);
                  }}
                  aria-label="Previous point along the route"
                >
                  <CaretLeft size={15} weight="bold" aria-hidden="true" />
                </button>
                <span aria-live="polite">
                  {safeIndex + 1} / {usable.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setIndex((current) => (current + 1) % usable.length);
                  }}
                  aria-label="Next point along the route"
                >
                  <CaretRight size={15} weight="bold" aria-hidden="true" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <footer className="street-view-foot">
        <span>
          {frame
            ? metadata?.attribution ?? "Imagery © KartaView contributors"
            : "Street-level imagery is community contributed and may be out of date."}
        </span>
        {frame && externalUrl && (
          <a href={externalUrl} target="_blank" rel="noreferrer">
            Google Street View
            <ArrowSquareOut size={13} weight="bold" aria-hidden="true" />
          </a>
        )}
      </footer>
    </section>
  );
}
