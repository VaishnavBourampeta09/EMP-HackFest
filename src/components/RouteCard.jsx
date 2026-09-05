export default function RouteCard({ route, selected, onSelect }) {
  const level = route.riskLevel.toLowerCase();
  return (
    <button
      type="button"
      className={`route-card ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(route)}
    >
      <div className="route-card-head">
        <div>
          <span className="route-label">{route.label}</span>
          <span className="route-summary">{route.summary}</span>
        </div>
        <span className={`pill pill-${level}`}>{route.riskLevel} risk</span>
      </div>
      <div className="route-metrics">
        <span>{route.durationMinutes} min</span>
        <span>{route.distanceKm} km</span>
        <span>score {route.riskScore}/100</span>
      </div>
      <ul className="reasons">
        {route.reasons.slice(0, 3).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="explanation">{route.explanation}</p>
    </button>
  );
}
