"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  Bus,
  Check,
  Clock,
  Footprints,
  Info,
  MapPin,
  NavigationArrow,
  Path,
  ShieldCheck,
  Siren,
  Sparkle,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import RouteCard from "./RouteCard.jsx";
import CheckinSheet from "./CheckinSheet.jsx";
import DangerBox from "./DangerBox.jsx";
import StreetLevelView from "./StreetLevelView.jsx";
import MapSplit from "./MapSplit.jsx";
import SosSheet from "./SosSheet.jsx";
import {
  incidentsNearRoute,
  nearestSafePlaces,
  shortPlaceName,
  routeDangerSummary,
} from "../logic/safetyInsights.js";
import {
  startTrip,
  endTrip,
  expireCheckin,
  respondCheckin,
  sendSos,
  clearSos,
  places,
} from "../actions.js";
import demoRoutes from "../data/demo_routes.json";
import { nearestIndex } from "../logic/geo.js";
import { routeProgress } from "../logic/routeDeviation.js";
import { useStore, setState, getState } from "../store.js";
import { formatMinutes } from "../logic/duration.js";

const MapView = dynamic(() => import("./MapView.jsx"), {
  ssr: false,
  loading: () => (
    <div className="map-loading" role="status">
      <span />
      Preparing the map
    </div>
  ),
});

function routeCondition(route) {
  return route.safetyScore?.toFixed(1) ?? "—";
}

function TravelModeToggle({ value, onChange }) {
  return (
    <div className="travel-toggle" aria-label="Travel mode">
      <button
        type="button"
        className={value === "walking" ? "active" : ""}
        aria-pressed={value === "walking"}
        onClick={() => onChange("walking")}
      >
        Walking
      </button>
      <button
        type="button"
        className={value === "transit" ? "active" : ""}
        aria-pressed={value === "transit"}
        onClick={() => onChange("transit")}
      >
        Transit
      </button>
    </div>
  );
}

function StartTripSheet({ route, guardianName, onClose, onConfirm }) {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!route) return null;

  const eta = new Date(Date.now() + route.durationMinutes * 60000);
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="sheet consent-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <button
          ref={closeRef}
          type="button"
          className="icon-button sheet-close"
          onClick={onClose}
          aria-label="Close trip sharing details"
        >
          <X size={20} weight="bold" aria-hidden="true" />
        </button>

        <div className="consent-icon" aria-hidden="true">
          <ShieldCheck size={30} weight="fill" />
        </div>
        <p className="sheet-kicker">You stay in control</p>
        <h2 id="consent-title">Start this Safe Trip?</h2>
        <p className="sheet-reason">
          Your location is shared with {guardianName} only while this trip is
          active. Sentinel looks for sustained changes, not single noisy
          readings.
        </p>

        <div className="consent-route">
          <div>
            <span>Expected arrival</span>
            <strong>
              {eta.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </strong>
          </div>
          <div>
            <span>Safety Score</span>
            <strong>{routeCondition(route)}/10</strong>
          </div>
        </div>

        <p className="consent-note">
          Shared only while the trip is active: distance from the route,
          unexpected stops, and arrival against the expected time.
        </p>

        <div className="consent-actions">
          <button
            type="button"
            className="button button-lime button-large consent-start"
            onClick={onConfirm}
          >
            <ShieldCheck size={19} weight="fill" aria-hidden="true" />
            Start Safe Trip
          </button>
          <button type="button" className="consent-dismiss" onClick={onClose}>
            Not right now
          </button>
        </div>
      </section>
    </div>
  );
}

function ActiveTripView({
  trip,
  checkin,
  locationUpdates,
  simulation,
  sos,
  guardian,
}) {
  const progress = Math.round(
    routeProgress(trip.location, trip.route.points) * 100,
  );
  const arrival = new Date(Date.now() + trip.etaMinutes * 60000);
  const trail = locationUpdates
    .slice()
    .reverse()
    .map((update) => [update.lat, update.lng]);

  const state =
    trip.status === "alert"
      ? "alerted"
      : checkin?.status === "waiting"
        ? "checkin"
        : simulation.offRoute || simulation.stopped
          ? "anomaly"
          : "normal";

  const directions =
    trip.mode === "transit" && trip.route.legs?.length
      ? trip.route.legs.map((leg) => {
          const legType = String(leg.type || leg.mode).toLowerCase();
          if (legType === "wait") {
            return {
              icon: Clock,
              title: `Wait at ${leg.at || "the stop"}`,
              detail: `${formatMinutes(leg.durationMinutes ?? 0)} expected · ${leg.wellLit ? "mapped lighting nearby" : "live arrival monitored"}`,
            };
          }
          if (legType === "transit" || legType === "bus") {
            const liveDetail = leg.realTime ? " · live arrival" : "";
            const stopDetail = Number.isFinite(leg.stopCount)
              ? ` · ${leg.stopCount} stops`
              : "";
            return {
              icon: Bus,
              title: `${leg.routeShortName || "Bus"} toward ${leg.headsign || leg.to}`,
              detail: `${formatMinutes(leg.durationMinutes ?? 0)}${stopDetail}${liveDetail}`,
            };
          }
          return {
            icon: Footprints,
            title: `Walk to ${shortPlaceName(leg.to || trip.destination.name)}`,
            detail: `${formatMinutes(leg.durationMinutes ?? 0)} walking`,
          };
        })
      : trip.route.instructions?.length
        ? trip.route.instructions.slice(0, 5).map((step) => ({
            icon: NavigationArrow,
            title: step.instruction || "Continue on the walking route",
            detail: step.distanceMeters
              ? `${Math.max(10, Math.round(step.distanceMeters / 10) * 10)} m`
              : "Follow the mapped route",
          }))
        : [
            {
              icon: NavigationArrow,
              title: "Continue toward NE 85th Street",
              detail: "Stay on the selected, well-traveled route",
            },
            {
              icon: ArrowRight,
              title: "Turn right on 156th Avenue NE",
              detail: "Main-road lighting continues for 0.8 mi",
            },
            {
              icon: MapPin,
              title: `Arrive at ${shortPlaceName(trip.destination.name)}`,
              detail: `${formatMinutes(trip.etaMinutes)} remaining`,
            },
          ];

  return (
    <div className="map-viewport">
      {/* Map and street-level corridor, proportioned by a draggable divider. */}
      <div className="map-base">
        <MapSplit
          map={
            <>
              <MapView
                zones={trip.route.contextFactors || []}
                routes={[trip.route]}
                activeRouteId={trip.route.routeId}
                teenLocation={trip.location}
                trail={trail}
                follow
                height="100%"
              />
              <div className="map-trip-chip">
                <ShieldCheck size={17} weight="fill" aria-hidden="true" />
                Route shared with your guardian
              </div>
            </>
          }
          street={
            <StreetLevelView
              points={trip.route.points}
              position={trip.location}
              incidents={trip.route.contextFactors || []}
              title="Around you right now"
              subtitle="Following your position · past reports flagged"
              fill
            />
          }
        />
      </div>

      <aside className="sidebar-float active-sidebar-float">
        <div className="active-trip-topline">
          <div className="live-indicator">
            <span />
            Safe Trip active
          </div>
          <span>{progress}% complete</span>
        </div>

        <div className="active-destination">
          <span>Heading to</span>
          <h2 title={trip.destination.name}>
            {shortPlaceName(trip.destination.name)}
          </h2>
          <p>
            Arrive around{" "}
            {arrival.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>

        <div
          className="progress-track"
          aria-label={`${progress}% of trip complete`}
        >
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="guardian-state" aria-live="polite">
          <div className={`guardian-state-icon guardian-state-${state}`}>
            {state === "alerted" ? (
              <Siren size={22} weight="fill" aria-hidden="true" />
            ) : (
              <ShieldCheck size={22} weight="fill" aria-hidden="true" />
            )}
          </div>
          <div>
            <strong>
              {state === "normal" && "Everything matches the plan"}
              {state === "anomaly" && "Guardian is watching the change"}
              {state === "checkin" && "A quick check-in is open"}
              {state === "alerted" && "Your guardian has been notified"}
            </strong>
            <p>
              {state === "normal" &&
                "No action needed. Your guardian sees a calm status."}
              {state === "anomaly" &&
                "No alert yet. A sustained change triggers a check-in first."}
              {state === "checkin" &&
                "Reply in the open prompt so the trip can continue quietly."}
              {state === "alerted" &&
                "Your last location and planned route are visible to them."}
            </p>
          </div>
        </div>

        <div className="trip-metrics">
          <div>
            <span>Remaining</span>
            <strong>{formatMinutes(trip.etaMinutes)}</strong>
          </div>
          <div>
            <span>From route</span>
            <strong>{trip.offRouteMeters ?? 0} m</strong>
          </div>
          <div>
            <span>Safety Score</span>
            <strong>{routeCondition(trip.route)}/10</strong>
          </div>
        </div>

        <div className="next-steps">
          <h3>Up next</h3>
          {directions.slice(0, 2).map((direction, index) => {
            const Icon = direction.icon;
            return (
              <div
                className={index === 0 ? "direction active" : "direction"}
                key={`${direction.title}-${index}`}
              >
                <span className="direction-icon">
                  <Icon size={17} weight="bold" aria-hidden="true" />
                </span>
                <div>
                  <strong>{direction.title}</strong>
                  <span>{direction.detail}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="active-actions">
          <button
            type="button"
            className="button button-lime button-large"
            onClick={() => endTrip("completed")}
            title="Tell your guardian you've safely arrived at your destination"
          >
            <Check size={20} weight="bold" aria-hidden="true" />I arrived safely
          </button>
          <button
            type="button"
            className="button button-danger button-urgent"
            onClick={sendSos}
            title="Send immediate alert to your guardian"
            aria-label="Send emergency alert to guardian"
          >
            <Siren size={20} weight="fill" aria-hidden="true" />I need help NOW
          </button>
        </div>
      </aside>

      <CheckinSheet
        checkin={checkin}
        onRespond={respondCheckin}
        onExpire={expireCheckin}
      />

      <SosSheet
        sos={sos}
        guardian={guardian}
        safePlaces={nearestSafePlaces(places, trip.location)}
        onClear={clearSos}
      />
    </div>
  );
}

export default function TeenTripScreen() {
  const { trip, checkin, locationUpdates, simulation, users, sos, reports } =
    useStore();
  const [originName, setOriginName] = useState("Redmond Library, Redmond, WA");
  const [destinationName, setDestinationName] = useState(
    "Downtown Redmond Station, Redmond, WA",
  );
  const [travelMode, setTravelMode] = useState("walking");
  const [safetyMode, setSafetyMode] = useState("day");
  const [plan, setPlan] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [planningError, setPlanningError] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [replanToken, setReplanToken] = useState(0);
  const requestRef = useRef(null);

  const routes = plan?.routes || [];
  const incidents = useMemo(
    () => [...(reports || []), ...(plan?.incidents || [])],
    [reports, plan],
  );
  // Counts must describe every report within the corridor, not just the
  // handful the panel lists — otherwise "12 of them serious" is only ever
  // reporting the display cap back to the user.
  const allNearbyIncidents = useMemo(
    () =>
      incidentsNearRoute(incidents, selectedRoute, {
        withinMeters: 400,
        limit: Number.MAX_SAFE_INTEGER,
      }),
    [incidents, selectedRoute],
  );
  const nearbyIncidents = useMemo(
    () => allNearbyIncidents.slice(0, 12),
    [allNearbyIncidents],
  );
  const compareRoutes = useCallback(async () => {
    const origin = originName.trim();
    const destination = destinationName.trim();
    if (!origin || !destination || isComparing) return;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsComparing(true);
    setPlanningError(null);

    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          origin,
          destination,
          mode: travelMode,
          safetyMode,
          maxCandidates: 3,
        }),
      });
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : { ok: false, error: { message: `Planning service returned ${response.status}. Restart the app server and try again.` } };
      if (requestRef.current !== controller || controller.signal.aborted) return;
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload?.error?.message || "Sentinel could not plan this trip.",
        );
      }

      const contextFactors = payload.incidents || [];
      setPlan({
        ...payload,
        routes: payload.routes.map((route) => ({
          ...route,
          contextFactors,
          dataMetadata: payload.metadata,
        })),
      });
    } catch (error) {
      if (error.name === "AbortError" || requestRef.current !== controller) return;
      setPlan(null);
      setPlanningError(error.message);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsComparing(false);
      }
    }
  }, [safetyMode, destinationName, isComparing, originName, travelMode]);

  useEffect(() => {
    const initialRequest = window.setTimeout(() => compareRoutes(), 100);
    return () => window.clearTimeout(initialRequest);
    // Run once with the intentional default trip. Subsequent input changes are
    // explicit so public geocoding is never called on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (replanToken === 0) return;
    compareRoutes();
    // Deliberate single-click changes (travel mode, departure time) bump the
    // token so results refresh straight away. compareRoutes is excluded on
    // purpose: it is rebuilt on every input change, and typing must not replan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replanToken]);

  const replanNow = () => setReplanToken((token) => token + 1);

  useEffect(() => {
    setSelectedRoute(
      routes.find((route) => route.recommended) || routes[0] || null,
    );
  }, [routes]);

  const invalidatePlan = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    setIsComparing(false);
    setPlan(null);
    setSelectedRoute(null);
    setPlanningError(null);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setPlanningError("This browser does not expose the current location.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setOriginName(
          `${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)}`,
        );
        invalidatePlan();
        setIsLocating(false);
      },
      () => {
        setPlanningError(
          "Location access was unavailable. Enter a starting point instead.",
        );
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 },
    );
  };

  const active = trip && (trip.status === "active" || trip.status === "alert");
  if (active) {
    return (
      <ActiveTripView
        trip={trip}
        checkin={checkin}
        locationUpdates={locationUpdates}
        simulation={simulation}
        sos={sos}
        guardian={users?.parent}
      />
    );
  }

  return (
    <div className="map-viewport">
      {/* Map on the left, street-level preview of the selected route right. */}
      <div className="map-base">
        <MapSplit
          collapsed={!selectedRoute}
          map={
            <>
              <MapView
                zones={incidents}
                routes={routes}
                activeRouteId={selectedRoute?.routeId}
                onRouteSelect={(route) => setSelectedRoute(route)}
                height="100%"
              />
              {!plan && !isComparing && (
                <div className="map-resting-message planner-map-message">
                  <Path size={24} weight="bold" aria-hidden="true" />
                  <div>
                    <strong>Ready for any point-to-point trip</strong>
                    <span>
                      Enter place names, addresses, or latitude/longitude pairs.
                    </span>
                  </div>
                </div>
              )}
            </>
          }
          street={
            selectedRoute ? (
              <StreetLevelView
                points={selectedRoute.points}
                incidents={nearbyIncidents}
                title="Preview the route"
                subtitle="Street-level imagery · past reports flagged"
                fill
              />
            ) : null
          }
        />
      </div>

      {/* Floating left sidebar */}
      <aside className="sidebar-float">
        <div className="route-form">
          <div className="route-field">
            <span
              className="field-marker field-marker-origin"
              aria-hidden="true"
            />
            <label htmlFor="origin">Starting point</label>
            <input
              id="origin"
              value={originName}
              onChange={(event) => {
                setOriginName(event.target.value);
                invalidatePlan();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") compareRoutes();
              }}
              placeholder="Place, address, or lat,lng"
              autoComplete="street-address"
            />
          </div>

          <div className="route-field">
            <span
              className="field-marker field-marker-destination"
              aria-hidden="true"
            />
            <label htmlFor="destination">Destination</label>
            <input
              id="destination"
              value={destinationName}
              onChange={(event) => {
                setDestinationName(event.target.value);
                invalidatePlan();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") compareRoutes();
              }}
              placeholder="Place, address, or lat,lng"
              autoComplete="street-address"
            />
          </div>
        </div>

        <TravelModeToggle
          value={travelMode}
          onChange={(nextMode) => {
            if (nextMode === travelMode) return;
            setTravelMode(nextMode);
            invalidatePlan();
            replanNow();
          }}
        />

        <div className="travel-toggle" aria-label="Safety mode">
          {["day", "night"].map((mode) => (
            <button
              key={mode}
              type="button"
              className={safetyMode === mode ? "active" : ""}
              aria-pressed={safetyMode === mode}
              onClick={() => {
                if (mode === safetyMode) return;
                setSafetyMode(mode);
                invalidatePlan();
                replanNow();
              }}
            >
              {mode === "day" ? "Day" : "Night"}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="button button-lime button-block"
          onClick={compareRoutes}
          disabled={
            !originName.trim() || !destinationName.trim() || isComparing
          }
        >
          {isComparing ? (
            <>
              <ArrowsClockwise
                className="spin"
                size={18}
                weight="bold"
                aria-hidden="true"
              />
              Building route candidates…
            </>
          ) : (
            <>
              Compare routes
              <ArrowRight size={18} weight="bold" aria-hidden="true" />
            </>
          )}
        </button>

        {planningError && (
          <div className="planner-error" role="alert">
            <WarningCircle size={18} weight="fill" aria-hidden="true" />
            <div>
              <strong>Route unavailable</strong>
              <span>{planningError}</span>
            </div>
          </div>
        )}

        {plan && routes.length > 0 && (
          <div className="route-results">
            <div className="results-heading">
              <strong>
                {routes.length}{" "}
                {travelMode === "walking" ? "walking" : "transit"} options
              </strong>
            </div>

            <div className="route-list" role="list" aria-label="Route options">
              {routes.map((route) => (
                <RouteCard
                  key={route.routeId}
                  route={route}
                  selected={selectedRoute?.routeId === route.routeId}
                  onSelect={setSelectedRoute}
                  danger={routeDangerSummary(route, incidents)}
                />
              ))}
            </div>

            <button
              type="button"
              className="button button-lime button-block start-trip-button"
              disabled={!selectedRoute}
              onClick={() => setConsentOpen(true)}
            >
              <ShieldCheck size={19} weight="fill" aria-hidden="true" />
              Start Safe Trip
              <ArrowRight size={18} weight="bold" aria-hidden="true" />
            </button>
          </div>
        )}
      </aside>

      {consentOpen && (
        <StartTripSheet
          route={selectedRoute}
          guardianName={users.parent.name}
          onClose={() => setConsentOpen(false)}
          onConfirm={() => {
            startTrip(selectedRoute);
            setConsentOpen(false);
          }}
        />
      )}
    </div>
  );
}
