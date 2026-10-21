"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/components/ui";

export interface DayAvailability {
  /** Short text for screen readers, e.g. "2 start times, 6 places left" */
  summary: string;
  /** Few places left — shown with an amber marker */
  low: boolean;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthKey = (date: string) => date.slice(0, 7);
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00Z`));
const longLabel = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00Z`));

/**
 * Month calendar where only server-provided available dates are selectable. Dates are local
 * calendar days ("YYYY-MM-DD") so no time-zone conversion happens in the browser.
 */
export function AvailabilityCalendar({
  available,
  selected,
  onSelect,
}: {
  available: Map<string, DayAvailability>;
  selected: string | undefined;
  onSelect: (date: string) => void;
}) {
  const dates = [...available.keys()].sort();
  const first = dates[0] ? monthKey(dates[0]) : undefined;
  const last = dates.length ? monthKey(dates[dates.length - 1]) : undefined;
  const [month, setMonth] = useState(selected ? monthKey(selected) : first);
  if (!month || !first || !last) return null;

  const [y, m] = month.split("-").map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const openThisMonth = dates.filter((d) => monthKey(d) === month).length;

  return (
    <div className="rounded-2xl border border-sand-300 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          disabled={month <= first}
          aria-label="Previous month"
          className="flex h-8 w-8 items-center justify-center rounded-full text-forest hover:bg-forest-50 disabled:opacity-30"
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold text-forest" aria-live="polite">
          {monthLabel(month)} <span className="font-medium text-ink-subtle">· {openThisMonth} open day{openThisMonth === 1 ? "" : "s"}</span>
        </p>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= last}
          aria-label="Next month"
          className="flex h-8 w-8 items-center justify-center rounded-full text-forest hover:bg-forest-50 disabled:opacity-30"
        >
          <ChevronRight aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={`Available dates in ${monthLabel(month)}`}>
        {WEEKDAYS.map((w) => (
          <span key={w} role="columnheader" className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
            {w.slice(0, 2)}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`pad-${i}`} aria-hidden />;
          const info = available.get(date);
          const day = Number(date.slice(8));
          if (!info) {
            return (
              <span key={date} aria-hidden className="flex aspect-square items-center justify-center rounded-lg text-sm text-ink-subtle/40">
                {day}
              </span>
            );
          }
          const isSelected = date === selected;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-pressed={isSelected}
              aria-label={`${longLabel(date)}: ${info.summary}`}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm font-semibold transition-colors",
                isSelected ? "bg-forest text-sand" : "bg-forest-50 text-forest hover:bg-forest-100",
              )}
            >
              {day}
              <span aria-hidden className={cn("absolute bottom-1 h-1 w-1 rounded-full", info.low ? "bg-terracotta" : isSelected ? "bg-gold" : "bg-forest-600")} />
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-subtle">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-forest-600" />Available</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-terracotta" />Few places left</span>
        <span className="flex items-center gap-1.5"><span className="text-ink-subtle/40">12</span>Not available</span>
      </div>
    </div>
  );
}

export { longLabel as formatCalendarDate };
