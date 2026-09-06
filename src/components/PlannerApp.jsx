"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowCounterClockwise,
  ArrowLeft,
  MapTrifold,
  Pause,
  Path,
  Play,
  UsersThree,
} from "@phosphor-icons/react";
import BrandMark from "./BrandMark.jsx";
import TeenTripScreen from "./TeenTripScreen.jsx";
import ParentDashboard from "./ParentDashboard.jsx";
import { useStore, setState, getState, resetDemo } from "../store.js";
import { pushLocation, expireCheckin, endTrip } from "../actions.js";
import { nearestIndex } from "../logic/geo.js";

function buildDeviationPath(points = []) {
  if (points.length < 2) return points;
  return points.map(([lat, lng], index) => {
    const progress = index / Math.max(1, points.length - 1);
    const deviation = Math.sin(progress * Math.PI) * 0.0032;
    return [lat + deviation * 0.72, lng + deviation];
  });
}

export default function PlannerApp() {
  const [mode, setMode] = useState("teen");
  const { trip, checkin, simulation } = useStore();
  const active = trip && (trip.status === "active" || trip.status === "alert");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMode =
      window.location.hash === "#parent" || params.get("view") === "guardian"
        ? "parent"
        : "teen";
    setMode(requestedMode);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const state = getState();
      const current = state.trip;
      if (
        !current ||
        (current.status !== "active" && current.status !== "alert")
      ) {
        return;
      }

      if (
        state.checkin?.status === "waiting" &&
        Date.now() >= state.checkin.expiresAt
      ) {
        expireCheckin();
        return;
      }

      const sim = state.simulation;
      if (!sim.running) return;
      if (sim.lastTickAt && Date.now() - sim.lastTickAt < 900) return;

      if (sim.stopped) {
        setState({
          simulation: {
            ...sim,
            minutesStopped: sim.minutesStopped + 1,
            lastTickAt: Date.now(),
          },
        });
        pushLocation(current.location, { speed: 0, elapsedSeconds: 60 });
        return;
      }

      const routePoints = current.route.points || [];
      const path = sim.offRoute ? buildDeviationPath(routePoints) : routePoints;
      if (path.length === 0) return;
      const nextIndex = Math.min(sim.index + 1, path.length - 1);
      setState({
        simulation: {
          ...sim,
          index: nextIndex,
          minutesStopped: 0,
          lastTickAt: Date.now(),
        },
      });
      pushLocation(path[nextIndex], { speed: 1.4, elapsedSeconds: 60 });

      if (!sim.offRoute && nextIndex === path.length - 1) {
        endTrip("completed");
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const controls = useMemo(
    () => [
      {
        label: simulation.stopped ? "Resume trip" : "Simulate stop",
        icon: simulation.stopped ? Play : Pause,
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
        label: simulation.offRoute ? "Return to route" : "Simulate detour",
        icon: simulation.offRoute ? ArrowCounterClockwise : Path,
        disabled: !active,
        onClick: () => {
          const state = getState();
          const sim = state.simulation;
          const routePoints = state.trip?.route?.points || [];
          const deviationPoints = buildDeviationPath(routePoints);
          const goingOffRoute = !sim.offRoute;
          const targetPath = goingOffRoute ? deviationPoints : routePoints;
          const index = targetPath.length
            ? nearestIndex(state.trip.location, targetPath)
            : 0;
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
      {
        label: "Reset",
        icon: ArrowCounterClockwise,
        disabled: false,
        onClick: resetDemo,
      },
    ],
    [active, simulation.offRoute, simulation.stopped],
  );

  const chooseMode = (nextMode) => {
    setMode(nextMode);
    window.history.replaceState(
      null,
      "",
      nextMode === "parent" ? "/planner#parent" : "/planner#teen",
    );
  };

  return (
    <div className="planner-shell" id="top">
      {/* Floating glassmorphic navigation header */}
      <header className="planner-nav-float">
        <nav className="planner-nav" aria-label="Planner navigation">
          <Link className="brand" href="/" aria-label="Escort home">
            <BrandMark />
          </Link>

          <Link className="planner-back-link" href="/">
            <ArrowLeft size={16} weight="bold" aria-hidden="true" />
            Product overview
          </Link>

          <div className="mode-toggle" aria-label="Choose product view">
            <button
              type="button"
              className={mode === "teen" ? "active" : ""}
              aria-pressed={mode === "teen"}
              onClick={() => chooseMode("teen")}
            >
              <MapTrifold size={17} weight="bold" aria-hidden="true" />
              <span>Teen</span>
            </button>
            <button
              type="button"
              className={mode === "parent" ? "active" : ""}
              aria-pressed={mode === "parent"}
              onClick={() => chooseMode("parent")}
            >
              <UsersThree size={17} weight="bold" aria-hidden="true" />
              <span>Guardian</span>
              {mode !== "parent" && checkin?.status === "expired" && (
                <span
                  className="notification-dot"
                  aria-label="New guardian alert"
                />
              )}
            </button>
          </div>

          <div className="planner-nav-status" aria-live="polite">
            <span className={active ? "status-orb status-orb-live" : "status-orb"} />
            <span>{active ? "Trip active" : "Ready to plan"}</span>
          </div>
        </nav>
      </header>

      {/* Floating simulator toolbar — top-right corner of map */}
      <div className="simulator-float" aria-label="Trip simulator controls">
        <span className="simulator-float-label">Demo</span>
        <div className="simulator-actions">
          {controls.map((control) => {
            const Icon = control.icon;
            return (
              <button
                key={control.label}
                type="button"
                disabled={control.disabled}
                onClick={control.onClick}
                title={control.label}
              >
                <Icon size={15} weight="bold" aria-hidden="true" />
                <span>{control.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Full-viewport map canvas — each screen renders the map as base layer */}
      <main className="planner-map-main" aria-label="Trip planner">
        {mode === "teen" ? <TeenTripScreen /> : <ParentDashboard />}
      </main>
    </div>
  );
}
