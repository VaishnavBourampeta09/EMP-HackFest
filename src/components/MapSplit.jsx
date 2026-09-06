"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DotsSixVertical } from "@phosphor-icons/react";

const STORAGE_KEY = "sentinel-map-split";
const MIN = 0.25;
const MAX = 0.8;

/**
 * Map on the left, street-level corridor on the right, with a divider the user
 * can drag to change the proportion. The chosen ratio persists, so whichever
 * pane someone works in stays the size they left it.
 */
export default function MapSplit({ map, street }) {
  const [ratio, setRatio] = useState(0.55);
  const [dragging, setDragging] = useState(false);
  const shellRef = useRef(null);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(saved) && saved >= MIN && saved <= MAX) setRatio(saved);
    } catch {
      // A blocked storage read is not worth failing the layout over.
    }
  }, []);

  const persist = useCallback((value) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // ignore
    }
  }, []);

  const applyFromClientX = useCallback((clientX) => {
    const rect = shellRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const next = Math.min(MAX, Math.max(MIN, (clientX - rect.left) / rect.width));
    setRatio(next);
  }, []);

  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (event) => {
      event.preventDefault();
      applyFromClientX(event.clientX);
    };
    const onUp = () => {
      setDragging(false);
      setRatio((current) => {
        persist(current);
        return current;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, applyFromClientX, persist]);

  const nudge = (delta) => {
    setRatio((current) => {
      const next = Math.min(MAX, Math.max(MIN, current + delta));
      persist(next);
      return next;
    });
  };

  return (
    <div
      ref={shellRef}
      className={`map-split${dragging ? " is-dragging" : ""}`}
      style={{ gridTemplateColumns: `${ratio}fr 10px ${1 - ratio}fr` }}
    >
      <div className="map-pane">{map}</div>

      <div
        className="map-split-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the map and street view"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(MIN * 100)}
        aria-valuemax={Math.round(MAX * 100)}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDoubleClick={() => {
          setRatio(0.55);
          persist(0.55);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            nudge(-0.04);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            nudge(0.04);
          }
        }}
      >
        <span aria-hidden="true">
          <DotsSixVertical size={14} weight="bold" />
        </span>
      </div>

      <div className="street-pane">{street}</div>
    </div>
  );
}
