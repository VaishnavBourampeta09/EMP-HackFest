"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { LockKey, ShieldCheck, WarningOctagon } from "@phosphor-icons/react";
import AlertCard from "./AlertCard.jsx";
import JourneySummaryCard from "./JourneySummaryCard.jsx";
import DangerBox from "./DangerBox.jsx";
import StreetLevelView from "./StreetLevelView.jsx";
import MapSplit from "./MapSplit.jsx";
import ReportDangerButton from "./ReportDangerButton.jsx";
import {
  incidentsNearRoute,
  summarizeIncidents,
  shortPlaceName,
  isRiskyIncident,
} from "../logic/safetyInsights.js";
import { acknowledgeAlert, places } from '../ACTIONS.JS';
import { useStore } from '../brrr.js';
import { formatMinutes } from '../logic/DURATION.JS';

const MapView = dynamic(() => import("./MapView.jsx"), {
  ssr: false,
  loading: () => (
    <div className="map-loading" role="status">
      <span />
      Preparing the live trip map
    </div>
  ),
});

function conditionScore(route) {
  return route?.safetyScore?.toFixed(1) ?? "—";
}

export default function ParentDashboard() {
  const { trip, alerts, users, locationUpdates, checkin, reports } = useStore();
  const pending = alerts.filter((alert) => alert.status === "pending");
  const lastUpdate = locationUpdates[0];
  const secondsAgo = lastUpdate
    ? Math.max(0, Math.round((Date.now() - lastUpdate.createdAt) / 1000))
    : null;

  // Desktop notifications so a guardian who has tabbed away still hears about
  // a new alert. Permission is only requested after an explicit opt-in click.
  const [notifyPermission, setNotifyPermission] = useState("default");
  const notifiedRef = useRef(new Set());

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setNotifyPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (typeof Notification === "undefined" || notifyPermission !== "granted")
      return;
    for (const alert of pending) {
      if (notifiedRef.current.has(alert.id)) continue;
      notifiedRef.current.add(alert.id);
      try {
        new Notification(
          alert.type === "sos"
            ? "Sentinel — help requested"
            : "Sentinel — trip alert",
          { body: alert.message, tag: alert.id },
        );
      } catch {
        // Notification construction can throw in unsupported contexts; the
        // in-app alert list is still the source of truth.
      }
    }
  }, [pending, notifyPermission]);

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") return;
    try {
      setNotifyPermission(await Notification.requestPermission());
    } catch {
      setNotifyPermission("denied");
    }
  };

  // Community reports sit alongside the official feed.
  const incidents = useMemo(
    () =>
      [...(reports || []), ...(trip?.route?.contextFactors ?? [])].filter(
        isRiskyIncident,
      ),
    [reports, trip],
  );
  // Summarise the whole corridor, not the truncated display list.
  const nearbyIncidents = useMemo(
    () =>
      incidentsNearRoute(incidents, trip?.route, {
        withinMeters: 400,
        limit: Number.MAX_SAFE_INTEGER,
      }),
    [incidents, trip],
  );
  const incidentSummary = useMemo(
    () => summarizeIncidents(nearbyIncidents),
    [nearbyIncidents],
  );
  const closestIncident = nearbyIncidents[0] ?? null;

  if (!trip) {
    return (
      <div className="map-viewport">
        <div className="map-base">
          <MapView height="100%" />
          <div className="map-resting-message">
            <ShieldCheck size={24} weight="fill" aria-hidden="true" />
            <div>
              <strong>No active Safe Trip</strong>
              <span>
                The map stays private until {users.teen.name} starts one.
              </span>
            </div>
          </div>
        </div>

        <aside className="sidebar-float guardian-float">
          <div className="teen-profile">
            <span className="teen-avatar">{users.teen.name.charAt(0)}</span>
            <div>
              <span>Your teen</span>
              <h2>{users.teen.name}</h2>
            </div>
            <span className="calm-status">
              <span />
              Not sharing
            </span>
          </div>

          <div className="guardian-empty-card">
            <div className="empty-shield">
              <LockKey size={30} weight="fill" aria-hidden="true" />
            </div>
            <h3>Privacy is the default state.</h3>
            <p>
              Sentinel is trip-scoped, not always-on tracking. This dashboard
              stays empty until a Safe Trip begins.
            </p>
          </div>
        </aside>
      </div>
    );
  }

  const status =
    pending.length > 0 || trip.status === "alert"
      ? "attention"
      : checkin?.status === "waiting"
        ? "checking"
        : trip.status === "completed"
          ? "complete"
          : "calm";

  const statusCopy = {
    attention: {
      title: "Needs your attention",
      detail: `${pending.length || 1} unresolved trip alert`,
    },
    checking: {
      title: "Checking in first",
      detail: `${users.teen.name} has a safety prompt open`,
    },
    complete: {
      title: "Arrived",
      detail: "The Safe Trip has ended",
    },
    calm: {
      title: "Trip looks on track",
      detail: "No action is needed from you",
    },
  }[status];

  return (
    <div className="map-viewport">
      {/* Map and street-level corridor, proportioned by a draggable divider. */}
      <div className="map-base">
        <MapSplit
          map={
            <>
              <MapView
                zones={incidents}
                routes={[trip.route]}
                activeRouteId={trip.route.routeId}
                teenLocation={trip.location}
                trail={locationUpdates
                  .slice()
                  .reverse()
                  .map((update) => [update.lat, update.lng])}
                height="100%"
              />
            </>
          }
          street={
            <StreetLevelView
              points={trip.route.points}
              position={trip.location}
              incidents={incidents}
              title={`Where ${users.teen.name} is`}
              subtitle="Following their position · past reports flagged"
              fill
            />
          }
        />
      </div>

      <aside
        className="sidebar-float guardian-float"
        aria-labelledby="guardian-trip-title"
      >
        {/* Trip info section */}
        <div className="sidebar-section primary-section">
          <JourneySummaryCard trip={trip} users={users} />

          <div className={`guardian-status-banner guardian-status-${status}`}>
            <div>
              <h2 id="guardian-trip-status">Status</h2>
              <h1 id="guardian-trip-title">{statusCopy.title}</h1>
            </div>
          </div>
        </div>

        {/* Safety section */}
        <div className="sidebar-section safety-section">
          <DangerBox
            incident={closestIncident}
            totalNearby={incidentSummary.total}
            seriousNearby={incidentSummary.serious}
            compact
          />
        </div>

        {/* Notifications section */}
        <section
          className="sidebar-section alerts-panel"
          aria-labelledby="alerts-heading"
        >
          <div className="sidebar-section-heading">
            <h3 id="alerts-heading">Updates</h3>
            {pending.length > 0 && (
              <span className="alert-count">{pending.length}</span>
            )}
          </div>

          <label className="alerts-toggle">
            <input
              type="checkbox"
              checked={notifyPermission === "granted"}
              onChange={enableNotifications}
              disabled={notifyPermission === "denied"}
            />
            <span>
              Trip alerts {notifyPermission === "granted" ? "ON" : "OFF"}
            </span>
          </label>

          {alerts.length > 0 && (
            <div className="alert-list">
              {alerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  trip={trip}
                  onAcknowledge={acknowledgeAlert}
                />
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
