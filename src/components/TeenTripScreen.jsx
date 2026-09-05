"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ArrowRight,
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
  X,
} from "@phosphor-icons/react";
import RouteCard from "./RouteCard.jsx";
import CheckinSheet from "./CheckinSheet.jsx";
import {
  planRoutes,
  startTrip,
  endTrip,
  expireCheckin,
  respondCheckin,
  sendSos,
  zones,
  places,
} from "../actions.js";
import demoRoutes from "../data/demo_routes.json";
import { nearestIndex } from "../logic/geo.js";
import { routeProgress } from "../logic/routeDeviation.js";
import { useStore, setState, getState } from "../store.js";

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
          active. GuardianRoute looks for sustained changes, not single noisy
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

function ActiveTripView({ trip, checkin, locationUpdates, simulation }) {
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

  const directions = trip.route.legs?.length
    ? trip.route.legs.map((leg) => {
        const legType = String(leg.type || leg.mode).toLowerCase();
        if (legType === "wait") {
          return {
            icon: Clock,
            title: `Wait at ${leg.at || "the stop"}`,
            detail: `${leg.durationMinutes ?? 0} min expected · ${leg.wellLit ? "mapped lighting nearby" : "live arrival monitored"}`,
          };
        }
        if (legType === "transit" || legType === "bus") {
          return {
            icon: Bus,
            title: `${leg.routeShortName || "Bus"} toward ${leg.headsign || leg.to}`,
            detail: `${leg.durationMinutes ?? 0} min · ${leg.stopCount ?? 0} stops`,
          };
        }
        return {
          icon: Footprints,
          title: `Walk to ${leg.to || trip.destination.name}`,
          detail: `${leg.durationMinutes ?? 0} min walking`,
        };
      })
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
          title: `Arrive at ${trip.destination.name}`,
          detail: `${trip.etaMinutes} min remaining`,
        },
      ];

  return (
    <div className="active-trip-layout">
      <aside className="active-trip-panel">
        <div className="active-trip-topline">
          <div className="live-indicator">
            <span />
            Safe Trip active
          </div>
          <span>{progress}% complete</span>
        </div>

        <div className="active-destination">
          <span>Heading to</span>
          <h2>{trip.destination.name}</h2>
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
            <strong>{trip.etaMinutes} min</strong>
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
            className="button button-lime"
            onClick={() => endTrip("completed")}
          >
            <Check size={18} weight="bold" aria-hidden="true" />
            I arrived
          </button>
          <button
            type="button"
            className="button button-soft"
            onClick={() => {
              const current = getState();
              setState({
                simulation: {
                  ...current.simulation,
                  offRoute: false,
                  stopped: false,
                  minutesStopped: 0,
                  index: nearestIndex(current.trip.location, current.trip.route.points),
                },
              });
            }}
          >
            <Path size={18} weight="bold" aria-hidden="true" />
            Back on route
          </button>
          <button type="button" className="button button-danger" onClick={sendSos}>
            <Siren size={18} weight="fill" aria-hidden="true" />
            Need help
          </button>
        </div>
      </aside>

      <div className="active-map-panel">
        <MapView
          zones={zones}
          places={places}
          routes={[trip.route]}
          activeRouteId={trip.route.routeId}
          teenLocation={trip.location}
          trail={trail}
          follow
          height={680}
        />
        <div className="map-trip-chip">
          <ShieldCheck size={17} weight="fill" aria-hidden="true" />
          Planned route visible to your guardian
        </div>
      </div>

      <CheckinSheet
        checkin={checkin}
        onRespond={respondCheckin}
        onExpire={expireCheckin}
      />
    </div>
  );
}

export default function TeenTripScreen() {
  const { trip, checkin, locationUpdates, simulation, users } = useStore();
  const [destinationName, setDestinationName] = useState(demoRoutes.destination.name);
  const [originName] = useState(demoRoutes.origin.name);
  const [destination, setDestination] = useState(demoRoutes.destination);
  const [travelMode, setTravelMode] = useState("walking");
  const [departureTime, setDepartureTime] = useState("20:40");
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [isComparing, setIsComparing] = useState(false);

  const currentTime = useMemo(() => {
    const date = new Date();
    const [hours, minutes] = departureTime.split(":").map(Number);
    date.setHours(hours, minutes, 0, 0);
    return date;
  }, [departureTime]);

  const routes = useMemo(
    () =>
      destination
        ? planRoutes(destination, demoRoutes.origin, {
            mode: travelMode,
            currentTime,
          })
        : [],
    [currentTime, destination, travelMode],
  );

  useEffect(() => {
    setSelectedRoute(routes.find((route) => route.recommended) || routes[0] || null);
  }, [routes]);

  const active = trip && (trip.status === "active" || trip.status === "alert");
  if (active) {
    return (
      <ActiveTripView
        trip={trip}
        checkin={checkin}
        locationUpdates={locationUpdates}
        simulation={simulation}
      />
    );
  }

  const compareRoutes = () => {
    if (!destinationName.trim()) return;
    setIsComparing(true);
    window.setTimeout(() => {
      setDestination(demoRoutes.destination);
      setIsComparing(false);
    }, 540);
  };

  return (
    <div className="route-planner-layout">
      <aside className="route-planner-sidebar">
        <div className="planner-sidebar-head">
          <p>Where are you going?</p>
          <h2>Plan your trip</h2>
        </div>

        <div className="route-form">
          <div className="route-field">
            <span className="field-marker field-marker-origin" aria-hidden="true" />
            <label htmlFor="origin">Starting point</label>
            <input id="origin" value={originName} readOnly />
            <NavigationArrow size={18} weight="fill" aria-hidden="true" />
          </div>
          <span className="field-connector" aria-hidden="true" />
          <div className="route-field">
            <span className="field-marker field-marker-destination" aria-hidden="true" />
            <label htmlFor="destination">Destination</label>
            <input
              id="destination"
              value={destinationName}
              onChange={(event) => {
                setDestinationName(event.target.value);
                setDestination(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") compareRoutes();
              }}
              placeholder="Search Redmond"
            />
            <MapPin size={19} weight="fill" aria-hidden="true" />
          </div>
        </div>

        <div className="quick-destinations" aria-label="Saved destinations">
          {places
            .filter((place) => place.name !== demoRoutes.origin.name)
            .slice(0, 3)
            .map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={() => {
                  setDestinationName(place.name);
                  setDestination(demoRoutes.destination);
                }}
              >
                {place.name}
              </button>
            ))}
        </div>

        <TravelModeToggle
          value={travelMode}
          onChange={(nextMode) => setTravelMode(nextMode)}
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
            onChange={(event) => setDepartureTime(event.target.value)}
          />
        </div>

        {!destination && (
          <button
            type="button"
            className="button button-lime button-block"
            onClick={compareRoutes}
            disabled={!destinationName.trim() || isComparing}
          >
            {isComparing ? "Comparing reasonable routes…" : "Compare routes"}
          </button>
        )}

        {destination && (
          <div className="route-results">
            <div className="results-heading">
              <div>
                <span>{routes.length} reasonable options</span>
                <strong>{travelMode === "walking" ? "Walking" : "Transit"} routes</strong>
              </div>
              <span className="night-weight">
                <Sparkle size={14} weight="fill" aria-hidden="true" />
                Night weighting
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

            <div className="score-disclaimer">
              <Info size={16} weight="fill" aria-hidden="true" />
              <p>
                Route conditions are estimates from objective environmental
                factors, not a guarantee of personal safety.
              </p>
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

      <div className="route-map-panel">
        <MapView
          zones={zones}
          places={places}
          routes={routes}
          activeRouteId={selectedRoute?.routeId}
          onRouteSelect={(route) => setSelectedRoute(route)}
          height={720}
        />
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
                {selectedRoute.durationMinutes} min · {selectedRoute.label}
              </strong>
            </div>
            <div className="map-condition-score">
              <span>Conditions</span>
              <strong>{routeCondition(selectedRoute)}</strong>
            </div>
          </div>
        )}
      </div>

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
