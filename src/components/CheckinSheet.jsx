"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  CheckCircle,
  Phone,
  ShieldCheck,
  Siren,
} from "@phosphor-icons/react";

export default function CheckinSheet({ checkin, onRespond, onExpire }) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const sheetRef = useRef(null);
  const firstActionRef = useRef(null);

  useEffect(() => {
    if (!checkin) return undefined;
    const tick = () =>
      setSecondsLeft(
        Math.max(0, Math.ceil((checkin.expiresAt - Date.now()) / 1000)),
      );
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [checkin]);

  useEffect(() => {
    if (!checkin || checkin.status !== "waiting") return undefined;
    const previouslyFocused = document.activeElement;
    firstActionRef.current?.focus();

    const trapFocus = (event) => {
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll("button, a[href]"),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      previouslyFocused?.focus?.();
    };
  }, [checkin]);

  if (!checkin || checkin.status !== "waiting") return null;

  const totalSeconds = Math.max(
    1,
    Math.round((checkin.expiresAt - checkin.createdAt) / 1000),
  );
  const countdownProgress = Math.max(0, Math.min(1, secondsLeft / totalSeconds));

  return (
    <div className="sheet-backdrop checkin-backdrop">
      <section
        ref={sheetRef}
        className="sheet checkin-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="checkin-title"
        aria-describedby="checkin-reason"
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="checkin-header">
          <div className="checkin-shield" aria-hidden="true">
            <ShieldCheck size={31} weight="fill" />
          </div>
          <div>
            <p className="sheet-kicker">A change lasted long enough to check</p>
            <h2 id="checkin-title">{checkin.question}</h2>
          </div>
        </div>

        <p id="checkin-reason" className="sheet-reason">
          {checkin.reason}
        </p>

        <div className="countdown-card" aria-live="polite">
          <div>
            <span>Time to reply</span>
            <strong>{secondsLeft}s</strong>
          </div>
          <div className="countdown-track" aria-hidden="true">
            <span style={{ width: `${countdownProgress * 100}%` }} />
          </div>
          <p>
            Your guardian is only alerted if the change continues and you do
            not respond.
          </p>
        </div>

        <div className="checkin-primary-actions">
          <button
            ref={firstActionRef}
            type="button"
            className="button button-lime"
            onClick={() => onRespond("im_ok")}
          >
            <CheckCircle size={19} weight="fill" aria-hidden="true" />
            I am okay
          </button>
          <button
            type="button"
            className="button button-soft"
            onClick={() => onRespond("reroute")}
          >
            <ArrowCounterClockwise size={18} weight="bold" aria-hidden="true" />
            Return to route
          </button>
        </div>

        <div className="checkin-secondary-actions">
          <a className="button button-ghost" href="tel:+14255550177">
            <Phone size={17} weight="fill" aria-hidden="true" />
            Call guardian
          </a>
          <button
            type="button"
            className="button button-danger"
            onClick={() => onRespond("need_help")}
          >
            <Siren size={18} weight="fill" aria-hidden="true" />
            I need help
          </button>
        </div>

        {onExpire && (
          <button type="button" className="demo-expire-button" onClick={onExpire}>
            Simulate no response
          </button>
        )}
      </section>
    </div>
  );
}
