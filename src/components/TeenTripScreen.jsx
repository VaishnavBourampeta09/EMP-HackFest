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
import SafetyAlertsPanel from "./SafetyAlertsPanel.jsx";
import RouteComparisonInfo from "./RouteComparisonInfo.jsx";
import LocationPermissionPrompt from "./LocationPermissionPrompt.jsx";
import SimulationModeBanner from "./SimulationModeBanner.jsx";
import DangerBox from "./DangerBox.jsx";
import ReportDangerButton from "./ReportDangerButton.jsx";
import SimulationControls from "./SimulationControls.jsx";
import StreetLevelView from "./StreetLevelView.jsx";
import SosSheet from "./SosSheet.jsx";
import {
  incidentsNearRoute,
  isAfterDark,
  routeWarnings,
  summarizeIncidents,
  nearestSafePlaces,
  shortPlaceName,
} from "../logic/safetyInsights.js";
import {
  lightingForRoute,
  lightingVerdict,
  routeBbox,
} from "../logic/lighting.js";
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
  return route.conditionScore ?? Math.max(0, 100 - route.riskScore);
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
        <Footprints size={18} weight="bold" aria-hidden="true" />
        Walking
      </button>
      <button
        type="button"
        className={value === "transit" ? "active" : ""}
        aria-pressed={value === "transit"}
        onClick={() => onChange("transit")}
      >
        <Bus size={18} weight="bold" aria-hidden="true" />
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
  const sharingItems = [
    "Distance from the selected route",
    "Unexpected stops and missed progress",
    "Arrival compared with the expected ETA",
  ];

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
              {eta.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </strong>
          </div>
          <div>
            <span>Selected route</span>
            <strong>{route.label}</strong>
          </div>
          <div>
            <span>Route conditions</span>
            <strong>{routeCondition(route)}/100</strong>
          </div>
        </div>

        <div className="consent-list">
          {sharingItems.map((item) => (
            <div key={item}>
              <Check size={17} weight="bold" aria-hidden="true" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        <div className="sheet-actions consent-actions">
          <button type="button" className="button button-soft" onClick={onClose}>
            Not now
          </button>
          <button type="button" className="button button-lime" onClick={onConfirm}>
            Start trip
            <ArrowRight size={18} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
}

function ActiveTripView({ trip, checkin, locationUpdates, simulation, sos, guardian }) {
  const progress = Math.round(routeProgress(trip.location, trip.route.points) * 100);
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

  const states = [
    { id: "normal", label: "On route" },
    { id: "anomaly", label: "Possible change" },
    { id: "checkin", label: "Teen check-in" },
    { id: "alerted", label: "Guardian alert" },
  ];
  const activeStateIndex = states.findIndex((item) => item.id === state);

  const directions = trip.mode === "transit" && trip.route.legs?.length
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
      {/* Map on the left, street-level corridor on the right. */}
      <div className="map-base map-base-split">
        <div className="map-pane">
          <MapView
            zones={trip.route.contextFactors || []}
            places={places}
            routes={[trip.route]}
            activeRouteId={trip.route.routeId}
            teenLocation={trip.location}
            trail={trail}
            follow
            height="100%"
          />
          <div className="map-trip-chip">
            <ShieldCheck size={17} weight="fill" aria-hidden="true" />
            Planned route visible to your guardian
          </div>
        </div>

        <div className="street-pane">
          <StreetLevelView
            points={trip.route.points}
            position={trip.location}
            incidents={trip.route.contextFactors || []}
            title="Around you right now"
            subtitle="Following your position · past reports flagged"
            fill
          />
        </div>
      </div>

      <aside className="sidebar-float active-sidebar-float">
        {/* Simulation mode indicator */}
        <SimulationModeBanner
          isRunning={simulation.running}
          isStopped={simulation.stopped}
        />

        <div className="active-trip-topline">
          <div className="live-indicator">
            <span />
            Safe Trip active
          </div>
          <span>{progress}% complete</span>
        </div>

        <div className="active-destination">
          <span>Heading to</span>
          <h2 title={trip.destination.name}>{shortPlaceName(trip.destination.name)}</h2>
          <p>
            Arrive around{" "}
            {arrival.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </p>
        </div>

        <div className="progress-track" aria-label={`${progress}% of trip complete`}>
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
              {state === "normal" && "No action needed. Your guardian sees a calm status."}
              {state === "anomaly" && "No alert yet. A sustained change triggers a check-in first."}
              {state === "checkin" && "Reply in the open prompt so the trip can continue quietly."}
              {state === "alerted" && "Your last location and planned route are visible to them."}
            </p>
          </div>
        </div>

        <ol className="state-rail" aria-label="Guardian monitoring sequence">
          {states.map((item, index) => (
            <li
              key={item.id}
              className={index <= activeStateIndex ? "reached" : ""}
              aria-current={index === activeStateIndex ? "step" : undefined}
            >
              <span>{index < activeStateIndex ? <Check size={12} weight="bold" /> : null}</span>
              {item.label}
            </li>
          ))}
        </ol>

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
            <span>Conditions</span>
            <strong>{routeCondition(trip.route)}/100</strong>
          </div>
        </div>

        <div className="next-steps">
          <h3>Up next</h3>
          {directions.slice(0, 3).map((direction, index) => {
            const Icon = direction.icon;
            return (
              <div className={index === 0 ? "direction active" : "direction"} key={`${direction.title}-${index}`}>
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
            <Check size={20} weight="bold" aria-hidden="true" />
            I arrived safely
          </button>
          <button
            type="button"
            className="button button-danger button-urgent"
            onClick={sendSos}
            title="Send immediate alert to your guardian"
            aria-label="Send emergency alert to guardian"
          >
            <Siren size={20} weight="fill" aria-hidden="true" />
            I need help NOW
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
  const { trip, checkin, locationUpdates, simulation, users, sos, reports } = useStore();
  const [originName, setOriginName] = useState("Redmond Library, Redmond, WA");
  const [destinationName, setDestinationName] = useState(
    "Downtown Redmond Station, Redmond, WA",
  );
  const [travelMode, setTravelMode] = useState("walking");
  const [departureTime, setDepartureTime] = useState("20:40");
  const [plan, setPlan] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [planningError, setPlanningError] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [replanToken, setReplanToken] = useState(0);
  const requestRef = useRef(null);

  const currentTime = useMemo(() => {
    const date = new Date();
    const [hours, minutes] = departureTime.split(":").map(Number);
    date.setHours(hours, minutes, 0, 0);
    return date;
  }, [departureTime]);

  const routes = plan?.routes || [];
  const incidents = useMemo(
    () => [...(reports || []), ...(plan?.incidents || [])],
    [reports, plan],
  );
  const afterDark = isAfterDark(currentTime);

  // Real street lamp positions for the selected route's bounding box.
  const [lamps, setLamps] = useState([]);
  const lightingKey = useMemo(() => {
    const box = routeBbox(selectedRoute?.points ?? []);
    return box ? box.map((n) => n.toFixed(3)).join(",") : null;
  }, [selectedRoute]);

  useEffect(() => {
    if (!lightingKey) {
      setLamps([]);
      return undefined;
    }
    const controller = new AbortController();
    fetch(`/api/lighting?bbox=${encodeURIComponent(lightingKey)}`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((payload) => {
        if (controller.signal.aborted) return;
        setLamps(payload?.ok ? payload.lamps || [] : []);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setLamps([]);
      });
    return () => controller.abort();
  }, [lightingKey]);

  const lighting = useMemo(
    () => lightingForRoute(selectedRoute?.points ?? [], lamps),
    [selectedRoute, lamps],
  );
  const lightVerdict = useMemo(
    () => lightingVerdict(lighting, afterDark),
    [lighting, afterDark],
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
  const incidentSummary = useMemo(
    () => summarizeIncidents(allNearbyIncidents),
    [allNearbyIncidents],
  );
  const warnings = useMemo(
    () =>
      selectedRoute
        ? routeWarnings(selectedRoute, nearbyIncidents, {
            afterDark,
            alternatives: routes,
          })
        : [],
    [selectedRoute, nearbyIncidents, afterDark, routes],
  );
  // The headline hazard: most severe, then most recent, then closest.
  const closestIncident = nearbyIncidents[0] ?? null;

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
          departureTime: currentTime.toISOString(),
          maxCandidates: 3,
        }),
      });
      const payload = await response.json();
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
      if (error.name === "AbortError") return;
      setPlan(null);
      setPlanningError(error.message);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsComparing(false);
      }
    }
  }, [currentTime, destinationName, isComparing, originName, travelMode]);

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
    setSelectedRoute(routes.find((route) => route.recommended) || routes[0] || null);
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
        setOriginName(`${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)}`);
        invalidatePlan();
        setIsLocating(false);
      },
      () => {
        setPlanningError("Location access was unavailable. Enter a starting point instead.");
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
      <div className={`map-base${selectedRoute ? " map-base-split" : ""}`}>
        <div className="map-pane">
        <MapView
          zones={incidents}
          places={places}
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
              <span>Enter place names, full addresses, or latitude/longitude pairs.</span>
            </div>
          </div>
        )}
        {selectedRoute && (
          <div className="map-selection-summary">
            <span className="map-selection-icon">
              {travelMode === "transit" ? (
                <Bus size={20} weight="fill" aria-hidden="true" />
              ) : (
                <Footprints size={20} weight="fill" aria-hidden="true" />
              )}
            </span>
            <div>
              <span>{selectedRoute.recommended ? "Recommended" : "Selected route"}</span>
              <strong>
                {formatMinutes(selectedRoute.durationMinutes)} · {selectedRoute.label}
              </strong>
            </div>
            <div className="map-condition-score">
              <span>Conditions</span>
              <strong>{routeCondition(selectedRoute)}</strong>
            </div>
          </div>
        )}
        </div>

        {selectedRoute && (
          <div className="street-pane">
            <StreetLevelView
              points={selectedRoute.points}
              incidents={nearbyIncidents}
              title="Preview the route"
              subtitle="Street-level imagery · past reports flagged"
              fill
            />
          </div>
        )}
      </div>

      {/* Floating left sidebar */}
      <aside className="sidebar-float">
        {/* Location permission prompt */}
        <LocationPermissionPrompt
          onPermissionRequested={(status) => {
            // Could store in state if needed for future use
          }}
        />

        <div className="planner-sidebar-head">
          <p>Where are you going?</p>
          <h2>Plan your trip</h2>
        </div>

        <div className="route-form">
          <div className="route-field">
            <span className="field-marker field-marker-origin" aria-hidden="true" />
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
            <NavigationArrow size={18} weight="fill" aria-hidden="true" />
          </div>
          <button
            type="button"
            className="swap-route-button"
            aria-label="Swap starting point and destination"
            onClick={() => {
              setOriginName(destinationName);
              setDestinationName(originName);
              invalidatePlan();
            }}
          >
            <ArrowsClockwise size={15} weight="bold" aria-hidden="true" />
          </button>
          <span className="field-connector" aria-hidden="true" />
          <div className="route-field">
            <span className="field-marker field-marker-destination" aria-hidden="true" />
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
            <MapPin size={19} weight="fill" aria-hidden="true" />
          </div>
        </div>

        <div className="quick-destinations" aria-label="Saved destinations">
          <button type="button" onClick={useCurrentLocation} disabled={isLocating}>
            <NavigationArrow size={13} weight="fill" aria-hidden="true" />
            {isLocating ? "Locating…" : "My location"}
          </button>
          {places
            .filter((place) => place.name !== demoRoutes.origin.name)
            .slice(0, 2)
            .map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={() => {
                  setDestinationName(`${place.name}, Redmond, WA`);
                  invalidatePlan();
                  replanNow();
                }}
              >
                {place.name}
              </button>
            ))}
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

        <div className="departure-row">
          <label htmlFor="departure-time">
            <Clock size={17} weight="bold" aria-hidden="true" />
            Depart at
          </label>
          <input
            id="departure-time"
            type="time"
            value={departureTime}
            onChange={(event) => {
              setDepartureTime(event.target.value);
              invalidatePlan();
            }}
          />
        </div>

        <button
          type="button"
          className="button button-lime button-block"
          onClick={compareRoutes}
          disabled={!originName.trim() || !destinationName.trim() || isComparing}
        >
          {isComparing ? (
            <>
              <ArrowsClockwise className="spin" size={18} weight="bold" aria-hidden="true" />
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
            <div className="resolved-route-points" title={`${plan.origin.name} to ${plan.destination.name}`}>
              <span>{shortPlaceName(plan.origin.name)}</span>
              <ArrowRight size={13} weight="bold" aria-hidden="true" />
              <span>{shortPlaceName(plan.destination.name)}</span>
            </div>
            <div className="results-heading">
              <div>
                <span>{routes.length} reasonable options</span>
                <strong>{travelMode === "walking" ? "Walking" : "Transit"} routes</strong>
              </div>
              <span className="night-weight">
                <Sparkle size={14} weight="fill" aria-hidden="true" />
                {currentTime.getHours() >= 19 || currentTime.getHours() < 6
                  ? "Night weighting"
                  : "Day weighting"}
              </span>
            </div>

            <div className="route-list" role="list" aria-label="Route options">
              {routes.map((route) => (
                <RouteCard
                  key={route.routeId}
                  route={route}
                  selected={selectedRoute?.routeId === route.routeId}
                  onSelect={setSelectedRoute}
                />
              ))}
            </div>

            {selectedRoute && (
              <DangerBox
                incident={closestIncident}
                totalNearby={incidentSummary.total}
                seriousNearby={incidentSummary.serious}
              />
            )}

            <SafetyAlertsPanel
              incidents={nearbyIncidents}
              warnings={warnings}
              lighting={lighting}
              lightingVerdict={lightVerdict}
              summary={incidentSummary}
            />

            <ReportDangerButton location={selectedRoute?.points?.[0] ?? null} />

            <SimulationControls compact />

            <p className="sidebar-note" role="status">
              <Info size={14} weight="fill" aria-hidden="true" />
              Conditions are estimates from public data, not a guarantee of
              safety.{" "}
              {plan.metadata?.incidents?.live
                ? `${plan.metadata.incidents.scoredCount ?? incidents.length} live Redmond records scored.`
                : "Live Redmond feed unavailable."}
            </p>

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
