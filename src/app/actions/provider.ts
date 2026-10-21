"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { getActor } from "@/server/auth/session";
import {
  addAvailabilityException,
  archiveExperience,
  createSlots,
  exceptionSchema,
  experienceSchema,
  guideServiceSchema,
  providerProfileSchema,
  removeAvailabilityException,
  saveExperience,
  saveGuideService,
  saveProviderProfile,
  setGuideServiceStatus,
  setSlotStatus,
  setWeeklyHours,
  slotBatchSchema,
  submitExperienceForReview,
  submitForReview,
  updateSlotCapacity,
  uploadProviderDocument,
} from "@/server/services/providers";
import { CATALOGUE_TAG } from "@/server/cached";
import { int, lines, list, moneyMinor, optInt, optNum, optStr, runAction, str } from "./run";
import type { ActionState } from "./types";

async function actor() {
  const a = await getActor();
  if (!a) redirect("/login?next=/provider");
  return a;
}

export async function saveProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await saveProviderProfile(
      await getDb(),
      a,
      providerProfileSchema.parse({
        displayName: str(fd, "displayName"),
        headline: optStr(fd, "headline"),
        bio: optStr(fd, "bio"),
        photoUrl: optStr(fd, "photoUrl"),
        introVideoUrl: optStr(fd, "introVideoUrl"),
        languages: list(fd, "languages"),
        specialties: list(fd, "specialties"),
        yearsExperience: optInt(fd, "yearsExperience"),
        baseDestinationId: optStr(fd, "baseDestinationId"),
        regionIds: fd.getAll("regionIds").map(String),
      }),
    );
    refresh();
    return { ok: "Profile saved." };
  });
}

export async function uploadDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    const file = fd.get("file");
    if (!(file instanceof File)) return { error: "Choose a file to upload." };
    await uploadProviderDocument(await getDb(), a, { docType: str(fd, "docType"), file });
    refresh();
    return { ok: "Document uploaded securely." };
  });
}

export async function submitProfileAction(): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await submitForReview(await getDb(), a);
    refresh();
    return { ok: "Submitted for review. We'll notify you when it's been checked." };
  });
}

export async function saveServiceAction(serviceId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await saveGuideService(
      await getDb(),
      a,
      serviceId,
      guideServiceSchema.parse({
        title: str(fd, "title"),
        description: str(fd, "description"),
        durationMinutes: Math.round(Number(str(fd, "durationHours")) * 60),
        pricingModel: str(fd, "pricingModel"),
        basePriceMinor: moneyMinor(fd, "price") ?? 0,
        maxGroupSize: int(fd, "maxGroupSize", 1),
        bufferMinutes: int(fd, "bufferMinutes", 60),
        minNoticeHours: int(fd, "minNoticeHours", 24),
        cancellationPolicy: str(fd, "cancellationPolicy"),
      }),
    );
    refresh();
    return { ok: "Service saved." };
  });
}

export async function serviceStatusAction(serviceId: string, status: "published" | "draft" | "archived"): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await setGuideServiceStatus(await getDb(), a, serviceId, status);
    updateTag(CATALOGUE_TAG);
    refresh();
  });
}

function experienceInput(fd: FormData) {
  return experienceSchema.parse({
    title: str(fd, "title"),
    summary: str(fd, "summary"),
    description: str(fd, "description"),
    destinationId: str(fd, "destinationId"),
    categoryId: str(fd, "categoryId"),
    durationMinutes: Math.round(Number(str(fd, "durationHours")) * 60),
    pricingModel: str(fd, "pricingModel"),
    basePriceMinor: moneyMinor(fd, "price") ?? 0,
    childPriceMinor: moneyMinor(fd, "childPrice"),
    maxGroupSize: int(fd, "maxGroupSize", 1),
    minAge: optInt(fd, "minAge"),
    inclusions: lines(fd, "inclusions"),
    exclusions: lines(fd, "exclusions"),
    meetingPoint: str(fd, "meetingPoint"),
    meetingLat: optNum(fd, "meetingLat"),
    meetingLng: optNum(fd, "meetingLng"),
    preparationNotes: optStr(fd, "preparationNotes"),
    accessibilityNotes: optStr(fd, "accessibilityNotes"),
    restrictions: optStr(fd, "restrictions"),
    cancellationPolicy: str(fd, "cancellationPolicy"),
    minNoticeHours: int(fd, "minNoticeHours", 24),
    travelStyles: list(fd, "travelStyles"),
  });
}

export async function saveExperienceAction(experienceId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  let id = experienceId;
  const result = await runAction(async () => {
    const res = await saveExperience(await getDb(), a, experienceId, experienceInput(fd));
    id = res.id;
    if (experienceId) {
      updateTag(CATALOGUE_TAG);
      refresh();
      return { ok: res.status === "pending_review" ? "Saved. Because the listing was live, it's back in review; existing bookings keep their original terms." : "Saved." };
    }
  });
  if (result?.error || experienceId) return result;
  redirect(`/provider/listings/${id}`);
}

export async function submitExperienceAction(experienceId: string): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await submitExperienceForReview(await getDb(), a, experienceId);
    refresh();
    return { ok: "Submitted for review." };
  });
}

export async function archiveExperienceAction(experienceId: string): Promise<ActionState> {
  const a = await actor();
  const result = await runAction(async () => {
    await archiveExperience(await getDb(), a, experienceId);
    updateTag(CATALOGUE_TAG);
  });
  if (result?.error) return result;
  redirect("/provider/listings");
}

export async function createSlotsAction(experienceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    const { created } = await createSlots(
      await getDb(),
      a,
      experienceId,
      slotBatchSchema.parse({
        fromDate: str(fd, "fromDate"),
        toDate: str(fd, "toDate"),
        weekdays: fd.getAll("weekdays").map(Number),
        startTime: str(fd, "startTime"),
        capacity: int(fd, "capacity", 1),
      }),
    );
    refresh();
    return { ok: `${created} new time slot${created === 1 ? "" : "s"} added.` };
  });
}

export async function slotStatusAction(slotId: string, status: "open" | "closed"): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await setSlotStatus(await getDb(), a, slotId, status);
    refresh();
  });
}

export async function slotCapacityAction(slotId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await updateSlotCapacity(await getDb(), a, slotId, int(fd, "capacity", 0));
    refresh();
  });
}

export async function weeklyHoursAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    const rules = [];
    for (let d = 0; d < 7; d++) {
      if (fd.get(`on-${d}`) !== "on") continue;
      rules.push({ weekday: d, startTime: str(fd, `start-${d}`), endTime: str(fd, `end-${d}`) });
    }
    await setWeeklyHours(await getDb(), a, rules);
    refresh();
    return { ok: "Working hours saved. Existing bookings are unaffected." };
  });
}

export async function addExceptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await addAvailabilityException(
      await getDb(),
      a,
      exceptionSchema.parse({
        date: str(fd, "date"),
        kind: str(fd, "kind"),
        startTime: optStr(fd, "startTime"),
        endTime: optStr(fd, "endTime"),
        reason: optStr(fd, "reason"),
      }),
    );
    refresh();
    return { ok: "Saved." };
  });
}

export async function removeExceptionAction(id: string): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await removeAvailabilityException(await getDb(), a, id);
    refresh();
  });
}
