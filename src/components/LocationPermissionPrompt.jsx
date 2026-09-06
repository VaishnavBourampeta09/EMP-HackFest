"use client";

import { useState } from "react";
import { Crosshair, Info } from "@phosphor-icons/react";

/**
 * Offers to use the device's real position. Trip playback runs on its own
 * either way, so this is a quiet upgrade rather than a required choice — it
 * collapses as soon as it is answered or dismissed.
 */
export default function LocationPermissionPrompt({ onPermissionRequested }) {
  const [state, setState] = useState("idle");

  const request = () => {
    setState("asking");
    if (!navigator.geolocation) {
      setState("denied");
      onPermissionRequested?.("unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        setState("granted");
        onPermissionRequested?.("granted");
      },
      (error) => {
        setState(error.code === 1 ? "denied" : "idle");
        onPermissionRequested?.(error.code === 1 ? "denied" : "error");
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
    );
  };

  if (state === "granted" || state === "dismissed") return null;

  if (state === "denied") {
    return (
      <p className="location-prompt-note" role="status">
        <Info size={14} weight="fill" aria-hidden="true" />
        Location is off — trips play back along the planned route instead.
      </p>
    );
  }

  return (
    <div className="location-prompt" role="region" aria-label="Use your location">
      <Crosshair size={16} weight="bold" aria-hidden="true" />
      <span>Use your real location for this trip?</span>
      <button type="button" onClick={request} disabled={state === "asking"}>
        {state === "asking" ? "Asking…" : "Allow"}
      </button>
      <button
        type="button"
        className="is-ghost"
        onClick={() => setState("dismissed")}
        aria-label="Dismiss location prompt"
      >
        Not now
      </button>
    </div>
  );
}
