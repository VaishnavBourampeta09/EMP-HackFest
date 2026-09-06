"use client";

import { useEffect, useState } from "react";
import { formatMinutes } from '../logic/DURATION.JS';
import {
  CheckCircle,
  Copy,
  MapPin,
  Phone,
  ShieldCheck,
  Siren,
  X,
} from "@phosphor-icons/react";

function formatCoords(location) {
  if (!Array.isArray(location) || location.length < 2) return null;
  return `${Number(location[0]).toFixed(5)}, ${Number(location[1]).toFixed(5)}`;
}

/**
 * Geocoders return the full postal chain ("Downtown Redmond, Northeast 76th
 * Street, …, United States"). Only the leading parts identify the place.
 */
function shortPlace(name) {
  if (!name) return null;
  return name.split(",").slice(0, 2).join(",").trim();
}

function elapsedLabel(since) {
  const seconds = Math.max(0, Math.round((Date.now() - since) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${seconds % 60}s ago`;
}

/**
 * The teen-facing result of pressing "Need help". Raising the alert silently
 * was the old behaviour and gave no feedback at all, so this sheet confirms
 * exactly what was sent, to whom, and what the rider can do next.
 */
export default function SosSheet({ sos, guardian, safePlaces = [], onClear }) {
  const [, forceTick] = useState(0);
  const [copied, setCopied] = useState(false);

  const active = sos?.status === "active";

  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!copied) return undefined;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  if (!active) return null;

  const coords = formatCoords(sos.location);
  const guardianPhone = guardian?.phone ?? "";
  const nearest = safePlaces[0];

  const copyLocation = async () => {
    if (!coords) return;
    try {
      await navigator.clipboard.writeText(coords);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="sheet-backdrop sos-backdrop" role="presentation">
      <section
        className="sheet sos-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sos-title"
      >
        <span className="sheet-handle" aria-hidden="true" />

        <header className="sos-header">
          <span className="sos-icon" aria-hidden="true">
            <Siren size={26} weight="fill" />
          </span>
          <div>
            <p className="sheet-kicker">Help requested · {elapsedLabel(sos.raisedAt)}</p>
            <h2 id="sos-title">
              {guardian?.name ? `${guardian.name} has been alerted` : "Your guardian has been alerted"}
            </h2>
          </div>
        </header>

        <p className="sos-lede">
          Sentinel sent your live location, your selected route, and your expected
          arrival. Keep this open — your guardian can see it update.
        </p>

        <dl className="sos-facts">
          <div>
            <dt>Location shared</dt>
            <dd>{coords ?? "Waiting for a fix"}</dd>
          </div>
          <div>
            <dt>Heading to</dt>
            <dd>{shortPlace(sos.destination) ?? "Selected destination"}</dd>
          </div>
          <div>
            <dt>Expected arrival</dt>
            <dd>
              {Number.isFinite(sos.etaMinutes) ? formatMinutes(sos.etaMinutes) : "Recalculating"}
            </dd>
          </div>
        </dl>

        {nearest && (
          <div className="sos-nearest">
            <MapPin size={18} weight="fill" aria-hidden="true" />
            <div>
              <strong>Nearest safe place: {nearest.name}</strong>
              <span>About {nearest.distanceMeters} m away</span>
            </div>
          </div>
        )}

        <div className="sos-actions">
          <a className="button button-danger button-large" href="tel:911">
            <Phone size={18} weight="fill" aria-hidden="true" />
            Call 911
          </a>
          {guardianPhone ? (
            <a
              className="button button-soft button-large"
              href={`tel:${guardianPhone.replace(/[^\d+]/g, "")}`}
            >
              <Phone size={18} weight="bold" aria-hidden="true" />
              Call {guardian?.name ?? "guardian"}
            </a>
          ) : null}
          <button
            type="button"
            className="button button-soft button-large"
            onClick={copyLocation}
            disabled={!coords}
          >
            {copied ? (
              <>
                <CheckCircle size={18} weight="fill" aria-hidden="true" />
                Copied
              </>
            ) : (
              <>
                <Copy size={18} weight="bold" aria-hidden="true" />
                Copy location
              </>
            )}
          </button>
        </div>

        <button
          type="button"
          className="button button-outline button-block sos-standdown"
          onClick={() => onClear("Teen marked themselves safe.")}
        >
          <ShieldCheck size={18} weight="fill" aria-hidden="true" />
          I&rsquo;m safe now — stand down
        </button>

        <button
          type="button"
          className="sheet-close sos-close"
          onClick={() => onClear("Teen dismissed the help request.")}
          aria-label="Dismiss the help request"
        >
          <X size={17} weight="bold" aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}
