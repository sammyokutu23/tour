import { describe, expect, it } from "vitest";
import { validateSchedule, hasBlockingIssues, type ScheduleItem } from "@/domain/scheduling";
import { windowsForDate, subtractWindows, coversInterval } from "@/domain/availability";
import { estimateTravelMinutes, haversineKm } from "@/domain/geo";
import { fromZoned, toZoned, addDays, daysBetween, weekdayOf } from "@/lib/time";

const TZ = "Africa/Nairobi";
const at = (date: string, time: string) => fromZoned(date, time, TZ);
const NOW = at("2026-11-01", "09:00");
const ctx = { now: NOW, tripStart: "2026-11-10", tripEnd: "2026-11-14", timezone: TZ, party: 2 };
const nakuru = { lat: -0.3087, lng: 36.0812 };
const naivasha = { lat: -0.7811, lng: 36.3962 };

const exp = (id: string, date: string, start: string, end: string, over: Partial<ScheduleItem> = {}): ScheduleItem => ({
  id,
  kind: "experience",
  title: id,
  dayDate: date,
  startsAt: at(date, start),
  endsAt: at(date, end),
  location: nakuru,
  minNoticeHours: 24,
  listingAvailable: true,
  slot: { id: `slot-${id}`, status: "open", capacity: 10, reserved: 0 },
  ...over,
});

describe("time helpers", () => {
  it("converts Nairobi wall-clock time to UTC and back", () => {
    const d = fromZoned("2026-11-10", "08:30", TZ);
    expect(d.toISOString()).toBe("2026-11-10T05:30:00.000Z");
    expect(toZoned(d, TZ)).toMatchObject({ date: "2026-11-10", time: "08:30", minutes: 510 });
  });
  it("handles calendar arithmetic", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
    expect(weekdayOf("2026-11-10")).toBe(2);
    expect(() => addDays("2026-02-30", 1)).toThrow();
  });
});

describe("availability windows", () => {
  const rules = [{ weekday: 2, startTime: "07:00", endTime: "18:00" }];
  it("applies weekly hours", () => {
    expect(windowsForDate("2026-11-10", rules, [])).toEqual([{ start: 420, end: 1080 }]);
    expect(windowsForDate("2026-11-11", rules, [])).toEqual([]);
  });
  it("applies full-day and partial exceptions", () => {
    expect(windowsForDate("2026-11-10", rules, [{ date: "2026-11-10", kind: "unavailable", startTime: null, endTime: null }])).toEqual([]);
    expect(windowsForDate("2026-11-10", rules, [{ date: "2026-11-10", kind: "unavailable", startTime: "12:00", endTime: "13:00" }])).toEqual([
      { start: 420, end: 720 },
      { start: 780, end: 1080 },
    ]);
    expect(windowsForDate("2026-11-11", rules, [{ date: "2026-11-11", kind: "available", startTime: "09:00", endTime: "12:00" }])).toEqual([{ start: 540, end: 720 }]);
  });
  it("subtracts busy intervals and checks coverage", () => {
    const free = subtractWindows([{ start: 420, end: 1080 }], [{ start: 600, end: 700 }]);
    expect(coversInterval(free, 420, 600)).toBe(true);
    expect(coversInterval(free, 500, 650)).toBe(false);
  });
});

describe("travel estimates", () => {
  it("are positive, rounded to five minutes and symmetric", () => {
    const m = estimateTravelMinutes(nakuru, naivasha);
    expect(m % 5).toBe(0);
    expect(m).toBeGreaterThan(0);
    expect(estimateTravelMinutes(naivasha, nakuru)).toBe(m);
    expect(haversineKm(nakuru, nakuru)).toBe(0);
  });
});

describe("schedule validation", () => {
  it("accepts a clean itinerary", () => {
    const issues = validateSchedule([exp("a", "2026-11-10", "07:00", "11:00"), exp("b", "2026-11-10", "14:00", "16:00")], ctx);
    expect(issues).toEqual([]);
  });

  it("detects overlapping activities", () => {
    const issues = validateSchedule([exp("a", "2026-11-10", "07:00", "11:00"), exp("b", "2026-11-10", "10:00", "12:00")], ctx);
    expect(issues.map((i) => i.code)).toContain("overlap");
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it("warns (not errors) when estimated travel time exceeds the gap", () => {
    const issues = validateSchedule(
      [exp("a", "2026-11-10", "07:00", "11:00"), exp("b", "2026-11-10", "11:15", "13:00", { location: naivasha })],
      ctx,
    );
    const travel = issues.find((i) => i.code === "travel_buffer");
    expect(travel?.severity).toBe("warning");
    expect(travel?.message).toMatch(/estimate/);
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it("flags unknown travel time when locations are missing", () => {
    const issues = validateSchedule([exp("a", "2026-11-10", "07:00", "11:00"), exp("b", "2026-11-10", "12:00", "13:00", { location: null })], ctx);
    expect(issues.find((i) => i.code === "travel_unknown")?.severity).toBe("info");
  });

  it("enforces trip dates, minimum notice and invalid times", () => {
    const codes = validateSchedule(
      [
        exp("outside", "2026-11-20", "08:00", "09:00"),
        exp("soon", "2026-11-10", "08:00", "09:00", { minNoticeHours: 24 * 30 }),
        exp("bad", "2026-11-11", "10:00", "09:00"),
      ],
      ctx,
    ).map((i) => `${i.itemId}:${i.code}`);
    expect(codes).toEqual(expect.arrayContaining(["outside:outside_trip", "soon:min_notice", "bad:invalid_time"]));
  });

  it("detects items placed on the wrong day", () => {
    const issues = validateSchedule([exp("a", "2026-11-11", "07:00", "08:00", { startsAt: at("2026-11-10", "07:00"), endsAt: at("2026-11-10", "08:00") })], ctx);
    expect(issues.map((i) => i.code)).toContain("wrong_day");
  });

  it("detects full, closed and over-capacity slots", () => {
    const codes = validateSchedule(
      [
        exp("full", "2026-11-10", "07:00", "08:00", { slot: { id: "s1", status: "open", capacity: 6, reserved: 5 } }),
        exp("closed", "2026-11-11", "07:00", "08:00", { slot: { id: "s2", status: "closed", capacity: 6, reserved: 0 } }),
        exp("group", "2026-11-12", "07:00", "08:00", { maxGroupSize: 1 }),
        exp("gone", "2026-11-13", "07:00", "08:00", { listingAvailable: false }),
      ],
      ctx,
    ).map((i) => `${i.itemId}:${i.code}`);
    expect(codes).toEqual(expect.arrayContaining(["full:slot_full", "closed:slot_unavailable", "group:over_capacity", "gone:listing_unavailable"]));
  });

  it("checks guide items against the guide's free windows", () => {
    const guide = (start: string, end: string, windows = [{ start: 420, end: 1080 }]): ScheduleItem => ({
      id: `g-${start}`,
      kind: "guide",
      title: "Guide",
      dayDate: "2026-11-10",
      startsAt: at("2026-11-10", start),
      endsAt: at("2026-11-10", end),
      location: null,
      minNoticeHours: 48,
      listingAvailable: true,
      guideWindows: windows,
      guideProviderId: "g1",
      guideTimezone: TZ,
    });
    expect(validateSchedule([guide("08:00", "16:00")], ctx)).toEqual([]);
    expect(validateSchedule([guide("06:00", "14:00")], ctx).map((i) => i.code)).toContain("guide_unavailable");
    expect(validateSchedule([guide("08:00", "16:00", [])], ctx).map((i) => i.code)).toContain("guide_unavailable");
    expect(validateSchedule([guide("08:00", "12:00"), guide("11:00", "15:00")], ctx).map((i) => i.code)).toContain("overlap");
  });

  it("ignores notes", () => {
    expect(validateSchedule([{ id: "n", kind: "note", title: "Lunch", dayDate: "2026-11-10", startsAt: null, endsAt: null, location: null, minNoticeHours: 0, listingAvailable: true }], ctx)).toEqual([]);
  });
});
