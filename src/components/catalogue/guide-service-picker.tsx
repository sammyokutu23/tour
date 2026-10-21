"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { addGuideToTripAction } from "@/app/actions/catalogue";
import { buttonClass } from "@/components/ui";

interface Trip {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  days: { id: string; date: string; dayNumber: number }[];
}

const fmt = (d: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00Z`));

export function GuideServicePicker({ serviceId, trips, signedIn, returnTo }: { serviceId: string; trips: Trip[]; signedIn: boolean; returnTo: string }) {
  const [tripId, setTripId] = useState(trips[0]?.id ?? "");
  const trip = trips.find((t) => t.id === tripId);

  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className={buttonClass("secondary", "sm")}>
        Sign in to add to a trip
      </Link>
    );
  }
  if (!trips.length) {
    return (
      <Link href="/studio/new" className={buttonClass("secondary", "sm")}>
        Create a trip first
      </Link>
    );
  }

  return (
    <ActionForm action={addGuideToTripAction.bind(null, serviceId)} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_0.8fr_auto] sm:items-end">
      <input type="hidden" name="returnTo" value={returnTo} />
      <div>
        <label className="mb-1 block text-xs font-semibold" htmlFor={`trip-${serviceId}`}>Trip</label>
        <select id={`trip-${serviceId}`} name="tripId" value={tripId} onChange={(e) => setTripId(e.target.value)} className="h-10 w-full rounded-xl border border-sand-300 bg-white px-2 text-sm">
          {trips.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold" htmlFor={`day-${serviceId}`}>Day</label>
        <select id={`day-${serviceId}`} name="dayId" key={tripId} className="h-10 w-full rounded-xl border border-sand-300 bg-white px-2 text-sm">
          {trip?.days.map((d) => (
            <option key={d.id} value={d.id}>Day {d.dayNumber} · {fmt(d.date)}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold" htmlFor={`time-${serviceId}`}>Start</label>
        <input id={`time-${serviceId}`} name="startTime" type="time" defaultValue="08:00" step={900} className="h-10 w-full rounded-xl border border-sand-300 bg-white px-2 text-sm" />
      </div>
      <SubmitButton size="sm" className="h-10" pendingLabel="Adding…">Add to trip</SubmitButton>
    </ActionForm>
  );
}
