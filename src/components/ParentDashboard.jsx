"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Bell,
  Check,
  Clock,
  Eye,
  Footprints,
  LockKey,
  MapPin,
  ShieldCheck,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react";
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
} from "../logic/safetyInsights.js";
import { acknowledgeAlert, places } from "../actions.js";
import { useStore } from "../store.js";
import { formatMinutes } from "../logic/duration.js";

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
  return route?.conditionScore ?? Math.max(0, 100 - (route?.riskScore ?? 0));
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
    if (typeof Notification === "undefined" || notifyPermission !== "granted") return;
    for (const alert of pending) {
      if (notifiedRef.current.has(alert.id)) continue;
      notifiedRef.current.add(alert.id);
      try {
        new Notification(
          alert.type === "sos" ? "Sentinel — help requested" : "Sentinel — trip alert",
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
    () => [...(reports || []), ...(trip?.route?.contextFactors ?? [])],
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
          <MapView places={places} height="100%" />
          <div className="map-resting-message">
            <ShieldCheck size={24} weight="fill" aria-hidden="true" />
            <div>
              <strong>No active Safe Trip</strong>
              <span>The map stays private until {users.teen.name} starts one.</span>
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
      icon: Warning,
    },
    checking: {
      title: "Checking in first",
      detail: `${users.teen.name} has a safety prompt open`,
      icon: Bell,
    },
    complete: {
      title: "Arrived",
      detail: "The Safe Trip has ended",
      icon: Check,
    },
    calm: {
      title: "Trip looks on track",
      detail: "No action is needed from you",
      icon: ShieldCheck,
    },
  }[status];
  const StatusIcon = statusCopy.icon;

  return (
    <div className="map-viewport">
      {/* Map and street-level corridor, proportioned by a draggable divider. */}
      <div className="map-base">
        <MapSplit
          map={
            <>
              <MapView
                zones={incidents}
                places={places}
                routes={[trip.route]}
                activeRouteId={trip.route.routeId}
                teenLocation={trip.location}
                trail={locationUpdates
                  .slice()
                  .reverse()
                  .map((update) => [update.lat, update.lng])}
                height="100%"
              />
              <div className="guardian-map-card">
                <div className="guardian-map-card-head">
                  <div className="teen-avatar teen-avatar-small">
                    {users.teen.name.charAt(0)}
                  </div>
                  <div className="guardian-map-card-who">
                    <span>{users.teen.name} is heading to</span>
                    <strong title={trip.destination.name}>
                      {shortPlaceName(trip.destination.name)}
                    </strong>
                  </div>
                  <div className="eta-chip">
                    <Clock size={16} weight="bold" aria-hidden="true" />
                    {formatMinutes(trip.etaMinutes)}
                  </div>
                </div>

                {/* What is actually around them, not just where they are. */}
                <dl className="guardian-map-card-stats">
                  <div>
                    <dt>Nearby reports</dt>
                    <dd>{incidentSummary.total}</dd>
                  </div>
                  <div>
                    <dt>Serious</dt>
                    <dd className={incidentSummary.serious > 0 ? "is-warn" : undefined}>
                      {incidentSummary.serious}
                    </dd>
                  </div>
                  <div>
                    <dt>This week</dt>
                    <dd>{incidentSummary.lastWeek}</dd>
                  </div>
                  <div>
                    <dt>Off route</dt>
                    <dd>{trip.offRouteMeters ?? 0} m</dd>
                  </div>
                </dl>

                {closestIncident && (
                  <p className="guardian-map-card-danger">
                    <WarningOctagon size={14} weight="fill" aria-hidden="true" />
                    <span>
                      <strong>
                        {closestIncident.categoryLabel ||
                          closestIncident.description ||
                          "Reported incident"}
                      </strong>{" "}
                      · {closestIncident.distanceMeters} m from the route
                      {closestIncident.generalizedLocation
                        ? ` · ${closestIncident.generalizedLocation}`
                        : ""}
                    </span>
                  </p>
                )}
              </div>
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

      <aside className="sidebar-float guardian-float" aria-labelledby="guardian-trip-title">
        <JourneySummaryCard trip={trip} users={users} />

        <div className={`guardian-status-banner guardian-status-${status}`}>
          <div className="guardian-status-icon">
            <StatusIcon size={22} weight="fill" aria-hidden="true" />
          </div>
          <div>
            <span>Live trip status</span>
            <h2 id="guardian-trip-title">{statusCopy.title}</h2>
            <p>{statusCopy.detail}</p>
          </div>
          <div className="last-update">
            <span className={status === "calm" ? "pulse-live" : ""} />
            {secondsAgo === null ? "just now" : `${secondsAgo}s ago`}
          </div>
        </div>

        <DangerBox
          incident={closestIncident}
          totalNearby={incidentSummary.total}
          seriousNearby={incidentSummary.serious}
          compact
        />

        <div className="guardian-trip-facts">
          <div>
            <Footprints size={18} weight="bold" aria-hidden="true" />
            <span>Route</span>
            <strong>{trip.route.label}</strong>
          </div>
          <div>
            <ShieldCheck size={18} weight="fill" aria-hidden="true" />
            <span>Conditions</span>
            <strong>{conditionScore(trip.route)}/100</strong>
          </div>
          <div>
            <MapPin size={18} weight="fill" aria-hidden="true" />
            <span>Off route</span>
            <strong>{trip.offRouteMeters ?? 0} m</strong>
          </div>
          <div>
            <Eye size={18} weight="bold" aria-hidden="true" />
            <span>Sharing</span>
            <strong>Trip only</strong>
          </div>
        </div>

        <section className="alerts-panel" aria-labelledby="alerts-heading">
          <div className="sidebar-section-heading">
            <Bell size={17} weight="fill" aria-hidden="true" />
            <h3 id="alerts-heading">Trip updates</h3>
            {pending.length > 0 && <span className="alert-count">{pending.length}</span>}
          </div>

          {notifyPermission !== "granted" && (
            <button
              type="button"
              className="notify-optin"
              onClick={enableNotifications}
              disabled={notifyPermission === "denied"}
            >
              <Bell size={15} weight="fill" aria-hidden="true" />
              {notifyPermission === "denied"
                ? "Notifications blocked in browser settings"
                : "Notify me when an alert arrives"}
            </button>
          )}

          {alerts.length === 0 ? (
            <div className="calm-alert-state">
              <ShieldCheck size={22} weight="fill" aria-hidden="true" />
              <div>
                <strong>Quiet is the intended state.</strong>
                <p>Sentinel checks with {users.teen.name} before asking you to act.</p>
              </div>
            </div>
          ) : (
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

        <ReportDangerButton location={trip.location} compact />
      </aside>
    </div>
  );
}
