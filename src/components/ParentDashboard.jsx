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
  SlidersHorizontal,
  Warning,
} from "@phosphor-icons/react";
import AlertCard from "./AlertCard.jsx";
import JourneySummaryCard from "./JourneySummaryCard.jsx";
import DangerBox from "./DangerBox.jsx";
import StreetLevelView from "./StreetLevelView.jsx";
import ReportDangerButton from "./ReportDangerButton.jsx";
import SimulationControls from "./SimulationControls.jsx";
import {
  incidentsNearRoute,
  summarizeIncidents,
  shortPlaceName,
} from "../logic/safetyInsights.js";
import { acknowledgeAlert, places, endTrip } from "../actions.js";
import { useStore, setState } from "../store.js";
import { DEFAULT_SETTINGS } from "../logic/tripMonitoring.js";
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

const SETTING_LABELS = {
  offRouteMeters: {
    title: "Sustained route changes",
    detail: "Check in after a meaningful route deviation",
  },
  longStopMinutes: {
    title: "Unexpected stops",
    detail: "Check in after 7 simulated minutes stopped",
  },
  checkRiskZones: {
    title: "Changing route conditions",
    detail: "Offer a reroute when conditions change nearby",
  },
  etaDelayMinutes: {
    title: "Significantly overdue",
    detail: "Escalate when arrival slips by 10+ minutes",
  },
};

function conditionScore(route) {
  return route?.conditionScore ?? Math.max(0, 100 - (route?.riskScore ?? 0));
}

export default function ParentDashboard() {
  const { trip, alerts, settings, users, locationUpdates, checkin, reports } = useStore();
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
          {
            body: alert.message,
            tag: alert.id,
          },
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

  const toggle = (key) => {
    if (key === "checkRiskZones") {
      setState({
        settings: { ...settings, checkRiskZones: !settings.checkRiskZones },
      });
      return;
    }
    const isOn = settings[key] > 0;
    setState({
      settings: { ...settings, [key]: isOn ? 0 : DEFAULT_SETTINGS[key] },
    });
  };

  const getSettingState = (key) =>
    key === "checkRiskZones" ? settings.checkRiskZones : settings[key] > 0;

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
              Sentinel is trip-scoped, not always-on tracking. Switch to
              the Teen view, choose a route, and start a Safe Trip to see this
              dashboard update live.
            </p>
          </div>

          <section className="guardian-rules compact-rules">
            <div className="sidebar-section-heading">
              <SlidersHorizontal size={19} weight="bold" aria-hidden="true" />
              <h3>Monitoring preferences</h3>
            </div>
            {Object.entries(SETTING_LABELS).map(([key, copy]) => {
              const on = getSettingState(key);
              return (
                <div className="setting-row" key={key}>
                  <div>
                    <strong>{copy.title}</strong>
                    <span>{copy.detail}</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    className={on ? "switch-control active" : "switch-control"}
                    onClick={() => toggle(key)}
                    aria-label={`${copy.title}: ${on ? "on" : "off"}`}
                  >
                    <span />
                  </button>
                </div>
              );
            })}
          </section>
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
      {/* Map on the left, street-level corridor on the right. */}
      <div className="map-base map-base-split">
        <div className="map-pane">
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
            <div className="teen-avatar teen-avatar-small">{users.teen.name.charAt(0)}</div>
            <div>
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
        </div>

        <div className="street-pane">
          <StreetLevelView
            points={trip.route.points}
            position={trip.location}
            incidents={incidents}
            title={`Where ${users.teen.name} is`}
            subtitle="Following their position · past reports flagged"
            fill
          />
        </div>
      </div>

      <aside className="sidebar-float guardian-float" aria-labelledby="guardian-trip-title">
        {/* Journey summary card - provides immediate context */}
        <JourneySummaryCard trip={trip} users={users} />

        {/* Status banner inside sidebar */}
        <div className={`guardian-status-banner guardian-status-${status}`}>
          <div className="guardian-status-icon">
            <StatusIcon size={23} weight="fill" aria-hidden="true" />
          </div>
          <div>
            <span>Live trip status</span>
            <h2 id="guardian-trip-title">{statusCopy.title}</h2>
            <p>{statusCopy.detail}</p>
          </div>
          <div className="last-update">
            <span className={status === "calm" ? "pulse-live" : ""} />
            Updated {secondsAgo === null ? "just now" : `${secondsAgo}s ago`}
          </div>
        </div>

        <DangerBox
          incident={closestIncident}
          totalNearby={incidentSummary.total}
          seriousNearby={incidentSummary.serious}
          compact
        />

        <ReportDangerButton location={trip.location} compact />

        <SimulationControls compact />

        {/* Trip facts strip */}
        <div className="guardian-trip-facts">
          <div>
            <Footprints size={20} weight="bold" aria-hidden="true" />
            <span>Route</span>
            <strong>{trip.route.label}</strong>
          </div>
          <div>
            <ShieldCheck size={20} weight="fill" aria-hidden="true" />
            <span>Conditions</span>
            <strong>{conditionScore(trip.route)}/100</strong>
          </div>
          <div>
            <MapPin size={20} weight="fill" aria-hidden="true" />
            <span>Off route</span>
            <strong>{trip.offRouteMeters ?? 0} m</strong>
          </div>
          <div>
            <Eye size={20} weight="bold" aria-hidden="true" />
            <span>Sharing</span>
            <strong>Trip only</strong>
          </div>
        </div>
        <div className="teen-profile">
          <span className="teen-avatar">{users.teen.name.charAt(0)}</span>
          <div>
            <span>Watching this trip</span>
            <h2>{users.teen.name}</h2>
          </div>
          <span className="calm-status calm-status-live">
            <span />
            Live
          </span>
        </div>

        <section className="alerts-panel" aria-labelledby="alerts-heading">
          <div className="sidebar-section-heading">
            <Bell size={19} weight="fill" aria-hidden="true" />
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
                : "Notify me on this device when an alert arrives"}
            </button>
          )}

          {alerts.length === 0 ? (
            <div className="calm-alert-state">
              <ShieldCheck size={27} weight="fill" aria-hidden="true" />
              <div>
                <strong>Quiet is the intended state.</strong>
                <p>
                  Sentinel will check with {users.teen.name} before asking
                  you to act.
                </p>
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

        <section className="guardian-rules" aria-labelledby="rules-heading">
          <div className="sidebar-section-heading">
            <SlidersHorizontal size={19} weight="bold" aria-hidden="true" />
            <h3 id="rules-heading">Monitoring preferences</h3>
          </div>
          {Object.entries(SETTING_LABELS).map(([key, copy]) => {
            const on = getSettingState(key);
            return (
              <div className="setting-row" key={key}>
                <div>
                  <strong>{copy.title}</strong>
                  <span>{copy.detail}</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  className={on ? "switch-control active" : "switch-control"}
                  onClick={() => toggle(key)}
                  aria-label={`${copy.title}: ${on ? "on" : "off"}`}
                >
                  <span />
                </button>
              </div>
            );
          })}
        </section>

        <section className="guardian-emergency-controls" aria-labelledby="emergency-heading">
          <div className="sidebar-section-heading">
            <Warning size={19} weight="fill" aria-hidden="true" />
            <h3 id="emergency-heading">Guardian controls</h3>
          </div>
          <button
            type="button"
            className="button button-danger button-block"
            onClick={() => endTrip("cancelled")}
            aria-label="End this trip"
            title="Stops monitoring and ends the trip"
          >
            End trip
          </button>
          <p className="control-note">End the trip if you need immediate control or reach the destination.</p>
        </section>

        <div className="privacy-note">
          <LockKey size={20} weight="fill" aria-hidden="true" />
          <p>
            Location sharing ends with this trip. No background family map and
            no silent tracking between trips.
          </p>
        </div>
      </aside>
    </div>
  );
}
