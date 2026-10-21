import { timeToMinutes, weekdayOf } from "@/lib/time";

/** A half-open interval [start, end) in minutes since local midnight. */
export interface Window {
  start: number;
  end: number;
}

export interface WeeklyRule {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface AvailabilityException {
  date: string;
  kind: "unavailable" | "available";
  startTime: string | null;
  endTime: string | null;
}

function normalize(windows: Window[]): Window[] {
  const sorted = windows.filter((w) => w.end > w.start).sort((a, b) => a.start - b.start);
  const out: Window[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else out.push({ ...w });
  }
  return out;
}

export function subtractWindows(windows: Window[], busy: Window[]): Window[] {
  let result = normalize(windows);
  for (const b of normalize(busy)) {
    const next: Window[] = [];
    for (const w of result) {
      if (b.end <= w.start || b.start >= w.end) {
        next.push(w);
        continue;
      }
      if (b.start > w.start) next.push({ start: w.start, end: b.start });
      if (b.end < w.end) next.push({ start: b.end, end: w.end });
    }
    result = next;
  }
  return result;
}

/** Working windows for a calendar date after applying weekly rules and date exceptions. */
export function windowsForDate(date: string, rules: WeeklyRule[], exceptions: AvailabilityException[]): Window[] {
  const weekday = weekdayOf(date);
  const todays = exceptions.filter((e) => e.date === date);
  if (todays.some((e) => e.kind === "unavailable" && e.startTime === null)) return [];

  let windows = rules
    .filter((r) => r.weekday === weekday)
    .map((r) => ({ start: timeToMinutes(r.startTime), end: timeToMinutes(r.endTime) }));

  windows = normalize([
    ...windows,
    ...todays
      .filter((e) => e.kind === "available" && e.startTime && e.endTime)
      .map((e) => ({ start: timeToMinutes(e.startTime!), end: timeToMinutes(e.endTime!) })),
  ]);

  const blocked = todays
    .filter((e) => e.kind === "unavailable" && e.startTime && e.endTime)
    .map((e) => ({ start: timeToMinutes(e.startTime!), end: timeToMinutes(e.endTime!) }));
  return subtractWindows(windows, blocked);
}

export function coversInterval(windows: Window[], start: number, end: number): boolean {
  return normalize(windows).some((w) => w.start <= start && w.end >= end);
}
