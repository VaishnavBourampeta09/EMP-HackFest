"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  BellRinging,
  Bus,
  CheckCircle,
  ClockCountdown,
  Footprints,
  LightbulbFilament,
  MapPin,
  NavigationArrow,
  ShieldCheck,
  UserFocus,
  WarningCircle,
} from "@phosphor-icons/react";
import BrandMark from "./BrandMark.jsx";
import LiveCrimeSection from "./LiveCrimeSection.jsx";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const dataSources = [
  { name: "Redmond crime data", Icon: MapPin },
  { name: "Redmond street lights", Icon: LightbulbFilament },
  { name: "Mapbox Directions", Icon: NavigationArrow },
  { name: "OpenTripPlanner", Icon: Footprints },
  { name: "King County Metro", Icon: Bus },
  { name: "GTFS Realtime", Icon: ClockCountdown },
];

const routeFactors = [
  {
    id: "crime",
    title: "Crime context",
    detail:
      "Nearby incidents are weighted by category, then decay with both age and distance. A recent assault affects a segment more than an older property report several blocks away.",
    signal: "Severity × recency × proximity",
    Icon: ShieldCheck,
  },
  {
    id: "lighting",
    title: "Street lighting",
    detail:
      "Sentinel looks for gaps between mapped street lights instead of assigning one score to a whole neighborhood. Lighting carries more weight when the trip happens after dark.",
    signal: "Coverage gaps + time of day",
    Icon: LightbulbFilament,
  },
  {
    id: "walking",
    title: "Walking environment",
    detail:
      "Each walking leg is split into short segments, so quiet, isolated stretches can be compared against connected pedestrian paths and active main roads.",
    signal: "50–100 meter route segments",
    Icon: Footprints,
  },
  {
    id: "transit",
    title: "Transit conditions",
    detail:
      "Live arrivals, transfer count, stop wait time, and active service alerts compare the full journey — not only the minutes spent on the bus.",
    signal: "Waits + transfers + disruptions",
    Icon: Bus,
  },
];

const guardianStates = [
  {
    title: "Normal",
    description:
      "Location updates line up with the selected route and the expected pace. The trip stays quiet in the background.",
    Icon: NavigationArrow,
  },
  {
    title: "Possible anomaly",
    description:
      "A sustained detour, an unexpected stop, or a late arrival opens a short observation window. One noisy GPS point never triggers an alert.",
    Icon: WarningCircle,
  },
  {
    title: "Check-in",
    description:
      "A calm prompt asks whether everything is okay, and gives a clear, immediate way to answer.",
    Icon: UserFocus,
  },
];

const guardianOutcomes = [
  {
    title: "Resolved",
    description:
      "A response, or a return to the expected route, closes the check-in and restores the trip to its normal state.",
    Icon: CheckCircle,
  },
  {
    title: "Guardian alerted",
    description:
      "If the pattern continues without a response, the guardian gets the trip context and the reason for the alert.",
    Icon: BellRinging,
  },
];

function DataSourceGroup({ duplicate = false }) {
  return (
    <ul className="story-marquee-group" aria-hidden={duplicate ? "true" : undefined}>
      {dataSources.map(({ name, Icon }) => (
        <li className="story-marquee-item" key={name}>
          <Icon aria-hidden="true" size={18} weight="regular" />
          <span>{name}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ProductStory({ onPlanClick, onGuardianClick }) {
  const storyRef = useRef(null);

  useGSAP(
    () => {
      const marqueeTrack = storyRef.current?.querySelector("[data-marquee-track]");
      const mediaQuery = gsap.matchMedia();

      mediaQuery.add(
        { motionAllowed: "(prefers-reduced-motion: no-preference)" },
        (context) => {
          if (!context.conditions.motionAllowed || !marqueeTrack) return;
          gsap.to(marqueeTrack, {
            xPercent: -50,
            duration: 38,
            ease: "none",
            repeat: -1,
          });
        },
      );

      return () => mediaQuery.revert();
    },
    { scope: storyRef },
  );

  return (
    <div className="product-story" ref={storyRef}>
      <div
        className="story-marquee"
        role="region"
        aria-label="Data and routing sources used by Sentinel"
      >
        <div className="story-marquee-track" data-marquee-track>
          <DataSourceGroup />
          <DataSourceGroup duplicate />
        </div>
      </div>

      <section
        id="route-intelligence"
        className="story-chapter story-ranking"
        aria-labelledby="ranking-title"
      >
        <header className="story-chapter-heading">
          <p className="story-eyebrow">How routes are chosen</p>
          <h2 className="story-heading" id="ranking-title">
            A normal route planner with a better objective.
          </h2>
          <p className="story-chapter-lede">
            Established engines generate the realistic walking and transit
            options. Sentinel scores those candidates on the conditions along the
            path — never on neighborhood labels — then balances safety against
            travel time.
          </p>
        </header>

        <div className="story-weights" role="group" aria-label="Route utility weighting">
          <div className="story-weight-row">
            <span>Daytime</span>
            <div className="story-weight-bar" aria-hidden="true">
              <i style={{ width: "70%" }} />
            </div>
            <strong>70% safety · 30% time</strong>
          </div>
          <div className="story-weight-row">
            <span>After dark</span>
            <div className="story-weight-bar" aria-hidden="true">
              <i style={{ width: "85%" }} />
            </div>
            <strong>85% safety · 15% time</strong>
          </div>
        </div>

        <div className="story-factor-grid">
          {routeFactors.map(({ id, title, detail, signal, Icon }) => (
            <article className="story-factor" key={id}>
              <div className="story-factor-head">
                <Icon aria-hidden="true" size={20} weight="regular" />
                <h3>{title}</h3>
              </div>
              <p>{detail}</p>
              <p className="story-factor-signal">{signal}</p>
            </article>
          ))}
        </div>
      </section>

      <LiveCrimeSection onPlanClick={onPlanClick}>
        <div id="guardian-story" className="story-guardian-inline">
        <div className="ladder-layout">
          <header className="ladder-intro">
            <p className="story-eyebrow">Escalation, not surveillance</p>
            <h2 id="guardian-title">
              An alarm goes off.
              <span>Sentinel escalates.</span>
            </h2>
            <p className="story-chapter-lede">
              Passive sharing shows a dot on a map and leaves you to interpret
              it. Sentinel holds four states, and it has to earn its way up each
              one — comparing the dot against the route, the ETA, the expected
              stops, and how long the change has lasted.
            </p>
            <p className="ladder-note">
              One noisy GPS reading never reaches a guardian.
            </p>
          </header>

          <ol className="ladder" aria-label="How Sentinel escalates during a trip">
            {guardianStates.map(({ title, description, Icon }, index) => (
              <li className="ladder-rung" key={title} data-level={index}>
                <div className="ladder-rail" aria-hidden="true">
                  <span className="ladder-node">{index + 1}</span>
                </div>
                <div className="ladder-body">
                  <div className="ladder-heading">
                    <Icon aria-hidden="true" size={19} weight="fill" />
                    <h3>{title}</h3>
                    <span className="ladder-meter" aria-hidden="true">
                      {[0, 1, 2, 3].map((tick) => (
                        <i key={tick} className={tick <= index ? "on" : ""} />
                      ))}
                    </span>
                  </div>
                  <p>{description}</p>
                </div>
              </li>
            ))}

            <li className="ladder-rung ladder-fork" data-level="3">
              <div className="ladder-rail" aria-hidden="true">
                <span className="ladder-node ladder-node-fork">4</span>
              </div>
              <div className="ladder-body">
                <p className="ladder-fork-label">The check-in decides which way this ends</p>
                <div className="ladder-fork-pair">
                  {guardianOutcomes.map(({ title, description, Icon }) => (
                    <article
                      className={`ladder-outcome ladder-outcome-${title === "Resolved" ? "ok" : "alert"}`}
                      key={title}
                    >
                      <div className="ladder-heading">
                        <Icon aria-hidden="true" size={19} weight="fill" />
                        <h3>{title}</h3>
                      </div>
                      <p>{description}</p>
                    </article>
                  ))}
                </div>
              </div>
            </li>
          </ol>
        </div>
      </div>

      </LiveCrimeSection>

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
