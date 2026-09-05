import { useEffect, useState } from 'react';

export default function CheckinSheet({ checkin, onRespond }) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!checkin) return undefined;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((checkin.expiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [checkin]);

  if (!checkin || checkin.status !== 'waiting') return null;

  return (
    <div className="sheet-backdrop">
      <div className="sheet">
        <span className="sheet-kicker">Safety check</span>
        <h2>{checkin.question}</h2>
        <p className="sheet-reason">{checkin.reason}</p>
        <p className="countdown">
          Your parent is alerted in <strong>{secondsLeft}s</strong> if you do not respond.
        </p>
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" onClick={() => onRespond('im_ok')}>
            I am okay
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => onRespond('reroute')}>
            Reroute me
          </button>
          <a className="btn btn-ghost" href="tel:+14255550177">Call parent</a>
          <button type="button" className="btn btn-danger" onClick={() => onRespond('need_help')}>
            I need help
          </button>
        </div>
      </div>
    </div>
  );
}
