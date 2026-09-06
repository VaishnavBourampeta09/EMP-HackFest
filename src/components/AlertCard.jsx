import {
  ArrowSquareOut,
  Check,
  Clock,
  MapPin,
  Phone,
  ShieldWarning,
  Siren,
} from "@phosphor-icons/react";
import { shortPlaceName } from "../logic/safetyInsights.js";

const ALERT_COPY = {
  route_deviation: { title: "Off planned route", Icon: MapPin },
  long_stop: { title: "Unexpected stop", Icon: Clock },
  risk_zone: { title: "Route conditions changed", Icon: ShieldWarning },
  late_arrival: { title: "Arrival time changed", Icon: Clock },
  missed_checkin: { title: "Check-in needs attention", Icon: ShieldWarning },
  sos: { title: "Help requested", Icon: Siren },
};

export default function AlertCard({ alert, trip, onAcknowledge }) {
  const time = new Date(alert.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const copy = ALERT_COPY[alert.type] || {
    title: "Trip update",
    Icon: ShieldWarning,
  };
  const Icon = copy.Icon;

  return (
    <article className={`alert-card severity-${alert.severity}`}>
      <div className="alert-card-top">
        <span className="alert-icon">
          <Icon size={20} weight="fill" aria-hidden="true" />
        </span>
        <div>
          <span>{alert.status === "pending" ? "Action requested" : "Update reviewed"}</span>
          <h4>{copy.title}</h4>
        </div>
        <time dateTime={new Date(alert.createdAt).toISOString()}>{time}</time>
      </div>

      <p className="alert-message">{alert.message}</p>
      {trip && (
        <p className="alert-meta">
          {shortPlaceName(trip.origin.name)} to {shortPlaceName(trip.destination.name)} · {trip.route.label} route
        </p>
      )}

      <div className="alert-actions">
        <a className="button button-soft button-compact" href="tel:+14255550134">
          <Phone size={16} weight="fill" aria-hidden="true" />
          Call teen
        </a>
        <a
          className="button button-soft button-compact"
          href={
            trip?.location
              ? `https://www.google.com/maps/dir/?api=1&destination=${trip.location[0]},${trip.location[1]}`
              : "#"
          }
          target="_blank"
          rel="noreferrer"
        >
          <ArrowSquareOut size={16} weight="bold" aria-hidden="true" />
          Navigate
        </a>
        <a className="button button-danger button-compact" href="tel:911">
          <Siren size={16} weight="fill" aria-hidden="true" />
          Emergency
        </a>
      </div>

      {alert.status === "pending" ? (
        <button
          type="button"
          className="acknowledge-button"
          onClick={() => onAcknowledge(alert.id)}
        >
          <Check size={15} weight="bold" aria-hidden="true" />
          Mark as reviewed
        </button>
      ) : (
        <span className="reviewed-status">
          <Check size={14} weight="bold" aria-hidden="true" />
          {alert.status}
        </span>
      )}
    </article>
  );
}
