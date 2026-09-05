import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import RouteCard from "./RouteCard.jsx";

const MapView = dynamic(() => import("./MapView.jsx"), { ssr: false });
import CheckinSheet from "./CheckinSheet.jsx";
import {
  planRoutes,
  startTrip,
  endTrip,
  respondCheckin,
  sendSos,
  zones,
  places,
} from "../actions.js";
import demoRoutes from "../data/demo_routes.json";
import { nearestIndex } from "../logic/geo.js";
import { useStore, setState, getState } from "../store.js";

const QUICK_PICKS = places.filter((place) => place.name !== "Redmond Library");

export default function TeenTripScreen() {
  const { trip, checkin, locationUpdates, simulation } = useStore();
  const [destination, setDestination] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const routes = useMemo(
    () => planRoutes(demoRoutes.destination, demoRoutes.origin),
    [],
  );
  const active = trip && (trip.status === "active" || trip.status === "alert");

  const trail = locationUpdates
    .slice()
    .reverse()
    .map((update) => [update.lat, update.lng]);

  if (active) {
    const arrival = new Date(Date.now() + trip.etaMinutes * 60000);
    return (
      <div className="screen">
        <div className="status-banner">
          <div>
            <span className="kicker">Trip active</span>
            <h2>{trip.destination.name}</h2>
            <p>
              ETA{" "}
              {arrival.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              · {trip.route.label} route ·{" "}
              <span
                className={`pill pill-${trip.route.riskLevel.toLowerCase()}`}
              >
                {trip.route.riskLevel} risk
              </span>
            </p>
          </div>
          <span className="live-dot">Parent notified</span>
        </div>

        <MapView
          zones={zones}
          places={places}
          routes={[trip.route]}
          activeRouteId={trip.route.routeId}
          teenLocation={trip.location}
          trail={trail}
          follow
          height={300}
        />

        <div className="trip-stats">
          <div>
            <span>Off route by</span>
            <strong>{trip.offRouteMeters ?? 0} m</strong>
          </div>
          <div>
            <span>Stopped</span>
            <strong>{Math.round(simulation.minutesStopped)} min</strong>
          </div>
          <div>
            <span>Remaining</span>
            <strong>{trip.etaMinutes} min</strong>
          </div>
        </div>

        <div className="action-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => endTrip("completed")}
          >
            I arrived safely
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const state = getState();
              setState({
                simulation: {
                  ...state.simulation,
                  offRoute: false,
                  stopped: false,
                  minutesStopped: 0,
                  index: nearestIndex(
                    state.trip.location,
                    state.trip.route.points,
                  ),
                },
              });
            }}
          >
            Back on route
          </button>
          <button type="button" className="btn btn-danger" onClick={sendSos}>
            Need help
          </button>
        </div>

        <CheckinSheet checkin={checkin} onRespond={respondCheckin} />
      </div>
    );
  }

  if (!destination) {
    return (
      <div className="screen">
        <h1>Where are you going?</h1>
        <p className="muted">
          GuardianRoute plans the trip, watches it, and only wakes your parent
          if something changes.
        </p>
        <input
          className="input"
          placeholder="Search a destination"
          readOnly
          value="Home"
        />
        <div className="quick-picks">
          {QUICK_PICKS.map((place) => (
            <button
              key={place.id}
              type="button"
              className="chip"
              onClick={() =>
                setDestination(
                  place.name === "Home"
                    ? demoRoutes.destination
                    : demoRoutes.destination,
                )
              }
            >
              {place.name}
            </button>
          ))}
        </div>
        <MapView zones={zones} places={places} height={260} />
        <p className="footnote">
          Demo incident zones seeded from Redmond public crime and traffic
          safety data.
        </p>
      </div>
    );
  }

  return (
    <div className="screen">
      <button
        type="button"
        className="link-back"
        onClick={() => setDestination(null)}
      >
        Change destination
      </button>
      <h1>Choose your route</h1>
      <p className="muted">
        {demoRoutes.origin.name} to {demoRoutes.destination.name}
      </p>
      <MapView
        zones={zones}
        places={places}
        routes={routes}
        activeRouteId={selectedRoute ? selectedRoute.routeId : null}
        height={260}
      />
      <div className="route-list">
        {routes.map((route) => (
          <RouteCard
            key={route.routeId}
            route={route}
            selected={selectedRoute && selectedRoute.routeId === route.routeId}
            onSelect={setSelectedRoute}
          />
        ))}
      </div>
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!selectedRoute}
        onClick={() => startTrip(selectedRoute)}
      >
        {selectedRoute
          ? `Start trip on the ${selectedRoute.label} route`
          : "Pick a route to start"}
      </button>
    </div>
  );
}
