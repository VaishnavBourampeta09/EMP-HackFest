"use client";

import Link from "next/link";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowRight, Path } from "@phosphor-icons/react";
import BrandMark from "./components/BrandMark.jsx";
import ProductStory from "./components/ProductStory.jsx";

gsap.registerPlugin(useGSAP);

export default function App() {
  const appRef = useRef(null);
  const router = useRouter();

  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add({ reduceMotion: "(prefers-reduced-motion: reduce)" }, (context) => {
        if (context.conditions.reduceMotion) {
          gsap.set([".hero-reveal", ".hero-panel"], { clearProps: "all" });
          return;
        }
        gsap.from(".hero-reveal", {
          y: 16,
          autoAlpha: 0,
          duration: 0.6,
          stagger: 0.06,
          ease: "power2.out",
        });
        gsap.from(".hero-panel", {
          y: 20,
          autoAlpha: 0,
          duration: 0.7,
          delay: 0.1,
          ease: "power2.out",
        });
      });
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

          <Link className="nav-planner-link" href="/planner">
            Open Mapper
            <ArrowRight size={15} weight="bold" aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main className="page-main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="hero-eyebrow hero-reveal">
                Safety-aware routing for Redmond
              </p>

              <h1 id="hero-title" className="hero-title hero-reveal">
                Maps get you home.
                <span>Sentinel makes sure you get home safely.</span>
              </h1>

              <p className="hero-lede hero-reveal">
                A walking and transit planner that scores every route on what is
                actually mapped along it: recent police reports, street
                lighting, and transit waits. It then recommends the safest
                route that is still reasonable to take.
              </p>

              <div className="hero-actions hero-reveal">
                <Link className="button button-primary button-large" href="/planner">
                  Plan a route
                  <Path size={18} weight="bold" aria-hidden="true" />
                </Link>
                <Link
                  className="button button-outline button-large"
                  href="/planner#parent"
                >
                  Guardian view
                </Link>
              </div>
            </div>

            <figure className="hero-panel">
              <figcaption className="hero-panel-head">
                <span className="hero-panel-eyebrow">Tonight · 9:42 PM</span>
                <span className="hero-panel-chip">Recommended</span>
              </figcaption>

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
                  <dt>Conditions</dt>
                  <dd>86</dd>
                </div>
              </dl>

              <p className="hero-panel-reason">
                Chosen over a 17-minute route with two unlit blocks and a recent
                late-night incident report.
              </p>
            </figure>
          </div>

        </section>

        <ProductStory onPlanClick={() => router.push("/planner")} />
      </main>
    </div>
  );
}
