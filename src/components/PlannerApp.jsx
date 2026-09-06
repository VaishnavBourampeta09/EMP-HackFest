"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, MapTrifold, UsersThree } from "@phosphor-icons/react";
import BrandMark from "./BrandMark.jsx";
import TeenTripScreen from "./TeenTripScreen.jsx";
import ParentDashboard from "./ParentDashboard.jsx";
import { useStore, setState, getState } from "../store.js";
import { pushLocation, expireCheckin, endTrip } from "../actions.js";
import { buildDeviationPath } from "../logic/simulation.js";

/**
 * Trip playback pace. One route point every 3s of wall time, each counted as
 * 20 trip-seconds — roughly 7x real time, so a trip stays watchable for many
 * minutes rather than finishing while you glance at the other tab.
 */
const TICK_MS = 3000;
const TICK_SECONDS = 20;

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
      if (sim.lastTickAt && Date.now() - sim.lastTickAt < TICK_MS) return;

      if (sim.stopped) {
        setState({
          simulation: {
            ...sim,
            minutesStopped: sim.minutesStopped + 1,
            lastTickAt: Date.now(),
          },
        });
        pushLocation(current.location, {
          speed: 0,
          elapsedSeconds: TICK_SECONDS,
        });
        return;
      }

      const routePoints = current.route.points || [];
      const path = sim.offRoute ? buildDeviationPath(routePoints) : routePoints;
      if (path.length === 0) return;

      // Hold at the destination instead of ending the trip: the traveller
      // decides when they have arrived, and auto-ending meant the trip vanished
      // if you looked away for a minute.
      if (!sim.offRoute && sim.index >= path.length - 1) return;

      const nextIndex = Math.min(sim.index + 1, path.length - 1);
      setState({
        simulation: {
          ...sim,
          index: nextIndex,
          minutesStopped: 0,
          lastTickAt: Date.now(),
        },
      });
      pushLocation(path[nextIndex], {
        speed: 1.4,
        elapsedSeconds: TICK_SECONDS,
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

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
          <Link className="brand" href="/" aria-label="Sentinel home">
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
            <span
              className={active ? "status-orb status-orb-live" : "status-orb"}
            />
            <span>{active ? "Trip active" : "Ready to plan"}</span>
          </div>
        </nav>
      </header>

      <main className="planner-map-main" aria-label="Trip planner">
        {mode === "teen" ? <TeenTripScreen /> : <ParentDashboard />}
      </main>
    </div>
  );
}
