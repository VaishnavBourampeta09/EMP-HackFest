"use client";

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
import { acknowledgeAlert, places } from "../actions.js";
import { useStore, setState } from "../store.js";
import { DEFAULT_SETTINGS } from "../logic/tripMonitoring.js";

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
  const { trip, alerts, settings, users, locationUpdates, checkin } = useStore();
  const pending = alerts.filter((alert) => alert.status === "pending");
  const lastUpdate = locationUpdates[0];
  const secondsAgo = lastUpdate
    ? Math.max(0, Math.round((Date.now() - lastUpdate.createdAt) / 1000))
    : null;

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
      <div className="guardian-empty-layout">
        <div className="guardian-empty-map">
          <MapView places={places} height={620} />
          <div className="map-resting-message">
            <ShieldCheck size={24} weight="fill" aria-hidden="true" />
            <div>
              <strong>No active Safe Trip</strong>
              <span>The map stays private until {users.teen.name} starts one.</span>
            </div>
          </div>
        </div>

        <aside className="guardian-sidebar guardian-empty-sidebar">
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
              Escort is trip-scoped, not always-on tracking. Switch to
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
    <div className="guardian-dashboard-layout">
      <section className="guardian-map-column" aria-labelledby="guardian-trip-title">
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

        <div className="guardian-live-map">
          <MapView
            zones={trip.route.contextFactors || []}
            places={places}
            routes={[trip.route]}
            activeRouteId={trip.route.routeId}
            teenLocation={trip.location}
            trail={locationUpdates
              .slice()
              .reverse()
              .map((update) => [update.lat, update.lng])}
            height={650}
          />

          <div className="guardian-map-card">
            <div className="teen-avatar teen-avatar-small">{users.teen.name.charAt(0)}</div>
            <div>
              <span>{users.teen.name} is heading to</span>
              <strong>{trip.destination.name}</strong>
            </div>
            <div className="eta-chip">
              <Clock size={16} weight="bold" aria-hidden="true" />
              {trip.etaMinutes} min
            </div>
          </div>
        </div>

        <div className="guardian-trip-facts">
          <div>
            <Footprints size={20} weight="bold" aria-hidden="true" />
            <span>Selected route</span>
            <strong>{trip.route.label}</strong>
          </div>
          <div>
            <ShieldCheck size={20} weight="fill" aria-hidden="true" />
            <span>Route conditions</span>
            <strong>{conditionScore(trip.route)}/100</strong>
          </div>
          <div>
            <MapPin size={20} weight="fill" aria-hidden="true" />
            <span>Distance from route</span>
            <strong>{trip.offRouteMeters ?? 0} m</strong>
          </div>
          <div>
            <Eye size={20} weight="bold" aria-hidden="true" />
            <span>Sharing scope</span>
            <strong>Trip only</strong>
          </div>
        </div>
      </section>

      <aside className="guardian-sidebar">
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

          {alerts.length === 0 ? (
            <div className="calm-alert-state">
              <ShieldCheck size={27} weight="fill" aria-hidden="true" />
              <div>
                <strong>Quiet is the intended state.</strong>
                <p>
                  Escort will check with {users.teen.name} before asking
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
