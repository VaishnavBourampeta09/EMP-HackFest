"use client";

import { useState } from "react";
import { CheckCircle, WarningOctagon, X } from "@phosphor-icons/react";
import { HAZARD_LABELS, reportHazard } from '../ACTIONS.JS';

const CATEGORIES = [
  "user_reported",
  "low_light",
  "violent_crime",
  "collision",
  "property_crime",
];

/**
 * Lets whoever is looking at a trip flag a hazard where they are. Reports land
 * in the same shape as the official feed, so they appear on the map and in the
 * street-level view immediately.
 */
export default function ReportDangerButton({ location, compact = false }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("user_reported");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  const disabled = !Array.isArray(location) || location.length < 2;

  const submit = (event) => {
    event.preventDefault();
    if (disabled) return;
    reportHazard({ category, description: note, location });
    setDone(true);
    setNote("");
    setOpen(false);
    window.setTimeout(() => setDone(false), 3200);
  };

  if (done) {
    return (
      <p className="report-danger-done" role="status">
        <CheckCircle size={16} weight="fill" aria-hidden="true" />
        Report added to this route
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className={`report-danger-trigger${compact ? " is-compact" : ""}`}
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "Pick a route first" : "Flag a hazard here"}
      >
        <WarningOctagon size={16} weight="fill" aria-hidden="true" />
        Report a hazard here
      </button>
    );
  }

  return (
    <form className="report-danger-form" onSubmit={submit}>
      <div className="report-danger-head">
        <strong>What did you see?</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="Cancel report">
          <X size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>

      <div className="report-danger-options" role="radiogroup" aria-label="Hazard type">
        {CATEGORIES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={category === value}
            className={category === value ? "is-active" : ""}
            onClick={() => setCategory(value)}
          >
            {HAZARD_LABELS[value]}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={note}
        maxLength={90}
        placeholder="Add a detail (optional)"
        aria-label="Report detail"
        onChange={(event) => setNote(event.target.value)}
      />

      <button type="submit" className="button button-danger button-block button-compact">
        Submit report
      </button>
    </form>
  );
}
