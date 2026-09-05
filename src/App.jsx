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
            gsap.set([".hero-reveal", ".hero-visual"], { clearProps: "all" });
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

  return (
    <div ref={appRef} className="site-shell" id="top">
      <header className="nav-wrap">
        <nav className="site-nav" aria-label="Primary navigation">
          <Link className="brand" href="/" aria-label="GuardianRoute home">
            <BrandMark />
            <span className="brand-name">GuardianRoute</span>
          </Link>

          <div className="nav-links" aria-label="Page sections">
            <button type="button" onClick={() => scrollToId("route-intelligence")}>
              How it works
            </button>
            <button type="button" onClick={() => scrollToId("guardian-story")}>
              Guardian
            </button>
          </div>

          <Link className="nav-planner-link" href="/planner">
            Open planner
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </Link>
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
              <Link className="button button-lime button-large" href="/planner">
                Plan a safe route
                <Path size={19} weight="bold" aria-hidden="true" />
              </Link>
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

        <ProductStory
          onPlanClick={() => router.push("/planner")}
          onGuardianClick={() => router.push("/planner#parent")}
        />
      </main>
    </div>
  );
}
