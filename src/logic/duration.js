/**
 * Durations read as minutes up to an hour, then as hours and minutes.
 * "94 min" is hard to picture; "1 hr 34 min" is not.
 */
export function formatMinutes(value, { long = false } = {}) {
  const total = Math.round(Number(value));
  if (!Number.isFinite(total)) return long ? "unknown" : "—";
  if (total < 60) {
    return long ? `${total} minute${total === 1 ? "" : "s"}` : `${total} min`;
  }

  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (long) {
    const hourPart = `${hours} hour${hours === 1 ? "" : "s"}`;
    return minutes === 0
      ? hourPart
      : `${hourPart} ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

/** Same rule, but for a bare delta such as "+12 min" / "+1 hr 5 min". */
export function formatMinutesDelta(value) {
  const total = Math.round(Number(value));
  if (!Number.isFinite(total) || total === 0) return null;
  const sign = total > 0 ? "+" : "−";
  return `${sign}${formatMinutes(Math.abs(total))}`;
}
