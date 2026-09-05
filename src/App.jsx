"use client";

import { useEffect, useMemo, useState } from "react";
import TeenTripScreen from "./components/TeenTripScreen.jsx";
import ParentDashboard from "./components/ParentDashboard.jsx";
import { useStore, setState, getState, resetDemo } from "./store.js";
import { pushLocation, expireCheckin, endTrip } from "./actions.js";
import { interpolatePath, nearestIndex } from "./logic/geo.js";
import demoRoutes from "./data/demo_routes.json";

const deviationPoints = interpolatePath(demoRoutes.deviationPath, 40);

export default function App() {
  const [mode, setMode] = useState("teen");
  const { trip, checkin, simulation } = useStore();
  const active = trip && (trip.status === "active" || trip.status === "alert");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hashMode = window.location.hash === "#parent" ? "parent" : "teen";
    setMode(hashMode);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.location.hash = mode === "parent" ? "#parent" : "#teen";
  }, [mode]);

  useEffect(() => {
    const id = setInterval(() => {
      const state = getState();
      const current = state.trip;
      if (
        !current ||
        (current.status !== "active" && current.status !== "alert")
      )
        return;

      if (
        state.checkin &&
        state.checkin.status === "waiting" &&
        Date.now() >= state.checkin.expiresAt
      ) {
        expireCheckin();
        return;
      }

      const sim = state.simulation;
      if (!sim.running) return;
      if (sim.lastTickAt && Date.now() - sim.lastTickAt < 900) return;

      if (sim.stopped) {
        const minutesStopped = sim.minutesStopped + 1;
        setState({
          simulation: { ...sim, minutesStopped, lastTickAt: Date.now() },
        });
        pushLocation(current.location, { speed: 0 });
        return;
      }

      const path = sim.offRoute ? deviationPoints : current.route.points;
      const nextIndex = Math.min(sim.index + 1, path.length - 1);
      setState({
        simulation: {
          ...sim,
          index: nextIndex,
          minutesStopped: 0,
          lastTickAt: Date.now(),
        },
      });
      pushLocation(path[nextIndex], { speed: 1.4 });

      if (!sim.offRoute && nextIndex === path.length - 1) endTrip("completed");
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const controls = useMemo(
    () => [
      {
        label: simulation.stopped ? "Resume walking" : "Stop here",
        disabled: !active,
        onClick: () =>
          setState({
            simulation: {
              ...getState().simulation,
              stopped: !simulation.stopped,
              minutesStopped: 0,
            },
          }),
      },
      {
        label: simulation.offRoute ? "Return to route" : "Take a detour",
        disabled: !active,
        onClick: () => {
          const state = getState();
          const sim = state.simulation;
          const goingOffRoute = !sim.offRoute;
          const index = goingOffRoute
            ? nearestIndex(state.trip.location, deviationPoints)
            : nearestIndex(state.trip.location, state.trip.route.points);
          setState({
            simulation: {
              ...sim,
              offRoute: goingOffRoute,
              index,
              stopped: false,
              minutesStopped: 0,
            },
          });
        },
      },
      { label: "Reset demo", disabled: false, onClick: resetDemo },
    ],
    [active, simulation.stopped, simulation.offRoute],
  );

  return (
    <div className="app">
      <header className="app-bar">
        <div className="brand">
          <span className="brand-mark">GR</span>
          <div>
            <strong>GuardianRoute</strong>
            <span className="tagline">
              From passive tracking to proactive protection
            </span>
          </div>
        </div>
        <div className="mode-toggle">
          <button
            type="button"
            className={mode === "teen" ? "active" : ""}
            onClick={() => setMode("teen")}
          >
            Teen
          </button>
          <button
            type="button"
            className={mode === "parent" ? "active" : ""}
            onClick={() => setMode("parent")}
          >
            Parent
            {mode !== "parent" && checkin && checkin.status === "expired" && (
              <span className="dot" />
            )}
          </button>
        </div>
      </header>

      <main>{mode === "teen" ? <TeenTripScreen /> : <ParentDashboard />}</main>

      <footer className="demo-bar">
        <span className="demo-label">Demo controls</span>
        <div className="demo-buttons">
          {controls.map((control) => (
            <button
              key={control.label}
              type="button"
              disabled={control.disabled}
              onClick={control.onClick}
            >
              {control.label}
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
