import type { Queryable } from "../db/client";
import {
  subtractWindows,
  windowsForDate,
  type AvailabilityException,
  type WeeklyRule,
  type Window,
} from "@/domain/availability";
import { addDays, fromZoned, toZoned } from "@/lib/time";

export interface GuideAvailability {
  providerId: string;
  timezone: string;
  rules: WeeklyRule[];
  exceptions: AvailabilityException[];
  busy: { start: Date; end: Date; bookingId: string }[];
}

/** Loads working hours, exceptions and active reservations for providers over a date range. */
export async function loadGuideAvailability(
  db: Queryable,
  providerIds: string[],
  fromDate: string,
  toDate: string,
): Promise<Map<string, GuideAvailability>> {
  const result = new Map<string, GuideAvailability>();
  if (!providerIds.length) return result;

  const { rows: providers } = await db.query<{ id: string; timezone: string }>(
    "select id, timezone from provider_profiles where id = any($1::uuid[])",
    [providerIds],
  );
  for (const p of providers) result.set(p.id, { providerId: p.id, timezone: p.timezone, rules: [], exceptions: [], busy: [] });

  const { rows: rules } = await db.query<{ provider_id: string; weekday: number; start_time: string; end_time: string }>(
    "select provider_id, weekday, start_time, end_time from availability_rules where provider_id = any($1::uuid[])",
    [providerIds],
  );
  for (const r of rules) result.get(r.provider_id)?.rules.push({ weekday: r.weekday, startTime: r.start_time, endTime: r.end_time });

  const { rows: exceptions } = await db.query<{
    provider_id: string;
    date: string;
    kind: "unavailable" | "available";
    start_time: string | null;
    end_time: string | null;
  }>(
    `select provider_id, date, kind, start_time, end_time from availability_exceptions
      where provider_id = any($1::uuid[]) and date between $2 and $3`,
    [providerIds, fromDate, toDate],
  );
  for (const e of exceptions) {
    result.get(e.provider_id)?.exceptions.push({ date: e.date, kind: e.kind, startTime: e.start_time, endTime: e.end_time });
  }

  // Reservations overlapping the range (with a day of padding for time-zone edges).
  const rangeStart = fromZoned(addDays(fromDate, -1), "00:00");
  const rangeEnd = fromZoned(addDays(toDate, 2), "00:00");
  const { rows: holds } = await db.query<{ guide_provider_id: string; lower: Date; upper: Date; booking_id: string }>(
    `select guide_provider_id, lower(during) as lower, upper(during) as upper, booking_id
       from inventory_holds
      where kind = 'guide' and guide_provider_id = any($1::uuid[])
        and (status = 'confirmed' or (status = 'held' and expires_at > now()))
        and during && tstzrange($2, $3)`,
    [providerIds, rangeStart, rangeEnd],
  );
  for (const h of holds) result.get(h.guide_provider_id)?.busy.push({ start: h.lower, end: h.upper, bookingId: h.booking_id });

  return result;
}

/**
 * Free windows (local minutes) on a date for a service with the given buffer.
 * Existing reservations are widened backwards by `bufferMinutes` so the new booking's own
 * post-service buffer can't collide with them either.
 */
export function freeWindowsOn(
  av: GuideAvailability,
  date: string,
  opts: { bufferMinutes?: number; ignoreBookingId?: string } = {},
): Window[] {
  const working = windowsForDate(date, av.rules, av.exceptions);
  const dayStart = fromZoned(date, "00:00", av.timezone).getTime();
  const dayEnd = dayStart + 24 * 60 * 60_000;
  const buffer = (opts.bufferMinutes ?? 0) * 60_000;
  const busy: Window[] = av.busy
    .filter((b) => b.bookingId !== opts.ignoreBookingId)
    .map((b) => ({ start: b.start.getTime() - buffer, end: b.end.getTime() }))
    .filter((b) => b.end > dayStart && b.start < dayEnd)
    .map((b) => ({
      start: Math.max(0, Math.floor((b.start - dayStart) / 60_000)),
      end: Math.min(24 * 60, Math.ceil((b.end - dayStart) / 60_000)),
    }));
  return subtractWindows(working, busy);
}

/** True if the guide has at least one free window long enough for `minMinutes` on the date. */
export function hasCapacityOn(av: GuideAvailability, date: string, minMinutes: number): boolean {
  return freeWindowsOn(av, date).some((w) => w.end - w.start >= minMinutes);
}

export function localDate(instant: Date, tz: string): string {
  return toZoned(instant, tz).date;
}
