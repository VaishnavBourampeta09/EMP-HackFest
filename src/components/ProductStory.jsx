"use client";

import { useId, useRef, useState } from "react";
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
    summary: "Recent, severe incidents matter more than old reports.",
    detail:
      "Nearby incidents are weighted by category, then decay with both age and distance. A recent assault affects a segment more than an older property report several blocks away.",
    signal: "Severity × recency × proximity",
    Icon: ShieldCheck,
  },
  {
    id: "lighting",
    title: "Street lighting",
    summary: "Light coverage is evaluated along the path, especially after dark.",
    detail:
      "GuardianRoute looks for gaps between mapped street lights instead of assigning one score to an entire neighborhood. Lighting receives more weight when the trip happens at night.",
    signal: "Coverage gaps + time of day",
    Icon: LightbulbFilament,
  },
  {
    id: "walking",
    title: "Walking environment",
    summary: "The route itself matters: sidewalks, crossings, and activity.",
    detail:
      "Each walking leg is split into short segments so quieter, isolated stretches can be compared with connected pedestrian paths and active main roads.",
    signal: "50–100 meter route segments",
    Icon: Footprints,
  },
  {
    id: "transit",
    title: "Transit conditions",
    summary: "Waiting and transfers count as part of the trip.",
    detail:
      "Live arrival information, transfer count, stop wait time, and active service alerts help compare the full journey—not only the minutes spent on a bus.",
    signal: "Waits + transfers + disruptions",
    Icon: Bus,
  },
];

const guardianStates = [
  {
    title: "Normal",
    description:
      "Location updates align with the selected route and expected pace. The trip continues quietly in the background.",
    Icon: NavigationArrow,
  },
  {
    title: "Possible anomaly",
    description:
      "A sustained detour, an unexpected stop, or a late arrival starts a short observation window. One noisy GPS point never triggers an alert.",
    Icon: WarningCircle,
  },
  {
    title: "Teen check-in",
    description:
      "A calm prompt asks whether everything is okay and gives the teen a clear, immediate way to respond.",
    Icon: UserFocus,
  },
];

const guardianOutcomes = [
  {
    title: "Resolved",
    description:
      "A response or return to the expected route closes the check-in and restores the trip to its normal state.",
    Icon: CheckCircle,
  },
  {
    title: "Guardian alerted",
    description:
      "If the pattern continues without a response, the guardian receives useful trip context and the reason for the alert.",
    Icon: BellRinging,
  },
];

function DataSourceGroup({ duplicate = false }) {
  return (
    <ul
      className="story-marquee-group"
      aria-hidden={duplicate ? "true" : undefined}
    >
      {dataSources.map(({ name, Icon }) => (
        <li className="story-marquee-item" key={name}>
          <Icon aria-hidden="true" size={20} weight="duotone" />
          <span>{name}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ProductStory({ onPlanClick, onGuardianClick }) {
  const storyRef = useRef(null);
  const accordionButtonRefs = useRef([]);
  const accordionId = useId();
  const [activeFactor, setActiveFactor] = useState(0);

  useGSAP(
    () => {
      const media = gsap.utils.toArray(
        "[data-story-media]",
        storyRef.current,
      );
      const marqueeTrack = storyRef.current?.querySelector(
        "[data-marquee-track]",
      );
      const guardianSection = storyRef.current?.querySelector(
        "[data-guardian-section]",
      );
      const guardianPin = storyRef.current?.querySelector(
        "[data-guardian-pin]",
      );
      const mediaQuery = gsap.matchMedia();

      mediaQuery.add(
        {
          desktop: "(min-width: 960px)",
          motionAllowed: "(prefers-reduced-motion: no-preference)",
          reducedMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { desktop, motionAllowed, reducedMotion } = context.conditions;

          if (reducedMotion) {
            gsap.set(media, {
              clearProps: "transform,filter,opacity",
            });
            return;
          }

          if (motionAllowed && marqueeTrack) {
            gsap.to(marqueeTrack, {
              xPercent: -50,
              duration: 32,
              ease: "none",
              repeat: -1,
            });
          }

          if (motionAllowed) {
            media.forEach((element) => {
              gsap
                .timeline({
                  scrollTrigger: {
                    trigger: element,
                    start: "top 90%",
                    end: "bottom 10%",
                    scrub: true,
                  },
                })
                .fromTo(
                  element,
                  {
                    scale: 0.8,
                    opacity: 0.42,
                    filter: "grayscale(1) brightness(0.65) contrast(1.25)",
                  },
                  {
                    scale: 1,
                    opacity: 1,
                    filter: "grayscale(0.25) brightness(0.92) contrast(1.15)",
                    duration: 0.45,
                    ease: "none",
                  },
                )
                .to(element, {
                  scale: 0.96,
                  opacity: 0.2,
                  filter: "grayscale(1) brightness(0.38) contrast(1.3)",
                  duration: 0.55,
                  ease: "none",
                });
            });
          }

          if (
            desktop &&
            motionAllowed &&
            guardianSection &&
            guardianPin
          ) {
            ScrollTrigger.create({
              trigger: guardianSection,
              start: "top 12%",
              end: "bottom 72%",
              pin: guardianPin,
              pinSpacing: false,
            });
          }
        },
      );

      return () => mediaQuery.revert();
    },
    { scope: storyRef },
  );

  const moveAccordionFocus = (event, currentIndex) => {
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % routeFactors.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex =
        (currentIndex - 1 + routeFactors.length) % routeFactors.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = routeFactors.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    setActiveFactor(nextIndex);
    accordionButtonRefs.current[nextIndex]?.focus();
  };

  return (
    <section className="product-story product-story-outfit" ref={storyRef}>
      <div
        className="story-marquee"
        role="region"
        aria-label="Data and routing sources used by GuardianRoute"
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
        <div className="story-chapter-heading">
          <p className="story-eyebrow">A normal route planner with a better objective</p>
          <h2 className="story-heading" id="ranking-title">
            Routes that read the{" "}
            <span
              className="story-inline-image-shell"
              data-story-media
              role="img"
              aria-label="A well-lit pedestrian route at dusk"
            >
              <img
                className="story-inline-image"
                src="https://picsum.photos/seed/redmond-evening-walk/480/240"
                alt=""
              />
            </span>{" "}
            street, not a stereotype.
          </h2>
        </div>

        <div className="story-bento-grid">
          <article className="story-bento-card story-bento-main">
            <div className="story-bento-copy">
              <ShieldCheck aria-hidden="true" size={38} weight="duotone" />
              <h3>Safest reasonable, by design</h3>
              <p>
                Existing directions engines generate realistic walking and transit
                options. GuardianRoute scores those candidates, then balances
                environmental safety with travel time instead of sending a teen on
                an impractical detour for a marginal gain.
              </p>
            </div>
            <div
              className="story-utility-visual"
              role="group"
              aria-label="Example route utility weighting"
            >
              <div className="story-utility-row">
                <span>Daytime route utility</span>
                <strong>70% safety + 30% travel time</strong>
              </div>
              <div className="story-utility-row story-utility-row-night">
                <span>After-dark route utility</span>
                <strong>85% safety + 15% travel time</strong>
              </div>
              <p>
                Every recommendation keeps the tradeoff visible, so families can
                understand why a route ranked first.
              </p>
            </div>
          </article>

          <article className="story-bento-card story-bento-side story-bento-factors">
            <div className="story-bento-icon">
              <MapPin aria-hidden="true" size={30} weight="duotone" />
            </div>
            <div>
              <h3>Block-by-block context</h3>
              <p>
                Walking legs become 50–100 meter segments, each scored for recent
                incidents, lighting gaps, pedestrian isolation, and transit waits.
              </p>
            </div>
          </article>

          <article className="story-bento-card story-bento-side story-bento-privacy">
            <div className="story-bento-icon">
              <LockKey aria-hidden="true" size={30} weight="duotone" />
            </div>
            <div>
              <h3>Trip-scoped by default</h3>
              <p>
                Monitoring begins with Start Safe Trip, follows the selected journey,
                and ends with the trip. Alerts share useful context only when a
                sustained pattern needs attention.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="story-chapter story-factors" aria-labelledby="factors-title">
        <div className="story-section-intro">
          <p className="story-eyebrow">Explainable inputs, never neighborhood labels</p>
          <h2 id="factors-title">What changes a route score?</h2>
          <p>
            Each signal answers a specific question about the path and the moment
            of travel. Explore how the MVP turns public data into clear route context.
          </p>
        </div>

        <div
          className="story-horizontal-accordion"
          role="group"
          aria-label="Objective route safety factors"
        >
          {routeFactors.map((factor, index) => {
            const isActive = activeFactor === index;
            const Icon = factor.Icon;
            const tabId = `${accordionId}-story-factor-tab-${factor.id}`;
            const panelId = `${accordionId}-story-factor-panel-${factor.id}`;

            return (
              <article
                className={`story-accordion-item${isActive ? " is-active" : ""}`}
                key={factor.id}
                onMouseEnter={() => setActiveFactor(index)}
              >
                <button
                  ref={(element) => {
                    accordionButtonRefs.current[index] = element;
                  }}
                  className="story-accordion-trigger"
                  id={tabId}
                  type="button"
                  aria-label={`Explore ${factor.title.toLowerCase()}`}
                  aria-expanded={isActive}
                  aria-controls={panelId}
                  onClick={() => setActiveFactor(index)}
                  onFocus={() => setActiveFactor(index)}
                  onKeyDown={(event) => moveAccordionFocus(event, index)}
                >
                  <Icon aria-hidden="true" size={28} weight="duotone" />
                  <span>{factor.title}</span>
                  <ArrowRight aria-hidden="true" size={18} weight="bold" />
                </button>
                <div
                  className="story-accordion-panel"
                  id={panelId}
                  role="region"
                  aria-labelledby={tabId}
                  hidden={!isActive}
                >
                  <p className="story-accordion-summary">{factor.summary}</p>
                  <p>{factor.detail}</p>
                  <strong>{factor.signal}</strong>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section
        id="guardian-story"
        className="story-chapter story-guardian"
        aria-labelledby="guardian-title"
        data-guardian-section
      >
        <div className="story-guardian-layout">
          <div className="story-guardian-pin" data-guardian-pin>
            <p className="story-eyebrow">A thoughtful response, not a noisy alarm</p>
            <h2 id="guardian-title">Guardian understands the journey.</h2>
            <p>
              Passive sharing shows a dot. GuardianRoute compares that dot with the
              route, ETA, expected stops, and the duration of a change before deciding
              what happens next.
            </p>
          </div>

          <ol className="story-guardian-sequence">
            {guardianStates.map(({ title, description, Icon }) => (
              <li className="story-guardian-state" key={title}>
                <div className="story-state-rail" aria-hidden="true">
                  <span className="story-state-dot" />
                  <span className="story-state-line" />
                </div>
                <article className="story-state-card">
                  <Icon aria-hidden="true" size={32} weight="duotone" />
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </article>
              </li>
            ))}
            <li className="story-guardian-state story-guardian-outcomes">
              <div className="story-state-rail" aria-hidden="true">
                <span className="story-state-branch-dot" />
              </div>
              <div
                className="story-state-branch"
                role="group"
                aria-label="The check-in has two possible outcomes"
              >
                {guardianOutcomes.map(({ title, description, Icon }) => (
                  <article className="story-state-card story-state-outcome" key={title}>
                    <Icon aria-hidden="true" size={32} weight="duotone" />
                    <div>
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="story-closing" aria-labelledby="story-closing-title">
        <div className="story-closing-copy">
          <h2 id="story-closing-title">Choose the route. Keep the context.</h2>
          <p>
            Plan with familiar map controls, then let GuardianRoute quietly watch
            whether the trip continues as expected.
          </p>
        </div>
        <div className="story-closing-actions">
          <button
            className="story-button story-button-primary"
            type="button"
            aria-label="Plan a safer route in the GuardianRoute demo"
            onClick={onPlanClick}
          >
            Plan a safer route
            <ArrowRight aria-hidden="true" size={20} weight="bold" />
          </button>
          <button
            className="story-button story-button-secondary"
            type="button"
            aria-label="Open the guardian experience in the GuardianRoute demo"
            onClick={onGuardianClick}
          >
            See the guardian view
          </button>
        </div>
      </section>

      <footer className="story-footer">
        <a className="story-footer-brand" href="#top" aria-label="GuardianRoute, back to top">
          <span className="story-footer-mark" aria-hidden="true">
            <ShieldCheck size={24} weight="fill" />
          </span>
          <span>GuardianRoute</span>
        </a>
        <p>Safety-first routing with explainable decisions and trip-aware support.</p>
        <div
          className="story-footer-tech"
          role="group"
          aria-label="Built with established mapping and transit tools"
        >
          <span>MapLibre</span>
          <span>OpenTripPlanner</span>
          <span>PostGIS</span>
        </div>
      </footer>
    </section>
  );
}
