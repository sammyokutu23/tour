import { coversInterval, type Window } from "./availability";
import { estimateTravelMinutes, type LatLng } from "./geo";
import { toZoned } from "@/lib/time";

/** Minimum slack between consecutive activities on top of travel time (check-in, toilets, etc.). */
export const TRANSITION_MINUTES = 15;

export type IssueSeverity = "error" | "warning" | "info";

export interface ScheduleIssue {
  itemId: string | null;
  severity: IssueSeverity;
  code:
    | "invalid_time"
    | "outside_trip"
    | "wrong_day"
    | "overlap"
    | "travel_buffer"
    | "travel_unknown"
    | "min_notice"
    | "slot_unavailable"
    | "slot_full"
    | "over_capacity"
    | "guide_unavailable"
    | "guide_over_capacity"
    | "listing_unavailable"
    | "duplicate";
  message: string;
}

export interface ScheduleItem {
  id: string;
  kind: "experience" | "guide" | "note";
  title: string;
  dayDate: string;
  startsAt: Date | null;
  endsAt: Date | null;
  location: LatLng | null;
  minNoticeHours: number;
  listingAvailable: boolean;
  /** Experience items */
  slot?: {
    id: string;
    status: "open" | "closed" | "cancelled";
    capacity: number;
    reserved: number;
  } | null;
  maxGroupSize?: number;
  /** Capacity units this item consumes in its slot (1 for per-group pricing, else the party size). */
  slotUnits?: number;
  /** Guide items: windows in the guide's local time zone, with existing reservations already removed. */
  guideWindows?: Window[];
  guideTimezone?: string;
  guideProviderId?: string;
}

export interface ScheduleContext {
  now: Date;
  tripStart: string;
  tripEnd: string;
  timezone: string;
  party: number;
}

const fmt = (minutes: number) => `${minutes} min`;

export function validateSchedule(items: ScheduleItem[], ctx: ScheduleContext): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];
  const add = (issue: ScheduleIssue) => issues.push(issue);

  for (const item of items) {
    if (item.kind === "note") continue;
    if (!item.listingAvailable) {
      add({ itemId: item.id, severity: "error", code: "listing_unavailable", message: `${item.title} is no longer available for booking.` });
    }
    if (!item.startsAt || !item.endsAt || item.endsAt <= item.startsAt) {
      add({ itemId: item.id, severity: "error", code: "invalid_time", message: `${item.title} has an invalid start or end time.` });
      continue;
    }
    if (item.dayDate < ctx.tripStart || item.dayDate > ctx.tripEnd) {
      add({ itemId: item.id, severity: "error", code: "outside_trip", message: `${item.title} falls outside your travel dates.` });
    }
    const localStart = toZoned(item.startsAt, ctx.timezone);
    if (localStart.date !== item.dayDate) {
      add({ itemId: item.id, severity: "error", code: "wrong_day", message: `${item.title} starts on ${localStart.date}, not on this day.` });
    }
    const noticeMs = item.minNoticeHours * 3_600_000;
    if (item.startsAt.getTime() - ctx.now.getTime() < noticeMs) {
      add({
        itemId: item.id,
        severity: "error",
        code: "min_notice",
        message: `${item.title} must be booked at least ${item.minNoticeHours} hours in advance.`,
      });
    }
    if (item.maxGroupSize !== undefined && ctx.party > item.maxGroupSize) {
      add({
        itemId: item.id,
        severity: "error",
        code: item.kind === "guide" ? "guide_over_capacity" : "over_capacity",
        message: `${item.title} accepts up to ${item.maxGroupSize} travellers; your group has ${ctx.party}.`,
      });
    }

    if (item.kind === "experience") {
      const slot = item.slot;
      if (!slot || slot.status !== "open") {
        add({ itemId: item.id, severity: "error", code: "slot_unavailable", message: `The selected time for ${item.title} is no longer offered.` });
      } else if (slot.capacity - slot.reserved < (item.slotUnits ?? ctx.party)) {
        const left = Math.max(0, slot.capacity - slot.reserved);
        add({
          itemId: item.id,
          severity: "error",
          code: "slot_full",
          message: left === 0 ? `${item.title} is fully booked at this time.` : `${item.title} has only ${left} place${left === 1 ? "" : "s"} left at this time.`,
        });
      }
    }

    if (item.kind === "guide") {
      const tz = item.guideTimezone ?? ctx.timezone;
      const s = toZoned(item.startsAt, tz);
      const e = toZoned(item.endsAt, tz);
      const sameDay = s.date === e.date || (e.minutes === 0 && item.endsAt.getTime() - item.startsAt.getTime() <= 86_400_000);
      const endMinutes = e.date === s.date ? e.minutes : 24 * 60;
      if (!sameDay || !coversInterval(item.guideWindows ?? [], s.minutes, endMinutes)) {
        add({ itemId: item.id, severity: "error", code: "guide_unavailable", message: `${item.title}: the guide is not available at this time.` });
      }
    }
  }

  // Overlaps and travel buffers between activities (guide items are coverage, not activities).
  const timed = items
    .filter((i): i is ScheduleItem & { startsAt: Date; endsAt: Date } => i.kind === "experience" && !!i.startsAt && !!i.endsAt && i.endsAt > i.startsAt)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const seenSlots = new Set<string>();
  for (const item of timed) {
    if (item.slot) {
      if (seenSlots.has(item.slot.id)) {
        add({ itemId: item.id, severity: "warning", code: "duplicate", message: `${item.title} is already in your itinerary at this time.` });
      }
      seenSlots.add(item.slot.id);
    }
  }

  // The same guide can't be booked twice at overlapping times within one itinerary.
  const guideItems = items
    .filter((i): i is ScheduleItem & { startsAt: Date; endsAt: Date } => i.kind === "guide" && !!i.startsAt && !!i.endsAt && !!i.guideProviderId)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  for (let i = 0; i < guideItems.length; i++) {
    for (let j = i + 1; j < guideItems.length; j++) {
      const a = guideItems[i];
      const b = guideItems[j];
      if (a.guideProviderId === b.guideProviderId && b.startsAt < a.endsAt) {
        add({ itemId: b.id, severity: "error", code: "overlap", message: `${b.title} overlaps with another booking of the same guide.` });
      }
    }
  }

  for (let i = 1; i < timed.length; i++) {
    const prev = timed[i - 1];
    const next = timed[i];
    if (next.startsAt < prev.endsAt) {
      add({ itemId: next.id, severity: "error", code: "overlap", message: `${next.title} overlaps with ${prev.title}.` });
      continue;
    }
    if (toZoned(prev.endsAt, ctx.timezone).date !== toZoned(next.startsAt, ctx.timezone).date) continue;
    const gap = Math.round((next.startsAt.getTime() - prev.endsAt.getTime()) / 60_000);
    if (!prev.location || !next.location) {
      add({
        itemId: next.id,
        severity: "info",
        code: "travel_unknown",
        message: `Travel time from ${prev.title} to ${next.title} is unknown; allow enough time between them.`,
      });
      continue;
    }
    const travel = estimateTravelMinutes(prev.location, next.location);
    const needed = travel + TRANSITION_MINUTES;
    if (gap < needed) {
      add({
        itemId: next.id,
        severity: "warning",
        code: "travel_buffer",
        message: `Estimated travel from ${prev.title} is about ${fmt(travel)}, but only ${fmt(gap)} is planned between activities (estimate, not a verified route).`,
      });
    }
  }

  return issues;
}

export function hasBlockingIssues(issues: ScheduleIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
