"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { getActor } from "@/server/auth/session";
import { toggleFavourite, openSupportCase, supportCaseSchema, startEnquiry } from "@/server/services/community";
import { addExperienceItem, addGuideItem, createTrip } from "@/server/services/trips";
import { track } from "@/server/services/analytics";
import { addDays, toZoned } from "@/lib/time";
import { UserError } from "@/server/errors";
import { optStr, runAction, str } from "./run";
import type { ActionState } from "./types";

export async function toggleFavouriteAction(targetType: "experience" | "guide" | "destination", targetId: string): Promise<ActionState> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return runAction(async () => {
    const { saved } = await toggleFavourite(await getDb(), actor, targetType, targetId);
    refresh();
    return { ok: saved ? "Saved" : "Removed", data: { saved } };
  });
}

/** Adds an experience time slot to an existing trip, or starts a new trip around it (atomically). */
export async function addSlotToTripAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(str(fd, "returnTo") || "/experiences")}`);
  let target = "";
  const result = await runAction(async () => {
    const db = await getDb();
    const slotId = str(fd, "slotId");
    if (!slotId) return { error: "Choose a date and time first." };
    const requested = str(fd, "tripId");
    const tripId = await db.transaction(async (tx) => {
      let id = requested;
      if (!id || id === "new") {
        const { rows } = await tx.query<{ starts_at: Date; timezone: string; title: string; destination_id: string }>(
          `select s.starts_at, d.timezone, e.title, e.destination_id from experience_slots s join experiences e on e.id = s.experience_id
             join destinations d on d.id = e.destination_id where s.id = $1`,
          [slotId],
        );
        if (!rows[0]) throw new UserError("That time is no longer available.");
        const date = toZoned(rows[0].starts_at, rows[0].timezone).date;
        ({ id } = await createTrip(tx, actor, {
          title: `Trip: ${rows[0].title}`.slice(0, 140),
          primaryDestinationId: rows[0].destination_id,
          startDate: date,
          endDate: addDays(date, 2),
          adults: Math.max(1, Number(str(fd, "party")) || 2),
          children: 0,
          budgetMinor: null,
          interests: [],
          pace: "balanced",
          tourType: "private",
          languages: [],
          accessibilityNotes: null,
          dietaryNotes: null,
          accommodationNotes: null,
          transportNotes: null,
        }));
      }
      await addExperienceItem(tx, actor, id, { slotId });
      return id;
    });
    if (!requested || requested === "new") await track(db, "trip_created", { source: "experience" }, actor.userId);
    await track(db, "itinerary_item_added", { kind: "experience" }, actor.userId);
    target = `/studio/${tripId}`;
  });
  if (result?.error) return result;
  redirect(target);
}

export async function addGuideToTripAction(serviceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(str(fd, "returnTo") || "/guides")}`);
  let target = "";
  const result = await runAction(async () => {
    const db = await getDb();
    const tripId = str(fd, "tripId");
    const dayId = str(fd, "dayId");
    const startTime = str(fd, "startTime") || "08:00";
    if (!tripId || !dayId) return { error: "Choose a trip and a day." };
    await db.transaction((tx) => addGuideItem(tx, actor, tripId, { serviceId, dayId, startTime }));
    await track(db, "guide_selected", {}, actor.userId);
    target = `/studio/${tripId}`;
  });
  if (result?.error) return result;
  redirect(target);
}

export async function contactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return runAction(async () => {
    const input = supportCaseSchema.parse({
      kind: str(fd, "kind") || "support",
      subject: str(fd, "subject"),
      description: str(fd, "description"),
      bookingId: optStr(fd, "bookingId"),
      reviewId: optStr(fd, "reviewId"),
      contactEmail: optStr(fd, "email"),
    });
    const { reference } = await openSupportCase(await getDb(), actor, input);
    return { ok: `Thanks — we've received your message. Your reference is ${reference}.` };
  });
}

export async function enquiryAction(providerId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(str(fd, "returnTo") || "/guides")}`);
  let target = "";
  const result = await runAction(async () => {
    const { conversationId } = await startEnquiry(await getDb(), actor, providerId, str(fd, "message"));
    target = `/dashboard/messages/${conversationId}`;
  });
  if (result?.error) return result;
  redirect(target);
}
