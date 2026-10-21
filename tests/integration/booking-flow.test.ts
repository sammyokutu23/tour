import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { actorFor, createTestDb, key, newTraveller, tripWithGuideAndExperience, makeTrip, firstSlotOn } from "./helpers";
import { quoteTrip, getStudioView, addExperienceItem, removeItem, loadOwnedTrip } from "@/server/services/trips";
import {
  requestBooking,
  respondToBooking,
  startCheckout,
  handlePaymentWebhook,
  cancelBooking,
  getBookingView,
  expireDueBookings,
  createChangeRequest,
  respondToChangeRequest,
  progressBookings,
  applyVerifiedPayment,
} from "@/server/services/bookings";
import { completeSandboxPayment, SANDBOX_SIGNATURE_HEADER } from "@/server/payments/sandbox";
import { submitReview } from "@/server/services/community";
import { ForbiddenError, NotFoundError, type Actor } from "@/domain/authz";
import { UserError } from "@/server/errors";

let db: Db;
let guide: Actor;
let operator: Actor;
let admin: Actor;
const APP = "http://localhost:3000";

beforeAll(async () => {
  db = await createTestDb();
  guide = await actorFor(db, "guide.achieng@demo.test");
  operator = await actorFor(db, "operator.highlands@demo.test");
  admin = await actorFor(db, "admin@demo.test");
});
afterAll(async () => db?.close());

async function ledgerBalances(bookingId?: string) {
  const { rows } = await db.query<{ account: string; total: number }>(
    `select account, sum(amount_minor)::bigint as total from ledger_entries ${bookingId ? "where booking_id = $1" : ""} group by account`,
    bookingId ? [bookingId] : [],
  );
  return Object.fromEntries(rows.map((r) => [r.account, r.total]));
}

async function pay(bookingId: string, traveller: Actor, outcome: "succeeded" | "failed" = "succeeded") {
  const checkout = await startCheckout(db, traveller, { bookingId, provider: "sandbox", idempotencyKey: key(), appUrl: APP });
  const reference = decodeURIComponent(checkout.redirectUrl!.split("/checkout/sandbox/")[1].split("?")[0]);
  const { body, signature } = await completeSandboxPayment(db, reference, outcome);
  const result = await handlePaymentWebhook(db, "sandbox", body, new Headers({ [SANDBOX_SIGNATURE_HEADER]: signature }), new URL(`${APP}/api/payments/sandbox/callback`));
  return { result, body, signature, reference };
}

async function bookToConfirmed(traveller: Actor) {
  const { trip } = await tripWithGuideAndExperience(db, traveller);
  const q = await quoteTrip(db, traveller, trip.id);
  const booking = await requestBooking(db, traveller, { tripId: trip.id, quoteVersionId: q.versionId, idempotencyKey: key() });
  await respondToBooking(db, guide, booking.bookingId, "accept", null);
  await respondToBooking(db, operator, booking.bookingId, "accept", null);
  const paid = await pay(booking.bookingId, traveller);
  return { trip, quote: q, booking, paid };
}

describe("end-to-end booking lifecycle", () => {
  it("quotes, requests, accepts, pays and confirms with a balanced ledger", async () => {
    const traveller = await newTraveller(db);
    const { trip } = await tripWithGuideAndExperience(db, traveller);

    const studio = await getStudioView(db, traveller, trip.id);
    expect(studio.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(studio.items.filter((i) => i.kind !== "note")).toHaveLength(2);

    const q = await quoteTrip(db, traveller, trip.id);
    expect(q.quote.totalMinor).toBeGreaterThan(0);
    expect(q.quote.totalMinor).toBe(q.quote.subtotalMinor - q.quote.discountMinor + q.quote.serviceFeeMinor + q.quote.taxMinor);

    const booking = await requestBooking(db, traveller, { tripId: trip.id, quoteVersionId: q.versionId, idempotencyKey: key() });
    let view = await getBookingView(db, traveller, booking.bookingId);
    expect(view.status).toBe("pending_provider");
    expect(view.paymentStatus).toBe("unpaid");
    expect(view.totalMinor).toBe(q.quote.totalMinor);

    // Payment is impossible before providers accept.
    await expect(startCheckout(db, traveller, { bookingId: booking.bookingId, provider: "sandbox", idempotencyKey: key(), appUrl: APP })).rejects.toThrow(UserError);

    await respondToBooking(db, guide, booking.bookingId, "accept", "Looking forward to it");
    expect((await getBookingView(db, traveller, booking.bookingId)).status).toBe("pending_provider");
    await respondToBooking(db, operator, booking.bookingId, "accept", null);
    expect((await getBookingView(db, traveller, booking.bookingId)).status).toBe("awaiting_payment");

    const { result } = await pay(booking.bookingId, traveller);
    expect(result).toBe("confirmed");
    view = await getBookingView(db, traveller, booking.bookingId);
    expect(view.status).toBe("confirmed");
    expect(view.paymentStatus).toBe("paid");
    expect((await loadOwnedTrip(db, traveller, trip.id)).status).toBe("confirmed");

    const balances = await ledgerBalances(booking.bookingId);
    expect(Object.values(balances).reduce((s, v) => s + v, 0)).toBe(0);
    expect(balances.cash).toBe(q.quote.totalMinor);

    const holds = await db.query<{ status: string }>("select status from inventory_holds where booking_id = $1", [booking.bookingId]);
    expect(holds.rows.every((h) => h.status === "confirmed")).toBe(true);

    const versions = await db.query<{ kind: string }>("select kind from itinerary_versions where trip_id = $1 order by version", [trip.id]);
    expect(versions.rows.map((v) => v.kind)).toEqual(["quote", "booking", "confirmed"]);
  });

  it("is idempotent for repeated booking requests and duplicate payment callbacks", async () => {
    const traveller = await newTraveller(db);
    const { trip } = await tripWithGuideAndExperience(db, traveller);
    const q = await quoteTrip(db, traveller, trip.id);
    const k = key();
    const first = await requestBooking(db, traveller, { tripId: trip.id, quoteVersionId: q.versionId, idempotencyKey: k });
    const replay = await requestBooking(db, traveller, { tripId: trip.id, quoteVersionId: q.versionId, idempotencyKey: k });
    expect(replay.bookingId).toBe(first.bookingId);
    expect(replay.replayed).toBe(true);

    await respondToBooking(db, guide, first.bookingId, "accept", null);
    await respondToBooking(db, operator, first.bookingId, "accept", null);
    const { body, signature } = await pay(first.bookingId, traveller);
    const again = await handlePaymentWebhook(db, "sandbox", body, new Headers({ [SANDBOX_SIGNATURE_HEADER]: signature }), new URL(`${APP}/cb`));
    expect(again).toBe("duplicate");
    const entries = await db.query<{ n: number }>("select count(distinct txn_id)::int as n from ledger_entries where booking_id = $1", [first.bookingId]);
    expect(entries.rows[0].n).toBe(1);
  });

  it("rejects forged callbacks and never trusts the callback alone", async () => {
    const traveller = await newTraveller(db);
    const { trip } = await tripWithGuideAndExperience(db, traveller);
    const q = await quoteTrip(db, traveller, trip.id);
    const b = await requestBooking(db, traveller, { tripId: trip.id, quoteVersionId: q.versionId, idempotencyKey: key() });
    await respondToBooking(db, guide, b.bookingId, "accept", null);
    await respondToBooking(db, operator, b.bookingId, "accept", null);
    const checkout = await startCheckout(db, traveller, { bookingId: b.bookingId, provider: "sandbox", idempotencyKey: key(), appUrl: APP });
    const reference = decodeURIComponent(checkout.redirectUrl!.split("/checkout/sandbox/")[1].split("?")[0]);

    const forged = JSON.stringify({ eventId: "evt_forged", type: "payment.succeeded", reference });
    expect(await handlePaymentWebhook(db, "sandbox", forged, new Headers({ [SANDBOX_SIGNATURE_HEADER]: "deadbeef" }), new URL(`${APP}/cb`))).toBe("invalid_signature");

    // A correctly signed "succeeded" event while the provider still reports pending must not confirm.
    const { signSandboxPayload } = await import("@/server/payments/sandbox");
    const premature = JSON.stringify({ eventId: "evt_premature", type: "payment.succeeded", reference });
    expect(await handlePaymentWebhook(db, "sandbox", premature, new Headers({ [SANDBOX_SIGNATURE_HEADER]: signSandboxPayload(premature) }), new URL(`${APP}/cb`))).toBe("pending");
    expect((await getBookingView(db, traveller, b.bookingId)).status).toBe("payment_pending");
  });

  it("handles failed then successful payment, and ignores stale failures after success", async () => {
    const traveller = await newTraveller(db);
    const { trip } = await tripWithGuideAndExperience(db, traveller);
    const q = await quoteTrip(db, traveller, trip.id);
    const b = await requestBooking(db, traveller, { tripId: trip.id, quoteVersionId: q.versionId, idempotencyKey: key() });
    await respondToBooking(db, guide, b.bookingId, "accept", null);
    await respondToBooking(db, operator, b.bookingId, "accept", null);

    const failed = await pay(b.bookingId, traveller, "failed");
    expect(failed.result).toBe("failed_recorded");
    let view = await getBookingView(db, traveller, b.bookingId);
    expect(view.status).toBe("awaiting_payment");
    expect(view.paymentStatus).toBe("failed");

    const ok = await pay(b.bookingId, traveller, "succeeded");
    expect(ok.result).toBe("confirmed");
    const attempt = (await db.query<{ id: string }>("select id from payment_attempts where booking_id = $1 and status = 'succeeded'", [b.bookingId])).rows[0];
    expect(await applyVerifiedPayment(db, attempt.id, { status: "failed", amountMinor: null, currency: null, receipt: null, failureReason: "late" })).toBe("ignored_stale");
    view = await getBookingView(db, traveller, b.bookingId);
    expect(view.status).toBe("confirmed");
  });

  it("returns the itinerary to draft and releases inventory when a provider declines", async () => {
    const traveller = await newTraveller(db);
    const { trip, slot } = await tripWithGuideAndExperience(db, traveller);
    const q = await quoteTrip(db, traveller, trip.id);
    const b = await requestBooking(db, traveller, { tripId: trip.id, quoteVersionId: q.versionId, idempotencyKey: key() });
    const reserved = async () => (await db.query<{ reserved: number }>("select reserved from experience_slots where id = $1", [slot.id])).rows[0].reserved;
    expect(await reserved()).toBe(1);
    await respondToBooking(db, guide, b.bookingId, "decline", "On leave that week");
    expect((await getBookingView(db, traveller, b.bookingId)).status).toBe("provider_declined");
    expect(await reserved()).toBe(0);
    expect((await loadOwnedTrip(db, traveller, trip.id)).status).toBe("draft");
  });

  it("expires unanswered requests and frees the guide", async () => {
    const traveller = await newTraveller(db);
    const { trip } = await tripWithGuideAndExperience(db, traveller);
    const q = await quoteTrip(db, traveller, trip.id);
    const b = await requestBooking(db, traveller, { tripId: trip.id, quoteVersionId: q.versionId, idempotencyKey: key() });
    const later = new Date(Date.now() + 49 * 3_600_000);
    await db.transaction((tx) => expireDueBookings(tx, later));
    expect((await getBookingView(db, traveller, b.bookingId)).status).toBe("expired");
    const holds = await db.query<{ status: string }>("select status from inventory_holds where booking_id = $1", [b.bookingId]);
    expect(holds.rows.every((h) => h.status === "expired")).toBe(true);
  });

  it("refuses stale quotes and quotes after itinerary edits", async () => {
    const traveller = await newTraveller(db);
    const { trip, guideDay } = await tripWithGuideAndExperience(db, traveller);
    const q = await quoteTrip(db, traveller, trip.id);
    // Editing after quoting invalidates the quote.
    const extra = await firstSlotOn(db, "kakamega-rainforest-walk-demo", guideDay.date);
    const added = await addExperienceItem(db, traveller, trip.id, { slotId: extra.id });
    await expect(requestBooking(db, traveller, { tripId: trip.id, quoteVersionId: q.versionId, idempotencyKey: key() })).rejects.toThrow(/fresh quote|changed/);
    await removeItem(db, traveller, trip.id, added.id);
    const q2 = await quoteTrip(db, traveller, trip.id);
    await expect(
      requestBooking(db, traveller, { tripId: trip.id, quoteVersionId: q2.versionId, idempotencyKey: key() }, new Date(Date.now() + 2 * 3_600_000)),
    ).rejects.toThrow(/expired/);
  });

  it("cancels with a policy-based refund and reverses the ledger proportionally", async () => {
    const traveller = await newTraveller(db);
    const { booking, quote } = await bookToConfirmed(traveller);
    const result = await cancelBooking(db, traveller, booking.bookingId, "Change of plans");
    // Trip is ~7 days away: flexible (boat) and moderate (guide) policies both refund in full.
    expect(result.refundMinor).toBe(quote.quote.totalMinor);
    const view = await getBookingView(db, traveller, booking.bookingId);
    expect(view.status).toBe("cancelled");
    expect(view.paymentStatus).toBe("refunded");
    expect(view.refunds[0].status).toBe("succeeded");
    const balances = await ledgerBalances(booking.bookingId);
    for (const v of Object.values(balances)) expect(v).toBe(0);
  });

  it("lets a provider cancel only their own items with a full refund for those items", async () => {
    const traveller = await newTraveller(db);
    const { booking } = await bookToConfirmed(traveller);
    const before = await getBookingView(db, traveller, booking.bookingId);
    const guideItem = before.items.find((i) => i.kind === "guide")!;
    const res = await cancelBooking(db, guide, booking.bookingId, "Vehicle breakdown");
    expect(res.refundMinor).toBeGreaterThanOrEqual(guideItem.lineTotalMinor!);
    const after = await getBookingView(db, traveller, booking.bookingId);
    expect(after.status).toBe("confirmed");
    expect(after.items.find((i) => i.kind === "guide")!.status).toBe("cancelled");
    expect(after.items.find((i) => i.kind === "experience")!.status).toBe("active");
    expect(after.paymentStatus).toBe("partially_refunded");
  });

  it("supports change requests answered by the provider", async () => {
    const traveller = await newTraveller(db);
    const { booking } = await bookToConfirmed(traveller);
    const cr = await createChangeRequest(db, traveller, booking.bookingId, "Could we start 30 minutes later on day one?");
    await expect(createChangeRequest(db, traveller, booking.bookingId, "Another one please")).rejects.toThrow(/open change request/);
    const stranger = await newTraveller(db);
    await expect(respondToChangeRequest(db, stranger, cr.id, "accepted", "ok")).rejects.toThrow(NotFoundError);
    await respondToChangeRequest(db, guide, cr.id, "accepted", "Yes, 08:30 works.");
    const view = await getBookingView(db, traveller, booking.bookingId);
    expect(view.changeRequests[0]).toMatchObject({ status: "accepted", response: "Yes, 08:30 works." });
  });

  it("completes trips and only then allows one review per item", async () => {
    const traveller = await newTraveller(db);
    const { booking } = await bookToConfirmed(traveller);
    const view = await getBookingView(db, traveller, booking.bookingId);
    const item = view.items[0];
    await expect(submitReview(db, traveller, { bookingItemId: item.id, rating: 5, title: null, body: "Wonderful day out on the lake." })).rejects.toThrow(/completed/);
    await progressBookings(db, new Date(Date.now() + 30 * 86_400_000));
    expect((await getBookingView(db, traveller, booking.bookingId)).status).toBe("completed");
    await submitReview(db, traveller, { bookingItemId: item.id, rating: 5, title: null, body: "Wonderful day out on the lake." });
    await expect(submitReview(db, traveller, { bookingItemId: item.id, rating: 4, title: null, body: "Trying to review twice." })).rejects.toThrow(/already/);
    const stranger = await newTraveller(db);
    await expect(submitReview(db, stranger, { bookingItemId: view.items[1].id, rating: 1, title: null, body: "I was never on this trip." })).rejects.toThrow(NotFoundError);
  });
});

describe("authorization", () => {
  it("hides one traveller's trips and bookings from another", async () => {
    const owner = await newTraveller(db);
    const intruder = await newTraveller(db);
    const { booking, trip } = await bookToConfirmed(owner);
    await expect(getBookingView(db, intruder, booking.bookingId)).rejects.toThrow(NotFoundError);
    await expect(getStudioView(db, intruder, trip.id)).rejects.toThrow(NotFoundError);
    await expect(cancelBooking(db, intruder, booking.bookingId, "Not mine")).rejects.toThrow(NotFoundError);
    await expect(startCheckout(db, intruder, { bookingId: booking.bookingId, provider: "sandbox", idempotencyKey: key(), appUrl: APP })).rejects.toThrow(NotFoundError);
  });

  it("limits providers to their own items and hides traveller contact details", async () => {
    const traveller = await newTraveller(db, "Wanjiku Kamau");
    const { booking } = await bookToConfirmed(traveller);
    const asGuide = await getBookingView(db, guide, booking.bookingId);
    expect(asGuide.access).toBe("provider");
    expect(asGuide.items.every((i) => i.kind === "guide")).toBe(true);
    expect(asGuide.traveller.email).toBeNull();
    expect(asGuide.traveller.name).toBe("Wanjiku");
    expect(asGuide.payments).toEqual([]);

    const unrelated = await actorFor(db, "guide.baraka@demo.test");
    await expect(getBookingView(db, unrelated, booking.bookingId)).rejects.toThrow(NotFoundError);
    await expect(respondToBooking(db, unrelated, booking.bookingId, "accept", null)).rejects.toThrow(NotFoundError);
  });

  it("gives support staff a minimal projection and admins full access", async () => {
    const traveller = await newTraveller(db);
    const { booking } = await bookToConfirmed(traveller);
    const support = await actorFor(db, "support@demo.test");
    const asSupport = await getBookingView(db, support, booking.bookingId);
    expect(asSupport.access).toBe("support");
    expect(asSupport.totalMinor).toBe(0);
    expect(asSupport.traveller.email).toBeNull();
    expect(asSupport.payments).toEqual([]);
    await expect(cancelBooking(db, support, booking.bookingId, "support cannot")).rejects.toThrow(NotFoundError);
    const asAdmin = await getBookingView(db, admin, booking.bookingId);
    expect(asAdmin.payments.length).toBeGreaterThan(0);
  });

  it("rejects provider actions from travellers", async () => {
    const traveller = await newTraveller(db);
    const { booking } = await bookToConfirmed(traveller);
    await expect(respondToBooking(db, traveller, booking.bookingId, "accept", null)).rejects.toThrow(ForbiddenError);
  });
});

describe("concurrency", () => {
  it("never double-books an exclusive guide slot", async () => {
    const a = await newTraveller(db);
    const b = await newTraveller(db);
    const ta = await tripWithGuideAndExperience(db, a);
    // Second traveller books the same guide, same day and time.
    const tb = await makeTrip(db, b, { offsetDays: ta.offsetDays });
    const days = (await db.query<{ id: string; date: string }>("select id, date from itinerary_days where trip_id = $1", [tb.id])).rows;
    const sameDay = days.find((d) => d.date === ta.guideDay.date)!;
    const { addGuideItem } = await import("@/server/services/trips");
    await addGuideItem(db, b, tb.id, { serviceId: ta.service.id, dayId: sameDay.id, startTime: "09:00" });

    const qa = await quoteTrip(db, a, ta.trip.id);
    const qb = await quoteTrip(db, b, tb.id);
    const results = await Promise.allSettled([
      requestBooking(db, a, { tripId: ta.trip.id, quoteVersionId: qa.versionId, idempotencyKey: key() }),
      requestBooking(db, b, { tripId: tb.id, quoteVersionId: qb.versionId, idempotencyKey: key() }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason.message)).toMatch(/just booked|Availability changed/);

    // The database constraint itself also rejects a direct overlapping insert.
    const holds = await db.query<{ n: number }>(
      "select count(*)::int as n from inventory_holds where kind = 'guide' and guide_provider_id = $1 and status in ('held', 'confirmed') and during && (select during from inventory_holds where kind = 'guide' and booking_id = $2)",
      [ta.service.provider_id, (fulfilled[0] as PromiseFulfilledResult<{ bookingId: string }>).value.bookingId],
    );
    expect(holds.rows[0].n).toBe(1);
  });

  it("never oversells slot capacity", async () => {
    const travellers = await Promise.all(Array.from({ length: 4 }, () => newTraveller(db)));
    const trips = [];
    for (const t of travellers) {
      const trip = await makeTrip(db, t, { adults: 4, offsetDays: 2 });
      // Shared game drive: capacity 6 per slot, each party is 4 — only one can fit.
      const slot = await firstSlotOn(db, "shared-sunrise-game-drive-demo", trip.start);
      await addExperienceItem(db, t, trip.id, { slotId: slot.id });
      trips.push({ t, trip, q: await quoteTrip(db, t, trip.id), slot });
    }
    const results = await Promise.allSettled(trips.map(({ t, trip, q }) => requestBooking(db, t, { tripId: trip.id, quoteVersionId: q.versionId, idempotencyKey: key() })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const slot = await db.query<{ reserved: number; capacity: number }>("select reserved, capacity from experience_slots where id = $1", [trips[0].slot.id]);
    expect(slot.rows[0].reserved).toBeLessThanOrEqual(slot.rows[0].capacity);
    expect(slot.rows[0].reserved).toBe(4);
  });
});
