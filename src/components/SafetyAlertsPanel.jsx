"use client";

import { WarningCircle, Warning, MapPin, Clock } from "@phosphor-icons/react";

export default function SafetyAlertsPanel({ incidents = [], location, destination }) {
  if (incidents.length === 0) {
    return null;
  }

  const nearbyIncidents = incidents.slice(0, 2);

  return (
    <aside className="safety-alerts-panel" aria-label="Route safety information">
      <div className="safety-alerts-header">
        <WarningCircle size={18} weight="fill" aria-hidden="true" />
        <strong>Route context</strong>
      </div>

      <div className="incidents-list">
        {nearbyIncidents.map((incident, index) => (
          <div key={`${incident.type}-${index}`} className="incident-item">
            <div className={`incident-icon incident-${incident.type}`} aria-hidden="true">
              {incident.type === "violent_crime" ? (
                <Warning size={14} weight="fill" />
              ) : (
                <MapPin size={14} weight="fill" />
              )}
            </div>
            <div className="incident-content">
              <span className="incident-type">{incident.label}</span>
              {incident.daysAgo !== null && (
                <span className="incident-age">
                  <Clock size={11} weight="fill" aria-hidden="true" />
                  {incident.daysAgo === 0 ? "Today" : `${incident.daysAgo}d ago`}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="safety-disclaimer">
        These are objective environmental factors. Personal safety depends on awareness and
        preparation.
      </p>
    </aside>
  );
}
