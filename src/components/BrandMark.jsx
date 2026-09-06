/**
 * The Escort wordmark is a flat PNG on a white plate, so on light surfaces it is
 * composited with `multiply` (see .brand-lockup img) to drop the plate. Dark
 * surfaces get the glyph on its own instead, drawn as an SVG so it stays crisp
 * and inherits colour.
 */
export default function BrandMark({ variant = "wordmark", className = "" }) {
  if (variant === "glyph") {
    return (
      <span className={`brand-glyph ${className}`.trim()} aria-hidden="true">
        <svg viewBox="0 0 32 32" role="presentation">
          <circle className="brand-glyph-ring" cx="16" cy="16" r="12.5" />
          <path
            className="brand-glyph-arrow"
            d="M21.8 10.2 13.4 13.6a.5.5 0 0 0-.08.88l3.03 1.94 1.94 3.03a.5.5 0 0 0 .88-.08l3.4-8.4a.5.5 0 0 0-.65-.65Z"
          />
        </svg>
      </span>
    );
  }

  return (
    <span className={`brand-lockup ${className}`.trim()}>
      <img
        src="/escort-logo.png"
        alt="Escort"
        width={2639}
        height={694}
        decoding="async"
      />
    </span>
  );
}
