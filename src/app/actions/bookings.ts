"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { getActor } from "@/server/auth/session";
import {
  cancelBooking,
  createChangeRequest,
  handlePaymentWebhook,
  respondToBooking,
  respondToChangeRequest,
  startCheckout,
} from "@/server/services/bookings";
import { reviewSchema, sendMessage, submitReview, respondToReview, markNotificationsRead } from "@/server/services/community";
import { completeSandboxPayment, SANDBOX_SIGNATURE_HEADER } from "@/server/payments/sandbox";
import { track } from "@/server/services/analytics";
import { appUrl } from "@/config/brand";
import { int, optStr, runAction, str } from "./run";
import type { ActionState } from "./types";

async function actorOrLogin(next: string) {
  const actor = await getActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(next)}`);
  return actor;
}

export async function checkoutAction(bookingId: string, idempotencyKey: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await actorOrLogin(`/dashboard/bookings/${bookingId}`);
  let redirectUrl: string | null = null;
  const result = await runAction(async () => {
    const db = await getDb();
    const res = await startCheckout(db, actor, { bookingId, provider: str(fd, "provider"), phone: optStr(fd, "phone") ?? undefined, idempotencyKey, appUrl: appUrl() });
    await track(db, "checkout_started", { provider: str(fd, "provider") }, actor.userId);
    redirectUrl = res.redirectUrl;
    if (!redirectUrl) {
      refresh();
      return { ok: res.instruction };
    }
  });
  if (result?.error || !redirectUrl) return result;
  redirect(redirectUrl);
}

/**
 * SANDBOX ONLY. Simulates the payer approving/declining on the hosted page, then delivers a signed
 * webhook through the same handler production callbacks use.
 */
export async function sandboxDecisionAction(reference: string, returnTo: string, outcome: "succeeded" | "failed"): Promise<ActionState> {
  const actor = await actorOrLogin(returnTo);
  const result = await runAction(async () => {
    const db = await getDb();
    const owner = await db.query(
      "select 1 from payment_attempts pa join bookings b on b.id = pa.booking_id where pa.provider = 'sandbox' and pa.provider_reference = $1 and b.traveller_id = $2",
      [reference, actor.userId],
    );
    if (!owner.rowCount) return { error: "Payment not found." };
    const { body, signature } = await completeSandboxPayment(db, reference, outcome);
    const res = await handlePaymentWebhook(db, "sandbox", body, new Headers({ [SANDBOX_SIGNATURE_HEADER]: signature }), new URL(`${appUrl()}/api/payments/sandbox/callback`));
    if (res === "confirmed") await track(db, "payment_succeeded", { provider: "sandbox" }, null);
  });
  if (result?.error) return result;
  redirect(returnTo.startsWith("/") ? `${returnTo}?payment=${outcome}` : "/dashboard");
}

export async function respondAction(bookingId: string, decision: "accept" | "decline", _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await actorOrLogin(`/provider/bookings/${bookingId}`);
  return runAction(async () => {
    const db = await getDb();
    await respondToBooking(db, actor, bookingId, decision, optStr(fd, "note"));
    if (decision === "accept") await track(db, "provider_accepted", {}, actor.userId);
    refresh();
    return { ok: decision === "accept" ? "Accepted. The traveller has been notified." : "Declined. The traveller has been notified." };
  });
}

export async function cancelBookingAction(bookingId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await actorOrLogin(`/dashboard/bookings/${bookingId}`);
  return runAction(async () => {
    const db = await getDb();
    const { refundMinor } = await cancelBooking(db, actor, bookingId, str(fd, "reason"));
    await track(db, "booking_cancelled", { refunded: refundMinor > 0 }, actor.userId);
    refresh();
    return { ok: "Cancellation recorded." };
  });
}

export async function changeRequestAction(bookingId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await actorOrLogin(`/dashboard/bookings/${bookingId}`);
  return runAction(async () => {
    await createChangeRequest(await getDb(), actor, bookingId, str(fd, "message"));
    refresh();
    return { ok: "Your request was sent to your providers." };
  });
}

export async function respondChangeAction(requestId: string, decision: "accepted" | "declined", _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await actorOrLogin("/provider/bookings");
  return runAction(async () => {
    await respondToChangeRequest(await getDb(), actor, requestId, decision, str(fd, "response"));
    refresh();
    return { ok: "Response sent." };
  });
}

export async function sendMessageAction(conversationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await actorOrLogin("/dashboard/messages");
  return runAction(async () => {
    await sendMessage(await getDb(), actor, conversationId, str(fd, "body"));
    refresh();
    return { ok: true };
  });
}

export async function reviewAction(bookingItemId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await actorOrLogin("/dashboard/bookings");
  return runAction(async () => {
    await submitReview(await getDb(), actor, reviewSchema.parse({ bookingItemId, rating: int(fd, "rating"), title: optStr(fd, "title"), body: str(fd, "body") }));
    refresh();
    return { ok: "Thank you — your review is published." };
  });
}

export async function respondReviewAction(reviewId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await actorOrLogin("/provider/reviews");
  return runAction(async () => {
    await respondToReview(await getDb(), actor, reviewId, str(fd, "response"));
    refresh();
    return { ok: "Response published." };
  });
}

export async function markAllReadAction(): Promise<ActionState> {
  const actor = await actorOrLogin("/dashboard/notifications");
  return runAction(async () => {
    await markNotificationsRead(await getDb(), actor);
    refresh();
  });
}
