"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { getActor } from "@/server/auth/session";
import {
  addExperienceItem,
  addGuideItem,
  addNoteItem,
  archiveTrip,
  createTrip,
  duplicateTrip,
  moveItem,
  quoteTrip,
  removeItem,
  rescheduleItem,
  setShareEnabled,
  shiftNote,
  tripInputSchema,
  updateDayNotes,
  updateTrip,
  type TripInput,
} from "@/server/services/trips";
import { requestBooking } from "@/server/services/bookings";
import { track } from "@/server/services/analytics";
import { list, moneyMinor, optStr, runAction, str } from "./run";
import type { ActionState } from "./types";

function tripInputFrom(fd: FormData): TripInput {
  return tripInputSchema.parse({
    title: str(fd, "title"),
    primaryDestinationId: optStr(fd, "primaryDestinationId"),
    startDate: str(fd, "startDate"),
    endDate: str(fd, "endDate"),
    adults: str(fd, "adults") || 1,
    children: str(fd, "children") || 0,
    budgetMinor: moneyMinor(fd, "budget"),
    interests: list(fd, "interests"),
    pace: str(fd, "pace") || "balanced",
    tourType: str(fd, "tourType") || "private",
    languages: list(fd, "languages"),
    accessibilityNotes: optStr(fd, "accessibilityNotes"),
    dietaryNotes: optStr(fd, "dietaryNotes"),
    accommodationNotes: optStr(fd, "accommodationNotes"),
    transportNotes: optStr(fd, "transportNotes"),
  });
}

async function requireActorOr(next: string) {
  const actor = await getActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(next)}`);
  return actor;
}

export async function createTripAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  if (!actor) {
    // Preserve what the visitor entered so they can continue after signing in.
    const keep = new URLSearchParams();
    for (const k of ["title", "primaryDestinationId", "startDate", "endDate", "adults", "children", "budget", "pace", "tourType"]) if (str(fd, k)) keep.set(k, str(fd, k));
    for (const i of list(fd, "interests")) keep.append("interests", i);
    redirect(`/register?next=${encodeURIComponent(`/studio/new?${keep}`)}`);
  }
  let id = "";
  const result = await runAction(async () => {
    const input = tripInputFrom(fd);
    const db = await getDb();
    ({ id } = await db.transaction((tx) => createTrip(tx, actor, input)));
    await track(db, "trip_created", { days: 1, source: "studio" }, actor.userId);
  });
  if (result?.error) return result;
  redirect(`/studio/${id}`);
}

export async function updateTripAction(tripId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActorOr(`/studio/${tripId}`);
  return runAction(async () => {
    const db = await getDb();
    await db.transaction((tx) => updateTrip(tx, actor, tripId, tripInputFrom(fd)));
    refresh();
    return { ok: "Trip details saved." };
  });
}

export async function addSlotAction(tripId: string, slotId: string): Promise<ActionState> {
  const actor = await requireActorOr(`/studio/${tripId}`);
  return runAction(async () => {
    const db = await getDb();
    await db.transaction((tx) => addExperienceItem(tx, actor, tripId, { slotId }));
    await track(db, "itinerary_item_added", { kind: "experience" }, actor.userId);
    refresh();
  });
}

export async function addGuideServiceAction(tripId: string, serviceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActorOr(`/studio/${tripId}`);
  return runAction(async () => {
    const db = await getDb();
    await db.transaction((tx) => addGuideItem(tx, actor, tripId, { serviceId, dayId: str(fd, "dayId"), startTime: str(fd, "startTime") || "08:00" }));
    await track(db, "guide_selected", {}, actor.userId);
    refresh();
  });
}

export async function addNoteAction(tripId: string, dayId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActorOr(`/studio/${tripId}`);
  return runAction(async () => {
    const db = await getDb();
    await db.transaction((tx) => addNoteItem(tx, actor, tripId, { dayId, title: str(fd, "title"), notes: str(fd, "notes") }));
    refresh();
  });
}

export async function removeItemAction(tripId: string, itemId: string): Promise<ActionState> {
  const actor = await requireActorOr(`/studio/${tripId}`);
  return runAction(async () => {
    const db = await getDb();
    await db.transaction((tx) => removeItem(tx, actor, tripId, itemId));
    await track(db, "itinerary_item_removed", {}, actor.userId);
    refresh();
  });
}

export async function moveItemAction(tripId: string, itemId: string, dayId: string): Promise<ActionState> {
  const actor = await requireActorOr(`/studio/${tripId}`);
  return runAction(async () => {
    const db = await getDb();
    await db.transaction((tx) => moveItem(tx, actor, tripId, itemId, dayId));
    refresh();
  });
}

export async function rescheduleItemAction(tripId: string, itemId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActorOr(`/studio/${tripId}`);
  return runAction(async () => {
    const db = await getDb();
    await db.transaction((tx) => rescheduleItem(tx, actor, tripId, itemId, { slotId: optStr(fd, "slotId") ?? undefined, startTime: optStr(fd, "startTime") ?? undefined }));
    refresh();
  });
}

export async function shiftNoteAction(tripId: string, itemId: string, direction: "up" | "down"): Promise<ActionState> {
  const actor = await requireActorOr(`/studio/${tripId}`);
  return runAction(async () => {
    const db = await getDb();
    await db.transaction((tx) => shiftNote(tx, actor, tripId, itemId, direction));
    refresh();
  });
}

export async function updateDayAction(tripId: string, dayId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActorOr(`/studio/${tripId}`);
  return runAction(async () => {
    const db = await getDb();
    await db.transaction((tx) => updateDayNotes(tx, actor, tripId, dayId, { notes: optStr(fd, "notes"), destinationId: optStr(fd, "destinationId") }));
    refresh();
    return { ok: "Saved" };
  });
}

export async function quoteAction(tripId: string): Promise<ActionState> {
  const actor = await requireActorOr(`/studio/${tripId}`);
  return runAction(async () => {
    const db = await getDb();
    await db.transaction((tx) => quoteTrip(tx, actor, tripId));
    refresh();
    return { ok: "Quote ready. Review the breakdown, then request your booking." };
  });
}

export async function requestBookingAction(tripId: string, quoteVersionId: string, idempotencyKey: string): Promise<ActionState> {
  const actor = await requireActorOr(`/studio/${tripId}`);
  let bookingId = "";
  const result = await runAction(async () => {
    const db = await getDb();
    ({ bookingId } = await requestBooking(db, actor, { tripId, quoteVersionId, idempotencyKey }));
    await track(db, "booking_requested", {}, actor.userId);
  });
  if (result?.error) {
    refresh();
    return result;
  }
  redirect(`/dashboard/bookings/${bookingId}?requested=1`);
}

export async function duplicateTripAction(tripId: string): Promise<ActionState> {
  const actor = await requireActorOr(`/studio/${tripId}`);
  let id = "";
  const result = await runAction(async () => {
    const db = await getDb();
    ({ id } = await db.transaction((tx) => duplicateTrip(tx, actor, tripId)));
  });
  if (result?.error) return result;
  redirect(`/studio/${id}`);
}

export async function shareTripAction(tripId: string, enabled: boolean): Promise<ActionState> {
  const actor = await requireActorOr(`/studio/${tripId}`);
  return runAction(async () => {
    await setShareEnabled(await getDb(), actor, tripId, enabled);
    refresh();
  });
}

export async function archiveTripAction(tripId: string): Promise<ActionState> {
  const actor = await requireActorOr(`/studio/${tripId}`);
  const result = await runAction(async () => {
    await archiveTrip(await getDb(), actor, tripId);
  });
  if (result?.error) return result;
  redirect("/dashboard/trips");
}
