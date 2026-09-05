"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  ArrowCounterClockwise,
  MapTrifold,
  Pause,
  Path,
  Play,
  ShieldCheck,
  UsersThree,
} from "@phosphor-icons/react";
import TeenTripScreen from "./components/TeenTripScreen.jsx";
import ParentDashboard from "./components/ParentDashboard.jsx";
import ProductStory from "./components/ProductStory.jsx";
import { useStore, setState, getState, resetDemo } from "./store.js";
import { pushLocation, expireCheckin, endTrip } from "./actions.js";
import { interpolatePath, nearestIndex } from "./logic/geo.js";
import demoRoutes from "./data/demo_routes.json";

gsap.registerPlugin(useGSAP);

const deviationPoints = interpolatePath(demoRoutes.deviationPath, 40);

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 42 42" role="presentation">
        <path d="M8 10.5 21 5l13 5.5v9.8c0 8.4-5.4 13.9-13 16.7C13.4 34.2 8 28.7 8 20.3Z" />
        <path d="M14.5 26.5c3.6-6.3 7.2-9.7 13.5-12" />
        <circle cx="14.5" cy="26.5" r="2.2" />
        <circle cx="28" cy="14.5" r="2.2" />
      </svg>
    </span>
  );
}

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
}

export default function App() {
  const appRef = useRef(null);
  const [mode, setMode] = useState("teen");
  const { trip, checkin, simulation } = useStore();
  const active = trip && (trip.status === "active" || trip.status === "alert");

  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        { reduceMotion: "(prefers-reduced-motion: reduce)" },
        (context) => {
          if (context.conditions.reduceMotion) {
            gsap.set([".hero-reveal", ".hero-visual"], {
              clearProps: "all",
            });
            return;
          }

          gsap.from(".hero-reveal", {
            y: 42,
            autoAlpha: 0,
            duration: 0.9,
            stagger: 0.09,
            ease: "power3.out",
          });
          gsap.from(".hero-visual", {
            y: 52,
            scale: 0.88,
            rotation: 1.8,
            autoAlpha: 0,
            duration: 1.2,
            delay: 0.16,
            ease: "power3.out",
          });
        },
      );
      return () => media.revert();
    },
    { scope: appRef },
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hashMode = window.location.hash === "#parent" ? "parent" : "teen";
    setMode(hashMode);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#parent" || window.location.hash === "#teen") {
      window.history.replaceState(
        null,
        "",
        mode === "parent" ? "#parent" : "#teen",
      );
    }
  }, [mode]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const state = getState();
      const current = state.trip;
      if (
        !current ||
        (current.status !== "active" && current.status !== "alert")
      ) {
        return;
      }

      if (
        state.checkin?.status === "waiting" &&
        Date.now() >= state.checkin.expiresAt
      ) {
        expireCheckin();
        return;
      }

      const sim = state.simulation;
      if (!sim.running) return;
      if (sim.lastTickAt && Date.now() - sim.lastTickAt < 900) return;

      if (sim.stopped) {
        const minutesStopped = sim.minutesStopped + 1;
        setState({
          simulation: { ...sim, minutesStopped, lastTickAt: Date.now() },
        });
        pushLocation(current.location, { speed: 0, elapsedSeconds: 60 });
        return;
      }

      const path = sim.offRoute ? deviationPoints : current.route.points;
      const nextIndex = Math.min(sim.index + 1, path.length - 1);
      setState({
        simulation: {
          ...sim,
          index: nextIndex,
          minutesStopped: 0,
          lastTickAt: Date.now(),
        },
      });
      pushLocation(path[nextIndex], { speed: 1.4, elapsedSeconds: 60 });

      if (!sim.offRoute && nextIndex === path.length - 1) {
        endTrip("completed");
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const controls = useMemo(
    () => [
      {
        label: simulation.stopped ? "Resume trip" : "Simulate stop",
        icon: simulation.stopped ? Play : Pause,
        disabled: !active,
        onClick: () =>
          setState({
            simulation: {
              ...getState().simulation,
              stopped: !simulation.stopped,
              minutesStopped: 0,
            },
          }),
      },
      {
        label: simulation.offRoute ? "Return to route" : "Simulate detour",
        icon: simulation.offRoute ? ArrowCounterClockwise : Path,
        disabled: !active,
        onClick: () => {
          const state = getState();
          const sim = state.simulation;
          const goingOffRoute = !sim.offRoute;
          const index = goingOffRoute
            ? nearestIndex(state.trip.location, deviationPoints)
            : nearestIndex(state.trip.location, state.trip.route.points);
          setState({
            simulation: {
              ...sim,
              offRoute: goingOffRoute,
              index,
              stopped: false,
              minutesStopped: 0,
            },
          });
        },
      },
      {
        label: "Reset",
        icon: ArrowCounterClockwise,
        disabled: false,
        onClick: resetDemo,
      },
    ],
    [active, simulation.stopped, simulation.offRoute],
  );

  return (
    <div ref={appRef} className="site-shell" id="top">
      <header className="nav-wrap">
        <nav className="site-nav" aria-label="Primary navigation">
          <button
            type="button"
            className="brand"
            onClick={() => scrollToId("top")}
            aria-label="GuardianRoute home"
          >
            <BrandMark />
            <span className="brand-name">GuardianRoute</span>
          </button>

          <div className="nav-links" aria-label="Page sections">
            <button type="button" onClick={() => scrollToId("planner")}>
              Plan
            </button>
            <button type="button" onClick={() => scrollToId("guardian-story")}>
              Guardian
            </button>
            <button type="button" onClick={() => scrollToId("route-intelligence")}>
              How it works
            </button>
          </div>

          <div className="mode-toggle" aria-label="Choose product view">
            <button
              type="button"
              className={mode === "teen" ? "active" : ""}
              aria-pressed={mode === "teen"}
              onClick={() => {
                setMode("teen");
                window.history.replaceState(null, "", "#teen");
              }}
            >
              <MapTrifold size={17} weight="bold" aria-hidden="true" />
              <span>Teen</span>
            </button>
            <button
              type="button"
              className={mode === "parent" ? "active" : ""}
              aria-pressed={mode === "parent"}
              onClick={() => {
                setMode("parent");
                window.history.replaceState(null, "", "#parent");
              }}
            >
              <UsersThree size={17} weight="bold" aria-hidden="true" />
              <span>Guardian</span>
              {mode !== "parent" && checkin?.status === "expired" && (
                <span className="notification-dot" aria-label="New guardian alert" />
              )}
            </button>
          </div>
        </nav>
      </header>

      <main className="page-main overflow-x-hidden w-full max-w-full">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-ambient" aria-hidden="true" />
          <div className="hero-copy">
            <p className="hero-overline hero-reveal">Navigate normally. Arrive thoughtfully.</p>
            <h1 id="hero-title" className="hero-title max-w-6xl hero-reveal">
              The route home, chosen for more than
              <span className="inline-street-image" aria-hidden="true" />
              speed.
            </h1>
            <p className="hero-description hero-reveal">
              GuardianRoute compares reasonable walking and transit options,
              explains the conditions behind its recommendation, and notices
              when an active trip stops going as planned.
            </p>
            <div className="hero-actions hero-reveal">
              <button
                type="button"
                className="button button-lime button-large"
                onClick={() => scrollToId("planner")}
              >
                Plan a safe route
                <Path size={19} weight="bold" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="button button-ink button-large"
                onClick={() => scrollToId("guardian-story")}
              >
                Watch Guardian respond
              </button>
            </div>
          </div>

          <div className="hero-visual" aria-label="An evening route home in Redmond">
            <div className="hero-photo" />
            <div className="hero-photo-wash" />
            <svg className="hero-route-line" viewBox="0 0 620 540" aria-hidden="true">
              <path
                className="route-shadow"
                d="M64 430C156 394 132 302 238 290s94-112 184-132 84-72 139-92"
              />
              <path d="M64 430C156 394 132 302 238 290s94-112 184-132 84-72 139-92" />
              <circle cx="64" cy="430" r="11" />
              <circle cx="561" cy="66" r="11" />
            </svg>
            <div className="hero-location hero-location-start">
              <span>From</span>
              <strong>Redmond Library</strong>
            </div>
            <div className="hero-location hero-location-end">
              <span>To</span>
              <strong>Home</strong>
            </div>
            <div className="hero-privacy-note">
              <ShieldCheck size={20} weight="fill" aria-hidden="true" />
              <span>Shared only during an active trip</span>
            </div>
          </div>
        </section>

        <section id="planner" className="planner-section" aria-labelledby="planner-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Live Redmond prototype</p>
              <h2 id="planner-title">
                {mode === "teen" ? "Choose with context." : "Know when it matters."}
              </h2>
            </div>
            <p>
              {mode === "teen"
                ? "Compare familiar routes without trading away the rest of your evening."
                : "See the expected trip, the latest update, and only the alerts that need attention."}
            </p>
          </div>

          <div className={`product-frame product-frame-${mode}`}>
            <header className="product-bar">
              <div className="product-identity">
                <BrandMark />
                <div>
                  <strong>GuardianRoute</strong>
                  <span>{mode === "teen" ? "Teen trip planner" : "Guardian dashboard"}</span>
                </div>
              </div>

              <div className="product-status" aria-live="polite">
                <span className={active ? "status-orb status-orb-live" : "status-orb"} />
                {active ? "Trip monitoring active" : "Ready to plan"}
              </div>
            </header>

            <div className="simulator-toolbar" aria-label="Trip simulator controls">
              <div className="simulator-copy">
                <span>Interactive demo</span>
                <strong>{active ? "Try a trip event" : "Start a trip to unlock events"}</strong>
              </div>
              <div className="simulator-actions">
                {controls.map((control) => {
                  const Icon = control.icon;
                  return (
                    <button
                      key={control.label}
                      type="button"
                      disabled={control.disabled}
                      onClick={control.onClick}
                    >
                      <Icon size={16} weight="bold" aria-hidden="true" />
                      <span>{control.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="product-content">
              {mode === "teen" ? <TeenTripScreen /> : <ParentDashboard />}
            </div>
          </div>
        </section>

        <ProductStory
          onPlanClick={() => scrollToId("planner")}
          onGuardianClick={() => {
            setMode("parent");
            window.history.replaceState(null, "", "#parent");
            scrollToId("planner");
          }}
        />
      </main>
    </div>
  );
}
