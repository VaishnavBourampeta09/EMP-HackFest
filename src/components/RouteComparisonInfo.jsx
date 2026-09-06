"use client";

import { Lightbulb } from "@phosphor-icons/react";
import { formatMinutesDelta } from "../logic/duration.js";

export default function RouteComparisonInfo({ routes = [] }) {
  if (routes.length < 2) {
    return null;
  }

  const sortedByRecommendation = [...routes].sort((a, b) => {
    if (a.recommended && !b.recommended) return -1;
    if (!a.recommended && b.recommended) return 1;
    return 0;
  });

  const best = sortedByRecommendation[0];
  const others = sortedByRecommendation.slice(1);

  if (!best.recommended) {
    return null;
  }

  return (
    <div className="route-comparison-info" role="complementary" aria-label="Route comparison summary">
      <div className="comparison-header">
        <Lightbulb size={18} weight="fill" aria-hidden="true" />
        <h3>Why this route is safer</h3>
      </div>

      <div className="comparison-metrics">
        {others.length > 0 && (
          <>
            <div className="metric-row">
              <span className="metric-label">Safety Score</span>
              <span className="metric-comparison">
                <span className="better">{best.safetyScore?.toFixed(1) ?? '—'}/10</span>
                <span className="vs">vs</span>
                <span className="worse">{others[0]?.safetyScore?.toFixed(1) ?? '—'}/10</span>
              </span>
            </div>

            {best.timeDeltaMinutes !== undefined && best.timeDeltaMinutes !== 0 && (
              <div className="metric-row">
                <span className="metric-label">Time tradeoff</span>
                <span className="metric-value">
                  {formatMinutesDelta(best.timeDeltaMinutes)} safer choice
                </span>
              </div>
            )}

            <div className="metric-row">
              <span className="metric-label">Key difference</span>
              <span className="metric-explanation">
                {best.incidentsPerKm} incidents/km
              </span>
            </div>
          </>
        )}
      </div>

      <p className="comparison-note">
        Scores compare incident exposure and, at night, lighting. Transit scores cover walking portions only.
      </p>
    </div>
  );
}
