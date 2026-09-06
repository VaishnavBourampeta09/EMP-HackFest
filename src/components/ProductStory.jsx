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
          <ul className="story-footer-list" aria-label="Features">
            <li>Local route context</li>
            <li>Trip-scoped sharing</li>
          </ul>
          <ul className="story-footer-tech" aria-label="Built with">
            <li>OpenStreetMap</li>
            <li>Valhalla</li>
            <li>Transitous</li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
