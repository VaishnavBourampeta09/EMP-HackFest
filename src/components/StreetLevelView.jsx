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
  ShieldCheck,
  Spinner,
  WarningOctagon,
} from "@phosphor-icons/react";
import { haversineMeters } from "../logic/geo.js";

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** How close a past report must be to count as "at this spot". */
const HAZARD_RADIUS_M = 120;

const SEVERE = new Set(["violent_crime", "collision"]);

function bearingLabel(heading) {
  if (!Number.isFinite(heading)) return null;
  return COMPASS[Math.round((((heading % 360) + 360) % 360) / 45) % 8];
}

function shotYear(shotDate) {
  if (!shotDate) return null;
  const year = String(shotDate).slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

function whenLabel(days) {
  if (!Number.isFinite(days)) return "recently";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
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
 * the route. During a live trip the view follows the traveller; otherwise it
 * plays through the corridor so a rider can preview the walk before setting off.
 *
 * Past incident reports are matched to each frame, so the imagery answers
 * "what happened here?" and not just "what does this block look like?".
 */
export default function StreetLevelView({
  points = [],
  position = null,
  incidents = [],
  title = "Street-level view",
  subtitle,
  autoPlay = true,
  height = 260,
  fill = false,
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

  /** Past reports attached to each frame, so the rail can mark hazard spots. */
  const hazardsByFrame = useMemo(() => {
    if (usable.length === 0 || incidents.length === 0) return [];
    return usable.map((frame) =>
      incidents
        .filter(
          (incident) =>
            Number.isFinite(incident?.lat) &&
            Number.isFinite(incident?.lng) &&
            haversineMeters([frame.lat, frame.lng], [incident.lat, incident.lng]) <=
              HAZARD_RADIUS_M,
        )
        .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0))
        .slice(0, 4),
    );
  }, [usable, incidents]);

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
    }, 2200);
    return () => window.clearInterval(id);
  }, [followIndex, playing, usable.length]);

  const safeIndex = usable.length > 0 ? Math.min(index, usable.length - 1) : 0;
  const frame = usable[safeIndex] ?? null;
  const anchor = frame ? [frame.lat, frame.lng] : (points[0] ?? null);
  const externalUrl = googleStreetViewUrl(anchor, frame?.heading);
  const isFollowing = followIndex !== null;
  const hazards = hazardsByFrame[safeIndex] ?? [];
  const worst = hazards[0] ?? null;
  const totalHazardSpots = hazardsByFrame.filter((list) => list.length > 0).length;

  const goTo = (next) => {
    setPlaying(false);
    setIndex(((next % usable.length) + usable.length) % usable.length);
  };

  return (
    <section
      className={`street-view${fill ? " street-view-fill" : ""}`}
      aria-label={title}
    >
      <header className="street-view-head">
        <span className="street-view-icon" aria-hidden="true">
          <Eye size={16} weight="fill" />
        </span>
        <div className="street-view-titles">
          <strong>{title}</strong>
          <span>
            {subtitle ??
              (isFollowing
                ? "Following the live position"
                : "Playing through the route")}
          </span>
        </div>

        {totalHazardSpots > 0 && (
          <span className="street-view-hazard-count">
            <WarningOctagon size={13} weight="fill" aria-hidden="true" />
            {totalHazardSpots} hazard spot{totalHazardSpots === 1 ? "" : "s"}
          </span>
        )}

        {!isFollowing && usable.length > 1 && (
          <button
            type="button"
            className="street-view-play"
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? "Pause the walk-through" : "Play the walk-through"}
          >
            {playing ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
          </button>
        )}
      </header>

      <div className="street-view-stage" style={fill ? undefined : { height }}>
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
                setLoadedIds((current) => new Set(current).add(frame.id))
              }
              onError={() =>
                setFailedIds((current) => new Set(current).add(frame.id))
              }
            />

            {!loadedIds.has(frame.id) && (
              <div className="street-view-loading" role="status">
                <Spinner size={18} weight="bold" className="spin" aria-hidden="true" />
                <span>Loading this block…</span>
              </div>
            )}

            <div className="street-view-badges">
              {bearingLabel(frame.heading) && (
                <span className="street-view-badge">
                  <Compass size={12} weight="bold" aria-hidden="true" />
                  {bearingLabel(frame.heading)}
                </span>
              )}
              {shotYear(frame.shotDate) && (
                <span className="street-view-badge street-view-badge-muted">
                  {shotYear(frame.shotDate)}
                </span>
              )}
            </div>

            {/* What was reported at this exact spot. */}
            {worst ? (
              <div
                className={`street-view-hazard${SEVERE.has(worst.category) ? " street-view-hazard-severe" : ""}`}
                role="status"
              >
                <WarningOctagon size={16} weight="fill" aria-hidden="true" />
                <div>
                  <strong>
                    {worst.categoryLabel || worst.description || "Reported incident"}
                    {hazards.length > 1 ? ` +${hazards.length - 1} more` : ""}
                  </strong>
                  <span>
                    {worst.generalizedLocation || "Near this spot"} ·{" "}
                    {whenLabel(worst.recencyDays)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="street-view-hazard street-view-hazard-clear" role="status">
                <ShieldCheck size={16} weight="fill" aria-hidden="true" />
                <div>
                  <strong>No reports at this spot</strong>
                </div>
              </div>
            )}

            {usable.length > 1 && (
              <div className="street-view-nav">
                <button
                  type="button"
                  onClick={() => goTo(safeIndex - 1)}
                  aria-label="Previous point along the route"
                >
                  <CaretLeft size={14} weight="bold" aria-hidden="true" />
                </button>
                <span aria-live="polite">
                  {safeIndex + 1}/{usable.length}
                </span>
                <button
                  type="button"
                  onClick={() => goTo(safeIndex + 1)}
                  aria-label="Next point along the route"
                >
                  <CaretRight size={14} weight="bold" aria-hidden="true" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Hazard rail: every sampled point along the route, flagged where a past
          report sits nearby. Doubles as the scrubber. */}
      {usable.length > 1 && (
        <div
          className="street-view-rail"
          role="group"
          aria-label="Points along the route, marked where incidents were reported"
        >
          {usable.map((item, i) => {
            const list = hazardsByFrame[i] ?? [];
            const severe = list.some((h) => SEVERE.has(h.category));
            const tone = list.length === 0 ? "clear" : severe ? "severe" : "warn";
            return (
              <button
                key={item.id}
                type="button"
                className={`street-view-tick street-view-tick-${tone}${i === safeIndex ? " is-current" : ""}`}
                onClick={() => goTo(i)}
                aria-label={
                  list.length === 0
                    ? `Point ${i + 1}: no reports nearby`
                    : `Point ${i + 1}: ${list.length} report${list.length === 1 ? "" : "s"} nearby`
                }
                aria-current={i === safeIndex ? "true" : undefined}
              />
            );
          })}
        </div>
      )}

      <footer className="street-view-foot">
        <span>{metadata?.attribution ?? "Imagery © KartaView contributors"}</span>
        {externalUrl && (
          <a href={externalUrl} target="_blank" rel="noreferrer">
            Street View
            <ArrowSquareOut size={12} weight="bold" aria-hidden="true" />
          </a>
        )}
      </footer>
    </section>
  );
}
