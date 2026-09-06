"use client";

import { MapPin, Clock, Footprints, Bus, ShieldCheck } from "@phosphor-icons/react";
import { shortPlaceName } from "../logic/safetyInsights.js";

export default function JourneySummaryCard({ trip, users }) {
  if (!trip) {
    return null;
  }

  const condition = trip.route?.conditionScore ?? Math.max(0, 100 - (trip.route?.riskScore ?? 0));
  const mode = trip.mode === "transit" ? "transit" : "walking";
  const ModeIcon = mode === "transit" ? Bus : Footprints;

  return (
    <div className="journey-summary-card">
      <div className="journey-header">
        <h2>
          {users.teen.name}'s Journey
        </h2>
        <span className={`journey-status journey-status-${trip.status}`}>
          {trip.status === "completed" ? "Arrived" : trip.status === "active" ? "In Progress" : trip.status === "alert" ? "Alert" : "Planning"}
        </span>
      </div>

      <div className="journey-route">
        <div className="route-leg">
          <div className="route-marker route-marker-start">
            <MapPin size={16} weight="fill" />
          </div>
          <div className="route-info">
            <span className="route-label">From</span>
            <strong title={trip.origin?.name}>
              {shortPlaceName(trip.origin?.name) || "Starting point"}
            </strong>
          </div>
        </div>

        <div className="route-connector" aria-hidden="true" />

        <div className="route-leg">
          <div className="route-marker route-marker-end">
            <MapPin size={16} weight="fill" />
          </div>
          <div className="route-info">
            <span className="route-label">To</span>
            <strong title={trip.destination?.name}>
              {shortPlaceName(trip.destination?.name) || "Destination"}
            </strong>
          </div>
        </div>
      </div>

      <div className="journey-metrics">
        <div className="metric">
          <ModeIcon size={18} weight="fill" aria-hidden="true" />
          <div>
            <span>Mode</span>
            <strong>{mode === "transit" ? "Transit" : "Walking"}</strong>
          </div>
        </div>

        <div className="metric">
          <Clock size={18} weight="fill" aria-hidden="true" />
          <div>
            <span>ETA</span>
            <strong>{trip.etaMinutes} min</strong>
          </div>
        </div>

        <div className="metric">
          <ShieldCheck size={18} weight="fill" aria-hidden="true" />
          <div>
            <span>Route conditions</span>
            <strong>{condition}/100</strong>
          </div>
        </div>
      </div>

      {trip.route?.label && (
        <div className="journey-route-label">
          <span>Selected route:</span>
          <strong>{trip.route.label}</strong>
        </div>
      )}
    </div>
  );
}
