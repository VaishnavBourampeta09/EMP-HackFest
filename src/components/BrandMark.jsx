export default function BrandMark({ compact = false }) {
  return (
    <span className={compact ? "brand-mark brand-mark-compact" : "brand-mark"} aria-hidden="true">
      <svg viewBox="0 0 42 42" role="presentation">
        <path d="M8 10.5 21 5l13 5.5v9.8c0 8.4-5.4 13.9-13 16.7C13.4 34.2 8 28.7 8 20.3Z" />
        <path d="M14.5 26.5c3.6-6.3 7.2-9.7 13.5-12" />
        <circle cx="14.5" cy="26.5" r="2.2" />
        <circle cx="28" cy="14.5" r="2.2" />
      </svg>
    </span>
  );
}
