"use client";

import { useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { addSlotToTripAction } from "@/app/actions/catalogue";
import { cn } from "@/components/ui";
import { AvailabilityCalendar, formatCalendarDate, type DayAvailability } from "./availability-calendar";

interface Slot {
  id: string;
  startsAt: string;
  endsAt: string;
  remaining: number;
}

const LOW_PLACES = 3;
const fmtTime = (iso: string, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const dateKey = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));

/** Lets the traveller pick an available date/time and add it to a trip. Availability comes from the server. */
export function SlotPicker({
  slots,
  timezone,
  trips,
  signedIn,
  returnTo,
  perGroup,
  initialDate,
}: {
  slots: Slot[];
  timezone: string;
  trips: { id: string; title: string; startDate: string; endDate: string }[];
  signedIn: boolean;
  returnTo: string;
  perGroup: boolean;
  initialDate?: string;
}) {
  const byDate = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = dateKey(s.startsAt, timezone);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [slots, timezone]);
  const dates = [...byDate.keys()];
  const [date, setDate] = useState(initialDate && byDate.has(initialDate) ? initialDate : dates[0]);
  const [slotId, setSlotId] = useState<string>(byDate.get(date ?? "")?.[0]?.id ?? "");
  const availability = useMemo(() => {
    const m = new Map<string, DayAvailability>();
    for (const [d, daySlots] of byDate) {
      const places = daySlots.reduce((n, s) => n + s.remaining, 0);
      const low = !perGroup && daySlots.every((s) => s.remaining <= LOW_PLACES);
      m.set(d, {
        low,
        summary: `${daySlots.length} start time${daySlots.length === 1 ? "" : "s"}${perGroup ? "" : `, ${places} place${places === 1 ? "" : "s"} left`}`,
      });
    }
    return m;
  }, [byDate, perGroup]);

  if (!slots.length) {
    return <p className="rounded-xl bg-sand p-4 text-sm text-ink-muted">There are no open dates in the next 60 days. Check back later or message the provider.</p>;
  }

  const matchingTrips = trips.filter((t) => date && t.startDate <= date && t.endDate >= date);

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Choose a date</legend>
        <AvailabilityCalendar
          available={availability}
          selected={date}
          onSelect={(d) => {
            setDate(d);
            setSlotId(byDate.get(d)![0].id);
          }}
        />
      </fieldset>
      {date && <p className="text-sm font-semibold text-forest" aria-live="polite">{formatCalendarDate(date)}</p>}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Start time</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {(byDate.get(date ?? "") ?? []).map((s) => (
            <button
              type="button"
              role="radio"
              aria-checked={s.id === slotId}
              key={s.id}
              onClick={() => setSlotId(s.id)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                s.id === slotId ? "border-forest bg-forest-50 ring-2 ring-forest" : "border-sand-300 bg-white hover:border-forest/40",
              )}
            >
              <span className="block font-semibold">{fmtTime(s.startsAt, timezone)}–{fmtTime(s.endsAt, timezone)}</span>
              <span className="text-xs text-ink-subtle">{perGroup ? "Available for your group" : `${s.remaining} place${s.remaining === 1 ? "" : "s"} left`}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <ActionForm action={addSlotToTripAction} className="space-y-3">
        <input type="hidden" name="slotId" value={slotId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        {signedIn && (
          <div>
            <label htmlFor="tripId" className="mb-1.5 block text-sm font-semibold">Add to</label>
            <select id="tripId" name="tripId" className="h-11 w-full rounded-xl border border-sand-300 bg-white px-3 text-sm" defaultValue={matchingTrips[0]?.id ?? "new"} key={date}>
              {matchingTrips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.startDate} → {t.endDate})
                </option>
              ))}
              <option value="new">A new trip starting this day</option>
            </select>
            {trips.length > matchingTrips.length && <p className="mt-1 text-xs text-ink-subtle">Only trips that include this date are listed.</p>}
          </div>
        )}
        <SubmitButton className="w-full" pendingLabel="Adding…">
          <CalendarPlus aria-hidden className="h-4 w-4" />
          {signedIn ? "Add to itinerary" : "Sign in to add to a trip"}
        </SubmitButton>
        <p className="text-center text-xs text-ink-subtle">Adding to your itinerary doesn&apos;t book or charge anything.</p>
      </ActionForm>
    </div>
  );
}
