import {
  ArrowRight,
  Bus,
  Check,
  Clock,
  Footprints,
  LightbulbFilament,
  ShieldCheck,
  WarningOctagon,
} from "@phosphor-icons/react";
import { formatMinutes, formatMinutesDelta } from "../logic/duration.js";

function routeCondition(route) {
  return route.conditionScore ?? Math.max(0, 100 - route.riskScore);
}

export default function RouteCard({ route, selected, onSelect, danger }) {
  const condition = routeCondition(route);
  const transitSummary = route.mode === "transit"
    ? [
        route.waitMinutes > 0 ? `${formatMinutes(route.waitMinutes)} wait` : null,
        ...(route.legs
        ?.map((leg) => {
          const type = String(leg.type || leg.mode).toLowerCase();
          if (type === "transit" || type === "bus") {
            return leg.routeShortName || "Bus";
          }
          if (type === "wait") return `${formatMinutes(leg.durationMinutes)} wait`;
          return `${formatMinutes(leg.durationMinutes)} walk`;
        })
        .filter(Boolean) || []),
      ].filter(Boolean).join(" · ")
    : null;

  return (
    <button
      type="button"
      role="listitem"
      className={`route-card${selected ? " selected" : ""}`}
      aria-pressed={selected}
      aria-label={`${route.recommended ? "Recommended route, " : ""}${route.label}, ${formatMinutes(route.durationMinutes, { long: true })}, route conditions ${condition} out of 100`}
      onClick={() => onSelect(route)}
    >
      <span className="route-card-accent" aria-hidden="true" />
      <span className="route-card-head">
        <span className="route-title-wrap">
          <span className="route-mode-icon">
            {route.mode === "transit" || route.transitLegs ? (
              <Bus size={17} weight="fill" aria-hidden="true" />
            ) : (
              <Footprints size={17} weight="fill" aria-hidden="true" />
            )}
          </span>
          <span>
            <span className="route-label-row">
              <strong className="route-label">{route.label}</strong>
              {route.recommended && <span className="recommended-chip">Recommended</span>}
            </span>
            <span className="route-summary">{transitSummary || route.summary}</span>
          </span>
        </span>
        <span className="route-select-icon" aria-hidden="true">
          {selected ? <Check size={15} weight="bold" /> : <ArrowRight size={15} weight="bold" />}
        </span>
      </span>

      <span className="route-card-metrics">
        <span>
          <Clock size={15} weight="bold" aria-hidden="true" />
          <strong>{formatMinutes(route.durationMinutes)}</strong>
          {route.timeDeltaMinutes > 0 && (
            <small>{formatMinutesDelta(route.timeDeltaMinutes)}</small>
          )}
        </span>
        <span>
          <ShieldCheck size={15} weight="fill" aria-hidden="true" />
          <strong>{condition}</strong>
          <small>conditions</small>
        </span>
        <span>
          <LightbulbFilament size={15} weight="fill" aria-hidden="true" />
          <strong>{route.distanceKm} km</strong>
        </span>
      </span>

      {danger && (
        <span className={`route-danger route-danger-${danger.level}`}>
          {danger.level === "clear" ? (
            <ShieldCheck size={13} weight="fill" aria-hidden="true" />
          ) : (
            <WarningOctagon size={13} weight="fill" aria-hidden="true" />
          )}
          {danger.text}
        </span>
      )}

    </button>
  );
}
