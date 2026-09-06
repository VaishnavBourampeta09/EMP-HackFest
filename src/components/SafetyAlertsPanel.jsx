"use client";

import {
  Clock,
  Info,
  Lightbulb,
  MapPin,
  ShieldCheck,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";

const CATEGORY_ICON = {
  violent_crime: Warning,
  collision: WarningCircle,
};

function ageLabel(days) {
  if (!Number.isFinite(days)) return null;
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

const WARNING_ICON = {
  high: Warning,
  medium: WarningCircle,
  info: Info,
  clear: ShieldCheck,
};

/**
 * Route context for the selected route: the reports that are actually near it,
 * the measured lighting along it, and the plain-language warnings derived from
 * both. Every value here comes from the /api/plan response.
 */
export default function SafetyAlertsPanel({
  incidents = [],
  warnings = [],
  lighting = null,
  summary = null,
}) {
  // The danger box already carries the single most serious report, so this list
  // answers a different question: what is physically closest to the path.
  const topIncidents = [...incidents]
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
    .slice(0, 4);
  const hasAnything =
    topIncidents.length > 0 || warnings.length > 0 || Boolean(lighting?.available);
  if (!hasAnything) return null;

  return (
    <aside className="safety-alerts-panel" aria-label="Route context">
      <div className="safety-alerts-header">
        <WarningCircle size={17} weight="fill" aria-hidden="true" />
        <strong>Route context</strong>
        {summary?.total > 0 && (
          <span className="safety-alerts-count">
            {summary.total} nearby · {summary.lastWeek} this week
          </span>
        )}
      </div>

      {lighting?.available && (
        <div className={"lighting-stat lighting-mixed"}>
          <Lightbulb size={16} weight="fill" aria-hidden="true" />
          <div className="lighting-stat-body">
            <div className="lighting-stat-top">
              <strong>Lighting</strong>
              <span>{lighting.unlitPercent}% unlit (known coverage)</span>
            </div>
            <div
              className="lighting-bar"
              role="img"
              aria-label={`${lighting.unlitPercent} percent of known lighting samples are unlit`}
            >
              <i style={{ width: `${100 - lighting.unlitPercent}%` }} />
            </div>
            <span className="lighting-stat-detail">
              Based on mapped road and path lighting tags
            </span>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="route-warnings">
          {warnings.map((warning) => {
            const Icon = WARNING_ICON[warning.level] ?? Info;
            return (
              <li key={warning.id} className={`route-warning route-warning-${warning.level}`}>
                <Icon size={15} weight="fill" aria-hidden="true" />
                <div>
                  <strong>{warning.title}</strong>
                  <span>{warning.detail}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {topIncidents.length > 0 && (
        <>
          <p className="safety-alerts-subhead">Reports closest to this route</p>
          <ul className="incidents-list">
            {topIncidents.map((incident) => {
              const Icon = CATEGORY_ICON[incident.category] ?? MapPin;
              const age = ageLabel(incident.recencyDays);
              return (
                <li key={incident.id} className="incident-item">
                  <span
                    className={`incident-icon incident-${incident.category}`}
                    aria-hidden="true"
                  >
                    <Icon size={13} weight="fill" />
                  </span>
                  <div className="incident-content">
                    <span className="incident-type">
                      {incident.categoryLabel || incident.description || "Reported incident"}
                    </span>
                    <span className="incident-where">
                      {incident.generalizedLocation || "Near this route"}
                      {Number.isFinite(incident.distanceMeters)
                        ? ` · ${incident.distanceMeters} m away`
                        : ""}
                    </span>
                  </div>
                  {age && (
                    <span className="incident-age">
                      <Clock size={11} weight="fill" aria-hidden="true" />
                      {age}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="safety-disclaimer">
        Reports are objective environmental context from the City of Redmond feed
        and OpenStreetMap lighting, not a prediction about any person or place.
      </p>
    </aside>
  );
}
