import MapView from './MapView.jsx';
import AlertCard from './AlertCard.jsx';
import { acknowledgeAlert, zones, places } from '../actions.js';
import { useStore, setState } from '../store.js';
import { DEFAULT_SETTINGS } from '../logic/tripMonitoring.js';

const SETTING_LABELS = {
  offRouteMeters: 'Alert if off route by 300m',
  longStopMinutes: 'Check in after 5 minutes stopped',
  checkRiskZones: 'Check in near a recent incident zone',
  etaDelayMinutes: 'Alert if ETA slips by 10+ minutes'
};

export default function ParentDashboard() {
  const { trip, alerts, settings, users, locationUpdates } = useStore();
  const pending = alerts.filter((alert) => alert.status === 'pending');
  const lastUpdate = locationUpdates[0];
  const secondsAgo = lastUpdate ? Math.round((Date.now() - lastUpdate.createdAt) / 1000) : null;

  const toggle = (key) => {
    if (key === 'checkRiskZones') {
      setState({ settings: { ...settings, checkRiskZones: !settings.checkRiskZones } });
      return;
    }
    const isOn = settings[key] > 0;
    setState({ settings: { ...settings, [key]: isOn ? 0 : DEFAULT_SETTINGS[key] } });
  };

  return (
    <div className="screen">
      <h1>{users.teen.name}</h1>
      {trip ? (
        <div className={`status-banner ${pending.length ? 'banner-alert' : ''}`}>
          <div>
            <span className="kicker">
              {trip.status === 'completed' ? 'Trip complete' : trip.status === 'alert' ? 'Needs attention' : 'On trip'}
            </span>
            <h2>{trip.destination.name}</h2>
            <p>
              ETA in {trip.etaMinutes} min · {trip.route.label} route ·{' '}
              <span className={`pill pill-${trip.route.riskLevel.toLowerCase()}`}>{trip.route.riskLevel} risk</span>
            </p>
            <p className="muted">
              Last update {secondsAgo === null ? 'never' : `${secondsAgo}s ago`}
            </p>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <p>No active trip. Location sharing is off until {users.teen.name} starts one.</p>
        </div>
      )}

      {trip && (
        <MapView
          zones={zones}
          places={places}
          routes={[trip.route]}
          activeRouteId={trip.route.routeId}
          teenLocation={trip.location}
          trail={locationUpdates.slice().reverse().map((u) => [u.lat, u.lng])}
          height={280}
        />
      )}

      <section>
        <h3>Alerts</h3>
        {alerts.length === 0 && <p className="muted">No alerts. GuardianRoute only escalates when a check-in fails.</p>}
        {alerts.map((alert) => (
          <AlertCard key={alert.id} alert={alert} trip={trip} onAcknowledge={acknowledgeAlert} />
        ))}
      </section>

      <section>
        <h3>Monitoring rules</h3>
        <div className="settings-list">
          {Object.keys(SETTING_LABELS).map((key) => {
            const on = key === 'checkRiskZones' ? settings.checkRiskZones : settings[key] > 0;
            return (
              <label key={key} className="setting-row">
                <input type="checkbox" checked={on} onChange={() => toggle(key)} />
                <span>{SETTING_LABELS[key]}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="privacy">
        <h3>Privacy by design</h3>
        <p>
          Location is shared only while a trip is active, stored as trip history, and deleted with the trip. No
          always-on tracking, no silent listening, no location sharing when the teen is not travelling.
        </p>
      </section>
    </div>
  );
}
