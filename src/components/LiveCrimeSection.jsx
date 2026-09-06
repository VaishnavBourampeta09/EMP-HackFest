"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Car,
  Fire,
  Lightning,
  MapPin,
  ShieldWarning,
  Siren,
} from "@phosphor-icons/react";

// Downtown Redmond, the area the demo plans trips through.
const BBOX = "-122.145,47.660,-122.105,47.695";

const CATEGORY_META = {
  violent_crime: { label: "Personal safety", Icon: Siren, tone: "severe" },
  property_crime: { label: "Property", Icon: ShieldWarning, tone: "warn" },
  collision: { label: "Traffic", Icon: Car, tone: "warn" },
  low_light: { label: "Lighting", Icon: Lightning, tone: "info" },
  user_reported: { label: "Community", Icon: MapPin, tone: "info" },
};

function whenLabel(days) {
  if (!Number.isFinite(days)) return "Recently";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/**
 * The homepage's proof section: the actual City of Redmond crime feed the
 * router scores against. Showing the real records, with dates and blocks,
 * makes the safety claim concrete instead of decorative.
 */
export default function LiveCrimeSection({ onPlanClick }) {
  const [incidents, setIncidents] = useState([]);
  const [state, setState] = useState("loading");
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/incidents?bbox=${encodeURIComponent(BBOX)}&limit=120`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .then((payload) => {
        if (controller.signal.aborted) return;
        const rows = (payload?.features ?? [])
          .map((feature) => feature.properties)
          .filter(Boolean);
        setIncidents(rows);
        setMeta(payload?.metadata ?? null);
        setState(rows.length > 0 ? "ready" : "empty");
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setState("empty");
      });
    return () => controller.abort();
  }, []);

  const stats = useMemo(() => {
    const week = incidents.filter((i) => (i.recencyDays ?? 999) <= 7);
    const serious = incidents.filter(
      (i) => i.category === "violent_crime" || i.category === "collision",
    );
    const nightAssaults = incidents.filter((i) => i.category === "violent_crime");
    return {
      total: incidents.length,
      week: week.length,
      serious: serious.length,
      violent: nightAssaults.length,
    };
  }, [incidents]);

  // The record a person would most want to know about: serious first, newest first.
  const headline = useMemo(() => {
    const ranked = [...incidents].sort((a, b) => {
      const severity = (b.severity ?? 0) - (a.severity ?? 0);
      if (severity !== 0) return severity;
      return (a.recencyDays ?? 999) - (b.recencyDays ?? 999);
    });
    return ranked[0] ?? null;
  }, [incidents]);

  const recent = useMemo(
    () =>
      [...incidents]
        .sort((a, b) => (a.recencyDays ?? 999) - (b.recencyDays ?? 999))
        .slice(0, 4),
    [incidents],
  );

  return (
    <section className="crime-section" aria-labelledby="crime-title">
      <div className="crime-inner">
        {/* Heading on the left, the running totals on the right, so the row
            balances instead of a wide header over an empty gutter. */}
        <div className="crime-top">
          <header className="crime-head">
            <p className="story-eyebrow crime-eyebrow">
              <span className="crime-live-dot" aria-hidden="true" />
              Live City of Redmond crime feed
            </p>
            <h2 id="crime-title">This is the data your route is scored against.</h2>
            <p className="crime-lede">
              Sentinel reads the City of Redmond crime layer and OpenStreetMap
              street lighting, then weighs every candidate route against what is
              mapped near it: by severity, by how recent it is, and by how close it
              falls to your path.
            </p>
            <button type="button" className="button button-primary crime-cta" onClick={onPlanClick}>
              Score a route against this data
              <ArrowRight size={17} weight="bold" aria-hidden="true" />
            </button>
          </header>

          {/* The totals carry their own label so this column starts on the
              same line as the eyebrow opposite it. */}
          <div className="crime-ledger">
            <p className="crime-ledger-label">Redmond, rolling 30 days</p>
            <dl className="crime-stats" aria-label="Recent incident counts">
              <div>
                <dt>Reports mapped downtown</dt>
                <dd>{state === "ready" ? stats.total : "…"}</dd>
              </div>
              <div>
                <dt>Filed in the last 7 days</dt>
                <dd>{state === "ready" ? stats.week : "…"}</dd>
              </div>
              <div>
                <dt>Personal-safety or traffic</dt>
                <dd>{state === "ready" ? stats.serious : "…"}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="crime-detail">
          <article className="crime-headline-card">
            {state !== "ready" && (
              <p className="crime-loading">
                {state === "loading"
                  ? "Loading the live Redmond feed…"
                  : "The live feed is unavailable right now. Sentinel falls back to a cached snapshot so routing keeps working."}
              </p>
            )}

            {state === "ready" && headline && (
              <>
                <div className="crime-headline-top">
                  <span className="crime-headline-icon" aria-hidden="true">
                    <Fire size={18} weight="fill" />
                  </span>
                  <div>
                    <p className="crime-headline-kicker">Most serious recent report</p>
                    <strong className="crime-headline-title">
                      {headline.categoryLabel || headline.description || "Reported incident"}
                    </strong>
                  </div>
                  <span className="crime-headline-when">
                    {whenLabel(headline.recencyDays)}
                  </span>
                </div>

                <dl className="crime-headline-facts">
                  <div>
                    <dt>Where</dt>
                    <dd>{headline.generalizedLocation || "Downtown Redmond"}</dd>
                  </div>
                  <div>
                    <dt>Severity</dt>
                    <dd className="crime-severity">
                      {(headline.severityLabel || "").replace(/_/g, " ") || "Unclassified"}
                    </dd>
                  </div>
                </dl>

                <p className="crime-headline-note">
                  A route passing within a block of this report scores lower than one
                  two streets over, and lower still after dark.
                </p>
              </>
            )}
          </article>

          <div className="crime-feed">
            <p className="crime-feed-label">Most recent reports</p>
            <ul>
              {(state === "ready" ? recent : []).map((incident) => {
                const tone = CATEGORY_META[incident.category] ?? CATEGORY_META.user_reported;
                const Icon = tone.Icon;
                return (
                  <li key={incident.id} className={`crime-row crime-row-${tone.tone}`}>
                    <span className="crime-row-icon" aria-hidden="true">
                      <Icon size={13} weight="fill" />
                    </span>
                    <span className="crime-row-type">
                      {incident.categoryLabel || tone.label}
                    </span>
                    <span className="crime-row-where">
                      {incident.generalizedLocation || "Redmond"}
                    </span>
                    <span className="crime-row-when">{whenLabel(incident.recencyDays)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="crime-foot">
          <p>
            {meta?.live
              ? `Live from ${meta.provider ?? "the City of Redmond"} · updated ${new Date(meta.queriedAt ?? Date.now()).toLocaleString()}`
              : "Source: City of Redmond open crime data · OpenStreetMap street lighting"}
          </p>
        </div>
      </div>
    </section>
  );
}
