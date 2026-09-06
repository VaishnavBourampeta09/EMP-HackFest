"use client";

import { shortPlaceName } from "../logic/safetyInsights.js";
import { formatMinutes } from "../logic/duration.js";

const STATUS_LABEL = {
  completed: "Arrived",
  active: "In progress",
  alert: "Alert",
};

export default function JourneySummaryCard({ trip, users }) {
  if (!trip) return null;

  const condition = trip.route?.safetyScore?.toFixed(1) ?? "—";

  return (
    <section className="journey-summary-card" aria-label="Trip summary">
      <div className="journey-route-full-width">
        <div className="journey-location">
          <span className="journey-location-label">From</span>
          <span className="journey-location-name" title={trip.origin?.name}>
            {shortPlaceName(trip.origin?.name) || "Starting point"}
          </span>
        </div>
        <span className="journey-arrow">→</span>
        <div className="journey-location">
          <span className="journey-location-label">To</span>
          <span
            className="journey-location-name"
            title={trip.destination?.name}
          >
            {shortPlaceName(trip.destination?.name) || "Destination"}
          </span>
        </div>
      </div>

      <dl className="journey-metrics">
        <div className="metric">
          <dt>ETA</dt>
          <dd>{formatMinutes(trip.etaMinutes)}</dd>
        </div>
        <div className="metric">
          <dt>Safety</dt>
          <dd>{condition}/10</dd>
        </div>
      </dl>
    </section>
  );
}
