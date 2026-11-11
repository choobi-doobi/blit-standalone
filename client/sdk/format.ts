/** Timestamp parsing and display. */

/** A bare SQLite `datetime('now')` timestamp: `2026-07-30 12:34:56`. */
const SQLITE_BARE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/;
const HAS_ZONE = /[zZ]|[+-]\d\d:?\d\d$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a route's timestamp, treating a zone-less SQLite timestamp as UTC (which is what SQLite wrote). */
export function parseTimestamp(input: string | number | Date | null | undefined): Date {
  if (input == null) return new Date(NaN);
  if (input instanceof Date) return input;
  if (typeof input === 'number') return new Date(input);
  const trimmed = input.trim();
  if (!trimmed) return new Date(NaN);
  return new Date(SQLITE_BARE.test(trimmed) && !HAS_ZONE.test(trimmed) ? `${trimmed.replace(' ', 'T')}Z` : trimmed);
}

/** Compact "time ago". Future timestamps clamp to `just now`, so clock skew never reads as the future. */
export function relativeTime(input: string | number | Date | null | undefined, now: number = Date.now()): string {
  const t = parseTimestamp(input).getTime();
  if (Number.isNaN(t)) return '';
  const secs = Math.max(0, Math.round((now - t) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** `1 Aug, 10:37`, gaining the year only once it differs from now. */
function absoluteStamp(d: Date, now: Date): string {
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).formatToParts(d);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${part('year')}`;
  return `${part('day')} ${part('month')}${year}, ${time}`;
}

/** A timestamp for display: relative under 24 hours, absolute after. */
export function timestampLabel(ts: number | null | undefined, nowMs: number = Date.now()): string {
  if (!ts || Number.isNaN(ts)) return '';
  return nowMs - ts < DAY_MS ? relativeTime(ts, nowMs) : absoluteStamp(new Date(ts), new Date(nowMs));
}
