"use client";

import BrandMark from "./BrandMark.jsx";
import LiveCrimeSection from "./LiveCrimeSection.jsx";

export default function ProductStory({ onPlanClick }) {
  return (
    <div className="product-story">
      <LiveCrimeSection onPlanClick={onPlanClick} />

      <footer className="story-footer">
        <div className="story-footer-inner">
          <a className="story-footer-brand" href="#top" aria-label="Sentinel, back to top">
            <BrandMark variant="glyph" />
            <span>Sentinel</span>
          </a>
          <p>Maps get you home. Sentinel makes sure you get home safely.</p>
          <div className="story-footer-tech" role="group" aria-label="Built with">
            <span>MapLibre</span>
            <span>OpenTripPlanner</span>
            <span>PostGIS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
