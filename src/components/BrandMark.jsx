/**
 * The Sentinel wordmark is a flat PNG on a white plate, so on light surfaces it
 * is composited with `multiply` (see .brand-lockup img) to drop the plate. Dark
 * surfaces get the glyph on its own instead — the arrow-through-a-ring mark the
 * logo uses in place of its "e" — drawn as SVG so it stays crisp and inherits
 * colour.
 */
export default function BrandMark({ variant = "wordmark", className = "" }) {
  if (variant === "glyph") {
    return (
      <span className={`brand-glyph ${className}`.trim()} aria-hidden="true">
        <svg viewBox="0 0 32 32" role="presentation">
          {/* Open ring: a near-full circle with a gap on the right, matching
              the logo's "e" where the arrow breaks through. */}
          <path
            className="brand-glyph-ring"
            d="M24.2 22.6a10 10 0 1 1 1.3-8.4"
          />
          <path
            className="brand-glyph-arrow"
            d="M11.5 16h9.2m0 0-3.5-3.5M20.7 16l-3.5 3.5"
          />
        </svg>
      </span>
    );
  }

  return (
    <span className={`brand-lockup ${className}`.trim()}>
      <img
        src="/sentinel-wordmark.png"
        alt="Sentinel"
        width={1026}
        height={228}
        decoding="async"
      />
    </span>
  );
}
