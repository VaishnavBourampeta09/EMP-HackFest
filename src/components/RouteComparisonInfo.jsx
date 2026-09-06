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
              <span className="metric-label">Route conditions</span>
              <span className="metric-comparison">
                <span className="better">{best.conditionScore ?? 85}/100</span>
                <span className="vs">vs</span>
                <span className="worse">{others[0]?.conditionScore ?? 70}/100</span>
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
                {best.explanation || "Better conditions and lower incident exposure"}
              </span>
            </div>
          </>
        )}
      </div>

      <p className="comparison-note">
        Safety scores are based on lighting, recent incidents, and transit reliability. Your awareness
        and preparation matter most.
      </p>
    </div>
  );
}
