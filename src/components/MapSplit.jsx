"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DotsSixVertical, X, Eye } from "@phosphor-icons/react";

const STORAGE_KEY = "sentinel-map-split";
const MIN = 0.25;
const MAX = 0.8;

/**
 * Map on the left, street-level corridor on the right, with a divider the user
 * can drag to change the proportion. The chosen ratio persists, so whichever
 * pane someone works in stays the size they left it.
 */
export default function MapSplit({ map, street, collapsed = false }) {
  const [ratio, setRatio] = useState(0.55);
  const [dragging, setDragging] = useState(false);
  const [showStreetModal, setShowStreetModal] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  const shellRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  // On phones, hide street view by default, prioritize map
  const isMobile = windowWidth < 768;
  const hideStreet = isMobile;

  return (
    <>
      <div
        ref={shellRef}
        className={`map-split${dragging ? " is-dragging" : ""}`}
        style={
          hideStreet
            ? { gridTemplateColumns: "1fr" }
            : { gridTemplateColumns: `${ratio}fr 10px ${1 - ratio}fr` }
        }
      >
        <div className="map-pane">
          {map}
          {isMobile && (
            <button
              className="mobile-street-view-btn"
              onClick={() => setShowStreetModal(true)}
              aria-label="View street-level corridor"
              title="Street-level view"
            >
              <Eye size={18} weight="fill" />
            </button>
          )}
        </div>

        {!hideStreet && (
          <>
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
          </>
        )}
      </div>

      {isMobile && showStreetModal && (
        <div className="street-view-modal" onClick={() => setShowStreetModal(false)}>
          <div className="street-view-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="street-view-modal-close"
              onClick={() => setShowStreetModal(false)}
              aria-label="Close street-level view"
            >
              <X size={20} weight="bold" />
            </button>
            {street}
          </div>
        </div>
      )}
    </>
  );
}
