"use client";

import { ArrowCounterClockwise, Pause, Path, Play } from "@phosphor-icons/react";
import { nearestIndex } from "../logic/geo.js";
import { buildDeviationPath } from "../logic/simulation.js";
import { getState, setState, resetDemo, useStore } from "../store.js";

/**
 * Demo controls for the trip state machine.
 *
 * These live inside the sidebar rather than floating over the map: they are
 * only meaningful while a trip is running, and a permanent box in the map's
 * corner competed with the map's own overlays.
 */
export default function SimulationControls({ compact = false }) {
  const { trip, simulation } = useStore();
  const active = trip && (trip.status === "active" || trip.status === "alert");

  const toggleStop = () =>
    setState({
      simulation: {
        ...getState().simulation,
        stopped: !simulation.stopped,
        minutesStopped: 0,
      },
    });

  const toggleDetour = () => {
    const state = getState();
    const sim = state.simulation;
    const routePoints = state.trip?.route?.points || [];
    const goingOffRoute = !sim.offRoute;
    const targetPath = goingOffRoute ? buildDeviationPath(routePoints) : routePoints;
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
  };

  const controls = [
    {
      label: simulation.stopped ? "Resume" : "Stop",
      title: simulation.stopped ? "Resume the simulated trip" : "Simulate an unexpected stop",
      Icon: simulation.stopped ? Play : Pause,
      disabled: !active,
      onClick: toggleStop,
    },
    {
      label: simulation.offRoute ? "Rejoin" : "Detour",
      title: simulation.offRoute ? "Return to the planned route" : "Simulate a sustained detour",
      Icon: simulation.offRoute ? ArrowCounterClockwise : Path,
      disabled: !active,
      onClick: toggleDetour,
    },
    {
      label: "Reset",
      title: "Clear the demo and start over",
      Icon: ArrowCounterClockwise,
      disabled: false,
      onClick: resetDemo,
    },
  ];

  return (
    <div
      className={`sim-controls${compact ? " sim-controls-compact" : ""}`}
      role="group"
      aria-label="Trip simulator"
    >
      <span className="sim-controls-label">Demo</span>
      {controls.map(({ label, title, Icon, disabled, onClick }) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          onClick={onClick}
          title={title}
        >
          <Icon size={14} weight="bold" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
