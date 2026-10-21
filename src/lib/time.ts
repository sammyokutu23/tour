/**
 * Time-zone helpers built on Intl, so they work for any IANA zone (Kenya is UTC+3 with no DST,
 * but nothing here assumes that). Dates are 'YYYY-MM-DD', times 'HH:MM' in local wall-clock time.
 */

export const DEFAULT_TZ = "Africa/Nairobi";

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatterCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ZonedParts {
  date: string;
  time: string;
  weekday: number;
  minutes: number; // minutes since local midnight
}

export function toZoned(instant: Date, tz = DEFAULT_TZ): ZonedParts {
  const parts = Object.fromEntries(partsFormatter(tz).formatToParts(instant).map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
    weekday: WEEKDAYS.indexOf(parts.weekday),
    minutes: Number(hour) * 60 + Number(parts.minute),
  };
}

function offsetMinutes(instant: Date, tz: string): number {
  const p = Object.fromEntries(partsFormatter(tz).formatToParts(instant).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour === "24" ? 0 : p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** Converts a local wall-clock date + time in `tz` to a UTC instant. */
export function fromZoned(date: string, time: string, tz = DEFAULT_TZ): Date {
  const [y, m, d] = parseDate(date);
  const [hh, mm] = parseTime(time);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = offsetMinutes(new Date(guess), tz);
  let utc = guess - first * 60_000;
  const second = offsetMinutes(new Date(utc), tz);
  if (second !== first) utc = guess - second * 60_000;
  return new Date(utc);
}

export function parseDate(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) throw new Error(`Invalid date: ${date}`);
  return [y, mo, d];
}

export function parseTime(time: string): [number, number] {
  const m = /^(\d{2}):(\d{2})/.exec(time);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`Invalid time: ${time}`);
  return [Number(m[1]), Number(m[2])];
}

export function timeToMinutes(time: string): number {
  const [h, m] = parseTime(time);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  const [y1, m1, d1] = parseDate(start);
  const [y2, m2, d2] = parseDate(end);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Weekday (0 = Sunday) of a calendar date, independent of time zone. */
export function weekdayOf(date: string): number {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function formatDate(date: string | Date, opts: Intl.DateTimeFormatOptions = {}, tz = DEFAULT_TZ): string {
  const instant = typeof date === "string" ? new Date(`${date}T12:00:00Z`) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: typeof date === "string" ? "UTC" : tz,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(instant);
}

export function formatTime(instant: Date, tz = DEFAULT_TZ): string {
  return toZoned(instant, tz).time;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
