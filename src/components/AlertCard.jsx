const TITLES = {
  route_deviation: 'Off planned route',
  long_stop: 'Stopped too long',
  risk_zone: 'Entered incident zone',
  late_arrival: 'ETA slipped',
  missed_checkin: 'Missed check-in',
  sos: 'Help requested'
};

export default function AlertCard({ alert, trip, onAcknowledge }) {
  const time = new Date(alert.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <div className={`alert-card severity-${alert.severity}`}>
      <div className="alert-head">
        <span className="alert-title">{TITLES[alert.type] || 'Safety alert'}</span>
        <span className="alert-time">{time}</span>
      </div>
      <p className="alert-message">{alert.message}</p>
      {trip && (
        <p className="alert-meta">
          Trip: {trip.origin.name} to {trip.destination.name} · route {trip.route.label}
        </p>
      )}
      <div className="alert-actions">
        <a className="btn btn-ghost" href="tel:+14255550134">Call teen</a>
        <a
          className="btn btn-ghost"
          href={
            trip && trip.location
              ? `https://www.google.com/maps/dir/?api=1&destination=${trip.location[0]},${trip.location[1]}`
              : '#'
          }
          target="_blank"
          rel="noreferrer"
        >
          Navigate there
        </a>
        <a className="btn btn-danger" href="tel:911">Call 911</a>
      </div>
      {alert.status === 'pending' && (
        <button type="button" className="btn btn-quiet" onClick={() => onAcknowledge(alert.id)}>
          Acknowledge
        </button>
      )}
      {alert.status !== 'pending' && <span className="status-chip">{alert.status}</span>}
    </div>
  );
}
