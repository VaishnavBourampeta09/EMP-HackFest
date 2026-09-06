import {
  ArrowRight,
  Bus,
  Check,
  Clock,
  ShieldCheck,
  WarningOctagon,
} from "@phosphor-icons/react";
import { formatMinutes } from "../logic/duration.js";

function routeCondition(route) {
  return route.safetyScore?.toFixed(1) ?? "—";
}

export default function RouteCard({ route, selected, onSelect, danger }) {
  const condition = routeCondition(route);
  const transitLegs = (route.legs || []).filter((leg) => {
    const mode = String(leg.type || leg.mode || "").toLowerCase();
    return mode === "transit" || mode === "bus";
  });
  return (
    <button
      type="button"
      role="listitem"
      className={`route-card${selected ? " selected" : ""}`}
      aria-pressed={selected}
      aria-label={`${route.recommended ? "Recommended route, " : ""}${formatMinutes(route.durationMinutes, { long: true })}, safety score ${condition} out of 10`}
      onClick={() => onSelect(route)}
    >
      <span className="route-card-accent" aria-hidden="true" />
      <span className="route-card-head">
        <span className="route-title-wrap">
          {route.recommended && (
            <span className="recommended-chip">Recommended</span>
          )}
        </span>
      </span>

      <span className="route-card-metrics">
        <span className="route-score-metric">
          <strong>{condition}/10</strong>
          <small>Safety Score</small>
        </span>
        <span className="route-time-metric">
          <strong>{formatMinutes(route.durationMinutes)}</strong>
          <small>Travel time</small>
        </span>
        {route.safetyMode === "night" && (
          <span className="route-lighting-metric">
            <strong>
              {route.lightingDataAvailable ? `${route.unlitPercent}%` : "—"}
            </strong>
            <small>
              {route.lightingDataAvailable ? "Unlit" : "Lighting data limited"}
            </small>
          </span>
        )}
      </span>

      {transitLegs.length > 0 && (
        <span className="route-transit-details">
          <Bus size={14} weight="bold" aria-hidden="true" />
          <span>
            {transitLegs
              .map(
                (leg) =>
                  `${leg.routeShortName || leg.routeLongName || "Bus"}${
                    leg.headsign ? ` toward ${leg.headsign}` : ""
                  }`,
              )
              .join(" · ")}
          </span>
        </span>
      )}

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
