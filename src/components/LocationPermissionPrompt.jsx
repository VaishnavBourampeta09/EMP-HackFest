"use client";

import { MapPin, Info } from "@phosphor-icons/react";
import { useState } from "react";

export default function LocationPermissionPrompt({ onPermissionRequested }) {
  const [requested, setRequested] = useState(false);
  const [denied, setDenied] = useState(false);

  const handleRequest = async () => {
    setRequested(true);
    if (!navigator.geolocation) {
      setDenied(true);
      if (onPermissionRequested) onPermissionRequested("unavailable");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (onPermissionRequested) onPermissionRequested("granted");
      },
      (error) => {
        if (error.code === 1) {
          setDenied(true);
          if (onPermissionRequested) onPermissionRequested("denied");
        }
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  if (denied) {
    return (
      <div className="location-prompt location-prompt-denied" role="alert">
        <Info size={18} weight="fill" aria-hidden="true" />
        <div>
          <strong>Location access was denied</strong>
          <p>You can still use Simulation Mode to test the trip. The app needs location permission to track your live journey.</p>
        </div>
      </div>
    );
  }

  if (requested) {
    return null;
  }

  return (
    <div className="location-prompt" role="region" aria-label="Location permission notice">
      <div className="prompt-content">
        <MapPin size={20} weight="fill" aria-hidden="true" />
        <div className="prompt-text">
          <strong>Use your real location?</strong>
          <p>Sentinel can track your actual journey when you start a trip, or you can use Simulation Mode for testing without traveling.</p>
        </div>
      </div>
      <div className="prompt-actions">
        <button
          type="button"
          className="button button-soft button-small"
          onClick={() => setRequested(true)}
        >
          Use Simulation
        </button>
        <button
          type="button"
          className="button button-lime button-small"
          onClick={handleRequest}
        >
          Allow Location
        </button>
      </div>
    </div>
  );
}
