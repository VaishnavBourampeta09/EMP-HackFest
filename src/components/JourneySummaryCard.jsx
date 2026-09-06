"use client";

import { Bus, Clock, Footprints, ShieldCheck } from "@phosphor-icons/react";
import { shortPlaceName } from "../logic/safetyInsights.js";
import { formatMinutes } from "../logic/duration.js";

const STATUS_LABEL = {
  completed: "Arrived",
  active: "In progress",
  alert: "Alert",
};

export default function JourneySummaryCard({ trip, users }) {
  if (!trip) return null;

  const condition =
    trip.route?.safetyScore?.toFixed(1) ?? '—';
  const mode = trip.mode === "transit" ? "transit" : "walking";
  const ModeIcon = mode === "transit" ? Bus : Footprints;

  return (
    <section className="journey-summary-card" aria-label="Trip summary">
      <header className="journey-header">
        <h2>{users.teen.name}&rsquo;s trip</h2>
        <span className={`journey-status journey-status-${trip.status}`}>
          {STATUS_LABEL[trip.status] ?? "Planning"}
        </span>
      </header>

      {/* One rail, two stops — the endpoints read top to bottom in one column
          instead of being scattered across a two-column grid. */}
      <ol className="journey-route">
        <li className="journey-stop">
          <span className="journey-dot" aria-hidden="true" />
          <span className="journey-stop-label">From</span>
          <span className="journey-stop-name" title={trip.origin?.name}>
            {shortPlaceName(trip.origin?.name) || "Starting point"}
          </span>
        </li>
        <li className="journey-stop journey-stop-end">
          <span className="journey-dot journey-dot-end" aria-hidden="true" />
          <span className="journey-stop-label">To</span>
          <span className="journey-stop-name" title={trip.destination?.name}>
            {shortPlaceName(trip.destination?.name) || "Destination"}
          </span>
        </li>
      </ol>

      <dl className="journey-metrics">
        <div className="metric">
          <ModeIcon size={16} weight="fill" aria-hidden="true" />
          <dt>{mode === "transit" ? "Transit" : "Walking"}</dt>
          <dd>{trip.route?.label ?? "Selected route"}</dd>
        </div>
        <div className="metric">
          <Clock size={16} weight="fill" aria-hidden="true" />
          <dt>ETA</dt>
          <dd>{formatMinutes(trip.etaMinutes)}</dd>
        </div>
        <div className="metric">
          <ShieldCheck size={16} weight="fill" aria-hidden="true" />
          <dt>Conditions</dt>
          <dd>{condition}/10</dd>
        </div>
      </dl>
    </section>
  );
}
