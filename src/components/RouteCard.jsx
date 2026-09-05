import {
  ArrowRight,
  Bus,
  Check,
  Clock,
  Footprints,
  LightbulbFilament,
  ShieldCheck,
} from "@phosphor-icons/react";

function routeCondition(route) {
  return route.conditionScore ?? Math.max(0, 100 - route.riskScore);
}

export default function RouteCard({ route, selected, onSelect }) {
  const condition = routeCondition(route);
  const transitSummary = route.mode === "transit"
    ? [
        route.waitMinutes > 0 ? `${route.waitMinutes} min wait` : null,
        ...(route.legs
        ?.map((leg) => {
          const type = String(leg.type || leg.mode).toLowerCase();
          if (type === "transit" || type === "bus") {
            return leg.routeShortName || "Bus";
          }
          if (type === "wait") return `${leg.durationMinutes} min wait`;
          return `${leg.durationMinutes} min walk`;
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
      aria-label={`${route.recommended ? "Recommended route, " : ""}${route.label}, ${route.durationMinutes} minutes, route conditions ${condition} out of 100`}
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
          <strong>{route.durationMinutes} min</strong>
          {route.timeDeltaMinutes > 0 && <small>+{route.timeDeltaMinutes}</small>}
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

      <span className="route-score-bars" aria-hidden="true">
        <span>
          <i>Route conditions</i>
          <b><i style={{ width: `${condition}%` }} /></b>
        </span>
        <span>
          <i>Travel time</i>
          <b><i style={{ width: `${Math.round((route.normalizedTravelTime ?? 0.8) * 100)}%` }} /></b>
        </span>
      </span>

      <span className="route-explanation">
        {route.recommended
          ? route.explanation || "The strongest balance of route conditions and travel time."
          : route.reasons?.[0] || route.explanation}
      </span>
    </button>
  );
}
