"use client";

import { useEffect, useMemo, useState } from "react";
import { isRiskyIncident } from "../logic/safetyInsights.js";

const BBOX = "-122.145,47.660,-122.105,47.695";

function whenLabel(days) {
  if (!Number.isFinite(days)) return "Date unavailable";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export default function LiveCrimeSection({ onPlanClick }) {
  const [incidents, setIncidents] = useState([]);
  const [state, setState] = useState("loading");
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/incidents?bbox=${encodeURIComponent(BBOX)}&limit=120`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Reports unavailable");
        return response.json();
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const rows = (payload?.features ?? [])
          .map((feature) => feature.properties)
          .filter(Boolean)
          .filter(isRiskyIncident);
        setIncidents(rows);
        setMeta(payload?.metadata ?? null);
        setState(rows.length ? "ready" : "empty");
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setState("error");
      });
    return () => controller.abort();
  }, []);

  const recent = useMemo(() => [...incidents]
    .sort((a, b) => (a.recencyDays ?? Infinity) - (b.recencyDays ?? Infinity))
    .slice(0, 4), [incidents]);

  return (
    <section className="local-reports" aria-labelledby="crime-title">
      <div className="local-reports-inner">
        <header>
          <h2 id="crime-title">Recent reports in Redmond</h2>
          <p>Sentinel uses local incident reports and mapped street lighting to compare routes. Here are the latest higher-risk reports from downtown Redmond.</p>
        </header>

        {state === "ready" ? (
          <ul className="local-reports-list">
            {recent.map((incident, index) => (
              <li key={incident.id ?? index}>
                <div>
                  <strong>{incident.categoryLabel || incident.description || "Reported incident"}</strong>
                  <span>{incident.generalizedLocation || "Downtown Redmond"}</span>
                </div>
                <span className="local-report-date">{whenLabel(incident.recencyDays)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="local-reports-status" role="status">
            {state === "loading" ? "Loading reports…" : state === "error"
              ? "Reports are unavailable right now."
              : "No higher-risk reports were returned for this area."}
          </p>
        )}

        <div className="local-reports-bottom">
          <p>Source: City of Redmond{meta?.live === false ? " · Cached data" : ""}</p>
          <button type="button" onClick={onPlanClick}>Compare routes <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </section>
  );
}
