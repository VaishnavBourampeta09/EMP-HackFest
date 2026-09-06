"use client";

import { CaretRight } from "@phosphor-icons/react";

const CATEGORY_LABEL = {
  violent_crime: "Personal-safety incident",
  property_crime: "Property crime",
  collision: "Traffic collision",
  low_light: "Lighting gap",
  user_reported: "Community report",
};

function whenLabel(days) {
  if (!Number.isFinite(days)) return "Recently";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

function distanceLabel(meters) {
  if (!Number.isFinite(meters)) return null;
  if (meters < 1000) return `${meters} m from your route`;
  return `${(meters / 1000).toFixed(1)} km from your route`;
}

/**
 * The single most relevant recent incident on this route, stated plainly:
 * what happened, how close it is, and when. This is deliberately the loudest
 * element on the planning screen — it is the reason the product exists.
 */
export default function DangerBox({
  incident,
  totalNearby = 0,
  seriousNearby = 0,
  onShowOnMap,
  compact = false,
}) {
  if (!incident) {
    return (
      <section className="danger-box danger-box-clear" aria-label="Nearby incident summary">
        <div className="danger-box-body">
          <strong>No recent incidents mapped near this route</strong>
          <p>
            Sentinel checked the City of Redmond crime feed along your path and
            found nothing recent within 400 m.
          </p>
        </div>
      </section>
    );
  }

  const severe = incident.category === "violent_crime" || (incident.severity ?? 0) >= 4;
  const label =
    incident.categoryLabel ||
    CATEGORY_LABEL[incident.category] ||
    incident.incidentType ||
    "Reported incident";

  return (
    <section
      className={`danger-box${severe ? " danger-box-severe" : ""}${compact ? " danger-box-compact" : ""}`}
      aria-label="Closest recent incident on this route"
    >
      <div className="danger-box-head">
        <p className="danger-box-kicker">Recent incident</p>
        <strong className="danger-box-title">
          {label} {whenLabel(incident.recencyDays)}
        </strong>
      </div>

      <div className="danger-box-details">
        <p className="danger-box-location">
          {incident.generalizedLocation || "Near your route"}
        </p>
        <p className="danger-box-distance">
          {distanceLabel(incident.distanceMeters) ?? "Along your route"}
        </p>
      </div>

      {typeof onShowOnMap === "function" && (
        <button type="button" className="danger-box-link" onClick={() => onShowOnMap(incident)}>
          View details
          <CaretRight size={14} weight="bold" aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
