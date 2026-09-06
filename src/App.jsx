"use client";

import Link from "next/link";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowRight, Path, ShieldCheck } from "@phosphor-icons/react";
import BrandMark from "./components/BrandMark.jsx";
import ProductStory from "./components/ProductStory.jsx";

gsap.registerPlugin(useGSAP);

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
}

const heroStats = [
  { value: "50–100 m", label: "Route segment resolution" },
  { value: "6", label: "Public data sources scored" },
  { value: "Trip-scoped", label: "Sharing starts and ends with the trip" },
];

export default function App() {
  const appRef = useRef(null);
  const router = useRouter();

  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        { reduceMotion: "(prefers-reduced-motion: reduce)" },
        (context) => {
          if (context.conditions.reduceMotion) {
            gsap.set([".hero-reveal", ".hero-panel"], { clearProps: "all" });
            return;
          }

          gsap.from(".hero-reveal", {
            y: 18,
            autoAlpha: 0,
            duration: 0.7,
            stagger: 0.07,
            ease: "power2.out",
          });
          gsap.from(".hero-panel", {
            y: 24,
            autoAlpha: 0,
            duration: 0.8,
            delay: 0.12,
            ease: "power2.out",
          });
        },
      );
      return () => media.revert();
    },
    { scope: appRef },
  );

  return (
    <div ref={appRef} className="site-shell" id="top">
      <header className="nav-wrap">
        <nav className="site-nav" aria-label="Primary navigation">
          <Link className="brand" href="/" aria-label="Sentinel home">
            <BrandMark />
          </Link>

          <div className="nav-links" aria-label="Page sections">
            <button
              type="button"
              onClick={() => scrollToId("route-intelligence")}
            >
              How it works
            </button>
            <button type="button" onClick={() => scrollToId("guardian-story")}>
              Guardian
            </button>
          </div>

          <Link className="nav-planner-link" href="/planner">
            Open planner
            <ArrowRight size={15} weight="bold" aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main className="page-main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-grid">
            <div className="hero-copy">
              <h1 id="hero-title" className="hero-title">
                Maps get you home. Sentinel makes sure you get home safely.
              </h1>
              <div className="hero-actions hero-reveal">
                <Link
                  className="button button-primary button-large"
                  href="/planner"
                >
                  Plan a route
                  <Path size={18} weight="bold" aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="hero-panel">
              <div className="hero-route">
                <div className="hero-route-point">
                  <span className="hero-route-dot" aria-hidden="true" />
                  <div>
                    <span>From</span>
                    <strong>Redmond Library</strong>
                  </div>
                </div>
                <div className="hero-route-connector" aria-hidden="true" />
                <div className="hero-route-point">
                  <span
                    className="hero-route-dot hero-route-dot-end"
                    aria-hidden="true"
                  />
                  <div>
                    <span>To</span>
                    <strong>Home · 148th Ave NE</strong>
                  </div>
                </div>
              </div>

              <dl className="hero-panel-metrics">
                <div>
                  <dt>Walk time</dt>
                  <dd>21 min</dd>
                </div>
                <div>
                  <dt>Lit coverage</dt>
                  <dd>92%</dd>
                </div>
                <div>
                  <dt>Route score</dt>
                  <dd>8.6</dd>
                </div>
              </dl>

              <p className="hero-panel-reason">
                Chosen over a 17-minute route with two unlit blocks and a recent
                late-night incident report.
              </p>
            </div>
          </div>

          <ul className="hero-stats hero-reveal">
            {heroStats.map(({ value, label }) => (
              <li key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </section>

        <ProductStory
          onPlanClick={() => router.push("/planner")}
          onGuardianClick={() => router.push("/planner#parent")}
        />
      </main>
    </div>
  );
}
