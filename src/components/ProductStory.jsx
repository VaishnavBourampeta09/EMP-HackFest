"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  BellRinging,
  Bus,
  CheckCircle,
  ClockCountdown,
  Footprints,
  LightbulbFilament,
  LockKey,
  MapPin,
  NavigationArrow,
  ShieldCheck,
  UserFocus,
  WarningCircle,
} from "@phosphor-icons/react";
import BrandMark from "./BrandMark.jsx";

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
      "Escort looks for gaps between mapped street lights instead of assigning one score to a whole neighborhood. Lighting carries more weight when the trip happens after dark.",
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
        aria-label="Data and routing sources used by Escort"
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
            Established directions engines generate the realistic walking and
            transit options. Escort scores those candidates on the conditions
            along the path, then balances safety against travel time.
          </p>
        </header>

        <div className="story-grid">
          <article className="story-card story-card-wide">
            <ShieldCheck aria-hidden="true" size={26} weight="regular" />
            <h3>Safest reasonable, by design</h3>
            <p>
              Escort will not send someone on an impractical detour for a
              marginal gain. The weighting shifts with the time of day, and the
              tradeoff stays visible on every recommendation.
            </p>

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
          </article>

          <article className="story-card">
            <MapPin aria-hidden="true" size={26} weight="regular" />
            <h3>Block-by-block context</h3>
            <p>
              Walking legs become 50–100 meter segments, each scored for recent
              incidents, lighting gaps, pedestrian isolation, and transit waits.
            </p>
          </article>

          <article className="story-card">
            <LockKey aria-hidden="true" size={26} weight="regular" />
            <h3>Trip-scoped by default</h3>
            <p>
              Monitoring begins with Start Safe Trip, follows the selected
              journey, and ends with it. Alerts share context only when a
              sustained pattern needs attention.
            </p>
          </article>
        </div>
      </section>

      <section className="story-chapter story-factors" aria-labelledby="factors-title">
        <header className="story-chapter-heading">
          <p className="story-eyebrow">Explainable inputs, never neighborhood labels</p>
          <h2 id="factors-title">What changes a route score?</h2>
          <p className="story-chapter-lede">
            Each signal answers a specific question about the path and the moment
            of travel.
          </p>
        </header>

        <div className="story-factor-grid">
          {routeFactors.map(({ id, title, detail, signal, Icon }) => (
            <article className="story-factor" key={id}>
              <div className="story-factor-head">
                <Icon aria-hidden="true" size={22} weight="regular" />
                <h3>{title}</h3>
              </div>
              <p>{detail}</p>
              <p className="story-factor-signal">{signal}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="guardian-story"
        className="story-chapter story-guardian"
        aria-labelledby="guardian-title"
      >
        <header className="story-chapter-heading">
          <p className="story-eyebrow">A response, not an alarm</p>
          <h2 id="guardian-title">Guardian understands the journey.</h2>
          <p className="story-chapter-lede">
            Passive sharing shows a dot. Escort compares that dot against the
            route, the ETA, the expected stops, and how long a change has lasted
            before deciding what happens next.
          </p>
        </header>

        <ol className="story-sequence">
          {guardianStates.map(({ title, description, Icon }, index) => (
            <li className="story-step" key={title}>
              <span className="story-step-index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="story-step-body">
                <div className="story-step-head">
                  <Icon aria-hidden="true" size={22} weight="regular" />
                  <h3>{title}</h3>
                </div>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="story-outcomes" role="group" aria-label="The check-in has two possible outcomes">
          <p className="story-outcomes-label">Then one of two things happens</p>
          <div className="story-outcome-pair">
            {guardianOutcomes.map(({ title, description, Icon }) => (
              <article className="story-outcome" key={title}>
                <div className="story-step-head">
                  <Icon aria-hidden="true" size={22} weight="regular" />
                  <h3>{title}</h3>
                </div>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="story-closing" aria-labelledby="story-closing-title">
        <div className="story-closing-copy">
          <h2 id="story-closing-title">Choose the route. Keep the context.</h2>
          <p>
            Plan with familiar map controls, then let Escort quietly watch
            whether the trip continues as expected.
          </p>
        </div>
        <div className="story-closing-actions">
          <button
            className="button button-primary button-large"
            type="button"
            onClick={onPlanClick}
          >
            Plan a route
            <ArrowRight aria-hidden="true" size={18} weight="bold" />
          </button>
          <button
            className="button button-outline button-large"
            type="button"
            onClick={onGuardianClick}
          >
            See the guardian view
          </button>
        </div>
      </section>

      <footer className="story-footer">
        <div className="story-footer-inner">
          <a className="story-footer-brand" href="#top" aria-label="Escort, back to top">
            <BrandMark variant="glyph" />
            <span>Escort</span>
          </a>
          <p>Maps get you home. Escort makes sure you get home safely.</p>
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
