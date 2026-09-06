"use client";

import { Play, Pause } from "@phosphor-icons/react";

export default function SimulationModeBanner({ isRunning, isStopped, onToggle }) {
  if (!isRunning && !isStopped) {
    return null;
  }

  return (
    <div className="simulation-mode-banner" role="status" aria-live="polite">
      <div className="banner-content">
        <span className="demo-indicator" aria-hidden="true">●</span>
        <span className="banner-text">
          <strong>Demo Mode:</strong> Trip is simulated. Tap{" "}
          {isStopped ? (
            <>
              <Play size={14} weight="bold" aria-hidden="true" /> Play
            </>
          ) : (
            <>
              <Pause size={14} weight="bold" aria-hidden="true" /> Pause
            </>
          )}{" "}
          in the toolbar to control the simulation.
        </span>
      </div>
    </div>
  );
}
