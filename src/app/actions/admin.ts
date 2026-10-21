"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { getActor } from "@/server/auth/session";
import {
  addCommissionRule,
  adminRefundAction,
  cancelPayout,
  commissionRuleSchema,
  createPayout,
  deactivateCommissionRule,
  destinationSchema,
  markPayoutPaid,
  retryDelivery,
  saveCategory,
  saveDestination,
  setUserRole,
  setUserStatus,
  updateSetting,
} from "@/server/services/admin";
import { decideProvider, moderateListing, recordVerification, verificationSchema } from "@/server/services/providers";
import { moderateReview, updateSupportCase } from "@/server/services/community";
import { adminCompleteBooking, cancelBooking } from "@/server/services/bookings";
import { CATALOGUE_TAG } from "@/server/cached";
import { DEFAULT_SETTINGS, type PlatformSettings } from "@/server/services/settings";
import type { Role } from "@/domain/authz";
import { bool, list, moneyMinor, optStr, runAction, str } from "./run";
import type { ActionState } from "./types";

async function actor() {
  const a = await getActor();
  if (!a) redirect("/login?next=/admin");
  return a;
}

export async function verificationAction(providerId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await recordVerification(
      await getDb(),
      a,
      providerId,
      verificationSchema.parse({
        verificationType: str(fd, "verificationType"),
        status: str(fd, "status"),
        documentId: optStr(fd, "documentId"),
        referenceNumber: optStr(fd, "referenceNumber"),
        notes: str(fd, "notes"),
        expiresAt: optStr(fd, "expiresAt"),
      }),
    );
    refresh();
    return { ok: "Verification recorded." };
  });
}

export async function providerDecisionAction(providerId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await decideProvider(await getDb(), a, providerId, str(fd, "decision") as "approved", str(fd, "reason"));
    updateTag(CATALOGUE_TAG);
    refresh();
    return { ok: "Decision saved and the provider was notified." };
  });
}

export async function listingDecisionAction(experienceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await moderateListing(await getDb(), a, experienceId, str(fd, "decision") as "published", str(fd, "reason"));
    updateTag(CATALOGUE_TAG);
    refresh();
    return { ok: "Listing updated." };
  });
}

export async function userStatusAction(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await setUserStatus(await getDb(), a, userId, str(fd, "status") as "active", str(fd, "reason"));
    refresh();
    return { ok: "Account updated." };
  });
}

export async function userRoleAction(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await setUserRole(await getDb(), a, userId, str(fd, "role") as Role, str(fd, "grant") === "grant", str(fd, "reason"));
    refresh();
    return { ok: "Roles updated." };
  });
}

export async function adminCancelAction(bookingId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await cancelBooking(await getDb(), a, bookingId, str(fd, "reason"));
    refresh();
    return { ok: "Booking cancelled with a full refund." };
  });
}

export async function adminCompleteAction(bookingId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await adminCompleteBooking(await getDb(), a, bookingId, str(fd, "reason"));
    refresh();
    return { ok: "Marked completed." };
  });
}

export async function refundAdminAction(refundId: string, mode: "retry" | "mark_completed", _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    const r = await adminRefundAction(await getDb(), a, refundId, mode, optStr(fd, "externalReference"), str(fd, "reason"));
    refresh();
    return { ok: `Refund ${r.replace("_", " ")}.` };
  });
}

export async function createPayoutAction(providerId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await createPayout(await getDb(), a, providerId, moneyMinor(fd, "amount") ?? 0, str(fd, "method"), optStr(fd, "notes"));
    refresh();
    return { ok: "Payout created. Mark it paid once the transfer is sent." };
  });
}

export async function payoutPaidAction(payoutId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await markPayoutPaid(await getDb(), a, payoutId, str(fd, "reference"));
    refresh();
    return { ok: "Payout recorded." };
  });
}

export async function payoutCancelAction(payoutId: string): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await cancelPayout(await getDb(), a, payoutId, "Cancelled by admin");
    refresh();
  });
}

export async function settingAction(key: keyof PlatformSettings, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    const raw = str(fd, "value");
    const value = typeof DEFAULT_SETTINGS[key] === "number" ? Number(raw) : raw;
    await updateSetting(await getDb(), a, key, value, str(fd, "reason"));
    refresh();
    return { ok: "Setting updated." };
  });
}

export async function commissionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    const scope = str(fd, "scope");
    await addCommissionRule(
      await getDb(),
      a,
      commissionRuleSchema.parse({
        providerId: scope === "provider" ? optStr(fd, "providerId") : null,
        providerKind: scope === "kind" ? optStr(fd, "providerKind") : null,
        categoryId: scope === "category" ? optStr(fd, "categoryId") : null,
        commissionBps: Math.round(Number(str(fd, "percent")) * 100),
        note: str(fd, "note"),
      }),
    );
    refresh();
    return { ok: "Rule added. It applies to new bookings only." };
  });
}

export async function deactivateCommissionAction(ruleId: string): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await deactivateCommissionRule(await getDb(), a, ruleId);
    refresh();
  });
}

export async function destinationAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  let newId = id;
  const result = await runAction(async () => {
    const res = await saveDestination(
      await getDb(),
      a,
      id,
      destinationSchema.parse({
        slug: str(fd, "slug"),
        name: str(fd, "name"),
        region: str(fd, "region"),
        county: optStr(fd, "county"),
        summary: str(fd, "summary"),
        description: str(fd, "description"),
        latitude: Number(str(fd, "latitude")),
        longitude: Number(str(fd, "longitude")),
        travelStyles: list(fd, "travelStyles"),
        bestTimeToVisit: optStr(fd, "bestTimeToVisit"),
        travelInfo: optStr(fd, "travelInfo"),
        artVariant: str(fd, "artVariant"),
        isPublished: bool(fd, "isPublished"),
      }),
    );
    newId = res.id;
    updateTag(CATALOGUE_TAG);
    if (id) {
      refresh();
      return { ok: "Destination saved." };
    }
  });
  if (result?.error || id) return result;
  redirect(`/admin/destinations/${newId}`);
}

export async function categoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await saveCategory(await getDb(), a, { slug: str(fd, "slug"), name: str(fd, "name"), description: optStr(fd, "description") });
    updateTag(CATALOGUE_TAG);
    refresh();
    return { ok: "Category saved." };
  });
}

export async function reviewModerationAction(reviewId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await moderateReview(await getDb(), a, reviewId, str(fd, "status") as "hidden", str(fd, "reason"));
    refresh();
    return { ok: "Review updated." };
  });
}

export async function supportCaseAction(caseId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await updateSupportCase(await getDb(), a, caseId, {
      status: str(fd, "status") as "open",
      note: str(fd, "note"),
      assignToSelf: bool(fd, "assignToSelf"),
      reply: bool(fd, "reply"),
    });
    refresh();
    return { ok: "Case updated." };
  });
}

export async function retryDeliveryAction(deliveryId: string): Promise<ActionState> {
  const a = await actor();
  return runAction(async () => {
    await retryDelivery(await getDb(), a, deliveryId);
    refresh();
  });
}
