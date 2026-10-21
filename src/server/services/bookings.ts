import { z } from "zod";
import type { Db, Queryable } from "../db/client";
import {
  bookingAccess,
  isAdmin,
  requireActor,
  requireProvider,
  NotFoundError,
  ForbiddenError,
  type Actor,
  type BookingAccess,
} from "@/domain/authz";
import { bookingMachine, paymentStatusMachine, tripMachine, type BookingStatus, type PaymentStatus, type TripStatus } from "@/domain/states";
import { priceQuote, type Quote } from "@/domain/pricing";
import { resolveCommission, splitCommission, type CommissionRule } from "@/domain/commission";
import { planRefund, type CancellationPolicy } from "@/domain/cancellation";
import { hasBlockingIssues } from "@/domain/scheduling";
import { formatMoney } from "@/lib/money";
import { loadOwnedTrip, loadTripGraph, validateTripGraph, priceableLines, snapshotGraph, slotUnitsFor } from "./trips";
import { getSettings } from "./settings";
import { notify } from "./notifications";
import { audit, primaryRole } from "./audit";
import { postLedger } from "./ledger";
import { referenceCode } from "../auth/tokens";
import { ConflictError, UserError, isPgError } from "../errors";
import { getProvider, PaymentProviderError, type PaymentProvider, type VerifiedStatus } from "../payments";

// ───────────────────────────── helpers ─────────────────────────────

interface BookingRow {
  id: string;
  reference: string;
  trip_id: string;
  traveller_id: string;
  version_id: string;
  status: BookingStatus;
  payment_status: PaymentStatus;
  currency: string;
  subtotal_minor: number;
  discount_minor: number;
  service_fee_minor: number;
  tax_minor: number;
  total_minor: number;
  hold_expires_at: Date | null;
  confirmed_at: Date | null;
  cancelled_at: Date | null;
  completed_at: Date | null;
  cancellation_reason: string | null;
  created_at: Date;
}

interface ItemRow {
  id: string;
  booking_id: string;
  itinerary_item_id: string | null;
  provider_id: string;
  kind: "experience" | "guide";
  experience_id: string | null;
  slot_id: string | null;
  guide_service_id: string | null;
  title: string;
  starts_at: Date;
  ends_at: Date;
  adults: number;
  children: number;
  pricing_model: string;
  unit_price_minor: number;
  gross_minor: number;
  discount_minor: number;
  line_total_minor: number;
  cancellation_policy: CancellationPolicy;
  commission_bps: number;
  commission_minor: number;
  provider_earnings_minor: number;
  provider_status: "pending" | "accepted" | "declined" | "cancelled";
  provider_note: string | null;
  status: "active" | "cancelled" | "completed";
}

async function lockBooking(db: Queryable, bookingId: string): Promise<BookingRow> {
  if (!z.string().uuid().safeParse(bookingId).success) throw new NotFoundError("Booking not found.");
  const { rows } = await db.query<BookingRow>("select * from bookings where id = $1 for update", [bookingId]);
  if (!rows[0]) throw new NotFoundError("Booking not found.");
  return rows[0];
}

async function loadItems(db: Queryable, bookingId: string): Promise<ItemRow[]> {
  const { rows } = await db.query<ItemRow>("select * from booking_items where booking_id = $1 order by starts_at", [bookingId]);
  return rows;
}

type ActorRole = string;

async function setBookingStatus(
  db: Queryable,
  booking: BookingRow,
  to: BookingStatus,
  actor: { id: string | null; role: ActorRole },
  reason?: string,
  metadata: Record<string, unknown> = {},
) {
  bookingMachine.assert(booking.status, to);
  await db.query("update bookings set status = $2 where id = $1", [booking.id, to]);
  await db.query(
    `insert into booking_status_events (booking_id, from_status, to_status, actor_id, actor_role, reason, metadata)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [booking.id, booking.status, to, actor.id, actor.role, reason ?? null, JSON.stringify(metadata)],
  );
  booking.status = to;
}

async function setPaymentStatus(db: Queryable, booking: BookingRow, to: PaymentStatus) {
  if (booking.payment_status === to) return;
  paymentStatusMachine.assert(booking.payment_status, to);
  await db.query("update bookings set payment_status = $2 where id = $1", [booking.id, to]);
  booking.payment_status = to;
}

async function setTripStatus(db: Queryable, tripId: string, to: TripStatus) {
  const { rows } = await db.query<{ status: TripStatus }>("select status from trips where id = $1 for update", [tripId]);
  const from = rows[0]?.status;
  if (!from || from === to) return;
  if (tripMachine.can(from, to)) await db.query("update trips set status = $2 where id = $1", [tripId, to]);
}

async function providerUserIds(db: Queryable, providerIds: string[]): Promise<{ providerId: string; userId: string }[]> {
  const { rows } = await db.query<{ id: string; user_id: string }>("select id, user_id from provider_profiles where id = any($1::uuid[])", [providerIds]);
  return rows.map((r) => ({ providerId: r.id, userId: r.user_id }));
}

/** Releases (or confirms) every hold on a booking. Slot capacity is returned atomically. */
async function releaseHolds(db: Queryable, bookingId: string, to: "released" | "expired", itemIds?: string[]) {
  const { rows } = await db.query<{ id: string; kind: string; slot_id: string | null; quantity: number | null }>(
    `update inventory_holds set status = $2
      where booking_id = $1 and status in ('held', 'confirmed') ${itemIds ? "and booking_item_id = any($3::uuid[])" : ""}
      returning id, kind, slot_id, quantity`,
    itemIds ? [bookingId, to, itemIds] : [bookingId, to],
  );
  for (const h of rows) {
    if (h.kind === "slot" && h.slot_id && h.quantity) {
      await db.query("update experience_slots set reserved = greatest(reserved - $2, 0) where id = $1", [h.slot_id, h.quantity]);
    }
  }
}

// ───────────────────────────── booking request ─────────────────────────────

export interface RequestBookingInput {
  tripId: string;
  quoteVersionId: string;
  idempotencyKey: string;
}

/**
 * Converts a fresh quote into a booking request. Availability and prices are re-checked inside the
 * transaction; slot capacity is reserved atomically and guide time is protected by an exclusion
 * constraint, so concurrent requests can never double-book.
 */
export async function requestBooking(db: Db, actor: Actor | null, input: RequestBookingInput, now = new Date()) {
  const a = requireActor(actor);
  if (!/^[\w-]{16,100}$/.test(input.idempotencyKey)) throw new UserError("Invalid request key.");

  const result = await db.transaction(async (tx) => {
    const existing = await tx.query<{ id: string; traveller_id: string; reference: string }>(
      "select id, traveller_id, reference from bookings where idempotency_key = $1",
      [input.idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].traveller_id !== a.userId) throw new ForbiddenError();
      return { bookingId: existing.rows[0].id, reference: existing.rows[0].reference, replayed: true };
    }

    await expireDueBookings(tx, now, { skipPaymentPending: true });

    const trip = await loadOwnedTrip(tx, a, input.tripId, true);
    if (trip.status !== "quoted") throw new UserError("Request a fresh quote before booking.");

    const { rows: quotes } = await tx.query<{ id: string; valid_until: Date | null; total_minor: number; pricing: Quote }>(
      "select id, valid_until, total_minor, pricing from itinerary_versions where trip_id = $1 and kind = 'quote' order by version desc limit 1",
      [trip.id],
    );
    const quote = quotes[0];
    if (!quote || quote.id !== input.quoteVersionId) throw new UserError("Your itinerary changed since this quote. Please review the new quote.");
    if (!quote.valid_until || quote.valid_until <= now) throw new UserError("This quote has expired. Please request a new quote.");

    const graph = await loadTripGraph(tx, trip);
    const issues = await validateTripGraph(tx, graph, now);
    if (hasBlockingIssues(issues)) throw new ConflictError("Availability changed since your quote. Please review your itinerary.");

    const settings = await getSettings(tx);
    const priced = priceQuote(priceableLines(graph), settings);
    if (priced.totalMinor !== quote.total_minor) throw new ConflictError("Prices changed since your quote. Please request a new quote.");

    const { rows: ruleRows } = await tx.query<{
      id: string;
      provider_id: string | null;
      provider_kind: "guide" | "operator" | null;
      category_id: string | null;
      commission_bps: number;
      created_at: Date;
    }>("select id, provider_id, provider_kind, category_id, commission_bps, created_at from commission_rules where active");
    const rules: CommissionRule[] = ruleRows.map((r) => ({
      id: r.id,
      providerId: r.provider_id,
      providerKind: r.provider_kind,
      categoryId: r.category_id,
      commissionBps: r.commission_bps,
      createdAt: r.created_at,
    }));
    const { rows: kinds } = await tx.query<{ id: string; kind: "guide" | "operator" }>(
      "select id, kind from provider_profiles where id = any($1::uuid[])",
      [[...new Set(graph.items.map((i) => i.providerId).filter(Boolean))]],
    );
    const providerKind = new Map(kinds.map((k) => [k.id, k.kind]));

    const { rows: versionRows } = await tx.query<{ id: string }>(
      `insert into itinerary_versions (trip_id, version, kind, snapshot, pricing, total_minor, currency, created_by)
       values ($1, (select coalesce(max(version), 0) + 1 from itinerary_versions where trip_id = $1), 'booking', $2, $3, $4, $5, $6) returning id`,
      [trip.id, JSON.stringify(snapshotGraph(graph)), JSON.stringify(priced), priced.totalMinor, priced.currency, a.userId],
    );

    const holdExpires = new Date(now.getTime() + settings.acceptanceHoldHours * 3_600_000);
    const reference = referenceCode("BTD");
    const { rows: bookingRows } = await tx.query<{ id: string }>(
      `insert into bookings (reference, trip_id, traveller_id, version_id, status, currency, subtotal_minor, discount_minor,
                             service_fee_minor, tax_minor, total_minor, idempotency_key, hold_expires_at)
       values ($1, $2, $3, $4, 'pending_provider', $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [
        reference, trip.id, a.userId, versionRows[0].id, priced.currency, priced.subtotalMinor, priced.discountMinor,
        priced.serviceFeeMinor, priced.taxMinor, priced.totalMinor, input.idempotencyKey, holdExpires,
      ],
    );
    const bookingId = bookingRows[0].id;
    await tx.query(
      "insert into booking_status_events (booking_id, from_status, to_status, actor_id, actor_role) values ($1, null, 'pending_provider', $2, 'traveller')",
      [bookingId, a.userId],
    );

    const party = { adults: trip.adults, children: trip.children };
    const lineByKey = new Map(priced.lines.map((l) => [l.key, l]));
    for (const item of graph.items) {
      const line = lineByKey.get(item.id);
      if (!line || !item.providerId || !item.startsAt || !item.endsAt) continue;
      const commission = resolveCommission(
        rules,
        { providerId: item.providerId, providerKind: providerKind.get(item.providerId) ?? "guide", categoryId: item.experience?.categoryId ?? null },
        settings.defaultCommissionBps,
      );
      const split = splitCommission(line.totalMinor, commission.commissionBps);
      const terms = {
        cancellationPolicy: item.cancellationPolicy,
        inclusions: item.experience?.inclusions ?? [],
        exclusions: item.experience?.exclusions ?? [],
        meetingPoint: item.experience?.meetingPoint ?? null,
        preparationNotes: item.experience?.preparationNotes ?? null,
        discountRuleId: line.discountRuleId,
      };
      const { rows: itemRows } = await tx.query<{ id: string }>(
        `insert into booking_items (booking_id, itinerary_item_id, provider_id, kind, experience_id, slot_id, guide_service_id, title, starts_at, ends_at,
                                    adults, children, pricing_model, unit_price_minor, gross_minor, discount_minor, line_total_minor,
                                    cancellation_policy, terms_snapshot, commission_bps, commission_rule_id, commission_minor, provider_earnings_minor)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) returning id`,
        [
          bookingId, item.id, item.providerId, item.kind, item.experience?.id ?? null, item.slot?.id ?? null, item.guide?.serviceId ?? null,
          item.title, item.startsAt, item.endsAt, party.adults, party.children, line.pricingModel, line.unitPriceMinor, line.grossMinor,
          line.discountMinor, line.totalMinor, item.cancellationPolicy, JSON.stringify(terms), commission.commissionBps, commission.ruleId,
          split.commissionMinor, split.providerEarningsMinor,
        ],
      );
      const bookingItemId = itemRows[0].id;

      if (item.kind === "experience" && item.slot) {
        const qty = slotUnitsFor(line.pricingModel, party.adults + party.children);
        const reserved = await tx.query(
          "update experience_slots set reserved = reserved + $2 where id = $1 and status = 'open' and reserved + $2 <= capacity returning id",
          [item.slot.id, qty],
        );
        if (reserved.rowCount === 0) throw new ConflictError(`${item.title} has just sold out at that time. Please choose another time.`);
        await tx.query(
          "insert into inventory_holds (booking_id, booking_item_id, kind, slot_id, quantity, status, expires_at) values ($1, $2, 'slot', $3, $4, 'held', $5)",
          [bookingId, bookingItemId, item.slot.id, qty, holdExpires],
        );
      }
      if (item.kind === "guide") {
        const bufferedEnd = new Date(item.endsAt.getTime() + (item.guide?.bufferMinutes ?? 0) * 60_000);
        try {
          await tx.query(
            `insert into inventory_holds (booking_id, booking_item_id, kind, guide_provider_id, during, status, expires_at)
             values ($1, $2, 'guide', $3, tstzrange($4, $5, '[)'), 'held', $6)`,
            [bookingId, bookingItemId, item.providerId, item.startsAt, bufferedEnd, holdExpires],
          );
        } catch (err) {
          if (isPgError(err, "23P01")) throw new ConflictError(`${item.providerName ?? "This guide"} was just booked at that time. Please choose another time.`);
          throw err;
        }
      }
    }

    tripMachine.assert("quoted", "pending_booking");
    await tx.query("update trips set status = 'pending_booking' where id = $1", [trip.id]);

    // Booking conversation between the traveller and every provider involved.
    const providerIds = [...new Set(graph.items.filter((i) => lineByKey.has(i.id)).map((i) => i.providerId!).filter(Boolean))];
    const providers = await providerUserIds(tx, providerIds);
    const { rows: conv } = await tx.query<{ id: string }>("insert into conversations (booking_id, subject) values ($1, $2) returning id", [
      bookingId,
      `${trip.title} · ${reference}`,
    ]);
    await tx.query("insert into conversation_participants (conversation_id, user_id, role) values ($1, $2, 'traveller')", [conv[0].id, a.userId]);
    for (const p of providers) {
      await tx.query(
        "insert into conversation_participants (conversation_id, user_id, role) values ($1, $2, 'provider') on conflict do nothing",
        [conv[0].id, p.userId],
      );
      await notify(tx, {
        userId: p.userId,
        type: "booking.requested",
        title: `New booking request ${reference}`,
        body: `A traveller has requested ${trip.title}. Please accept or decline before ${holdExpires.toUTCString()}.`,
        link: `/provider/bookings/${bookingId}`,
        dedupeKey: `booking.requested:${bookingId}:${p.providerId}`,
      });
    }
    await notify(tx, {
      userId: a.userId,
      type: "booking.requested",
      title: `Booking request ${reference} sent`,
      body: "Your providers have been asked to confirm. You'll be able to pay once everyone accepts. Nothing has been charged yet.",
      link: `/dashboard/bookings/${bookingId}`,
      dedupeKey: `booking.requested:${bookingId}:traveller`,
    });

    return { bookingId, reference, replayed: false };
  });
  return result;
}

// ───────────────────────────── provider response ─────────────────────────────

export async function respondToBooking(
  db: Db,
  actor: Actor | null,
  bookingId: string,
  decision: "accept" | "decline",
  note: string | null,
  now = new Date(),
) {
  const provider = requireProvider(actor);
  return db.transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId);
    const items = await loadItems(tx, bookingId);
    const mine = items.filter((i) => i.provider_id === provider.providerId);
    if (!mine.length) throw new NotFoundError("Booking not found.");
    if (booking.status !== "pending_provider") throw new UserError("This booking is no longer awaiting your response.");
    if (booking.hold_expires_at && booking.hold_expires_at <= now) throw new UserError("The response window for this booking has passed.");
    if (mine.every((i) => i.provider_status !== "pending")) throw new UserError("You have already responded to this booking.");

    const role = primaryRole(provider.roles);
    const providerStatus = decision === "accept" ? "accepted" : "declined";
    await tx.query(
      "update booking_items set provider_status = $3, provider_note = $4, provider_responded_at = now() where booking_id = $1 and provider_id = $2 and provider_status = 'pending'",
      [bookingId, provider.providerId, providerStatus, note?.slice(0, 1000) ?? null],
    );

    if (decision === "decline") {
      await setBookingStatus(tx, booking, "provider_declined", { id: provider.userId, role }, note ?? "Declined by provider");
      await releaseHolds(tx, bookingId, "released");
      await setTripStatus(tx, booking.trip_id, "draft");
      await notify(tx, {
        userId: booking.traveller_id,
        type: "booking.declined",
        title: `Booking ${booking.reference} was declined`,
        body: `A provider couldn't accept your request${note ? `: "${note}"` : "."} Your itinerary is back in draft so you can choose an alternative. You have not been charged.`,
        link: `/studio/${booking.trip_id}`,
        dedupeKey: `booking.declined:${bookingId}`,
      });
      return { status: booking.status };
    }

    const remaining = await tx.query("select 1 from booking_items where booking_id = $1 and provider_status <> 'accepted'", [bookingId]);
    if (remaining.rowCount === 0) {
      const settings = await getSettings(tx);
      const payBy = new Date(now.getTime() + settings.paymentWindowHours * 3_600_000);
      await setBookingStatus(tx, booking, "awaiting_payment", { id: provider.userId, role }, "All providers accepted");
      await tx.query("update bookings set hold_expires_at = $2 where id = $1", [bookingId, payBy]);
      await tx.query("update inventory_holds set expires_at = $2 where booking_id = $1 and status = 'held'", [bookingId, payBy]);
      await notify(tx, {
        userId: booking.traveller_id,
        type: "booking.awaiting_payment",
        title: `Ready to pay: ${booking.reference}`,
        body: `All providers have accepted. Complete payment of ${formatMoney(booking.total_minor, booking.currency)} by ${payBy.toUTCString()} to confirm your trip.`,
        link: `/dashboard/bookings/${bookingId}`,
        dedupeKey: `booking.awaiting_payment:${bookingId}`,
      });
    } else {
      await notify(tx, {
        userId: booking.traveller_id,
        type: "booking.accepted",
        title: `A provider accepted ${booking.reference}`,
        body: "We're waiting for the remaining providers to respond.",
        link: `/dashboard/bookings/${bookingId}`,
        dedupeKey: `booking.accepted:${bookingId}:${provider.providerId}`,
      });
    }
    return { status: booking.status };
  });
}

// ───────────────────────────── checkout ─────────────────────────────

export interface CheckoutInput {
  bookingId: string;
  provider: string;
  phone?: string;
  idempotencyKey: string;
  appUrl: string;
}

export async function startCheckout(db: Db, actor: Actor | null, input: CheckoutInput, now = new Date()) {
  const a = requireActor(actor);
  if (!/^[\w-]{16,100}$/.test(input.idempotencyKey)) throw new UserError("Invalid request key.");
  const provider = getProvider(db, input.provider);

  const prepared = await db.transaction(async (tx) => {
    const booking = await lockBooking(tx, input.bookingId);
    if (booking.traveller_id !== a.userId) throw new NotFoundError("Booking not found.");

    const existing = await tx.query<{ id: string; status: string; provider_reference: string | null }>(
      "select id, status, provider_reference from payment_attempts where idempotency_key = $1 and booking_id = $2",
      [input.idempotencyKey, booking.id],
    );
    if (existing.rows[0]) return { attemptId: existing.rows[0].id, replay: true, booking };

    if (booking.status !== "awaiting_payment" && booking.status !== "payment_pending") {
      throw new UserError("This booking isn't ready for payment.");
    }
    if (booking.hold_expires_at && booking.hold_expires_at <= now) throw new UserError("The payment window has closed. Please request a new booking.");
    const inFlight = await tx.query(
      "select 1 from payment_attempts where booking_id = $1 and status = 'pending' and created_at > $2",
      [booking.id, new Date(now.getTime() - 2 * 60_000)],
    );
    if (inFlight.rowCount) throw new UserError("A payment is already in progress. Please complete it or wait a couple of minutes.");

    const { rows } = await tx.query<{ id: string }>(
      `insert into payment_attempts (booking_id, provider, idempotency_key, amount_minor, currency, status)
       values ($1, $2, $3, $4, $5, 'initiated') returning id`,
      [booking.id, provider.id, input.idempotencyKey, booking.total_minor, booking.currency],
    );
    return { attemptId: rows[0].id, replay: false, booking };
  });

  if (prepared.replay) {
    const { rows } = await db.query<{ status: string; provider_reference: string | null }>(
      "select status, provider_reference from payment_attempts where id = $1",
      [prepared.attemptId],
    );
    return { attemptId: prepared.attemptId, redirectUrl: null, instruction: `Payment already ${rows[0].status}.` };
  }

  // External call happens outside any database transaction.
  let initiated;
  try {
    initiated = await provider.initiate({
      attemptId: prepared.attemptId,
      bookingReference: prepared.booking.reference,
      amountMinor: prepared.booking.total_minor,
      currency: prepared.booking.currency,
      description: `Booking ${prepared.booking.reference}`,
      phone: input.phone,
      callbackUrl: `${input.appUrl}/api/payments/${provider.id}/callback`,
      returnUrl: `/dashboard/bookings/${prepared.booking.id}`,
    });
  } catch (err) {
    const message = err instanceof PaymentProviderError ? err.message : "The payment provider is unavailable. Please try again.";
    if (!(err instanceof PaymentProviderError)) console.error("[payments] initiate failed", err);
    await db.query("update payment_attempts set status = 'failed', failure_reason = $2 where id = $1", [prepared.attemptId, message]);
    throw new UserError(message);
  }

  await db.transaction(async (tx) => {
    const booking = await lockBooking(tx, prepared.booking.id);
    await tx.query("update payment_attempts set status = 'pending', provider_reference = $2, payer_hint = $3 where id = $1 and status = 'initiated'", [
      prepared.attemptId,
      initiated.providerReference,
      input.phone ? `•••${input.phone.replace(/\D/g, "").slice(-3)}` : null,
    ]);
    if (booking.status === "awaiting_payment") {
      await setBookingStatus(tx, booking, "payment_pending", { id: a.userId, role: "traveller" }, `Checkout via ${provider.id}`);
    }
    await setPaymentStatus(tx, booking, "pending");
    // Keep inventory while the traveller completes payment.
    const minHold = new Date(now.getTime() + 30 * 60_000);
    await tx.query("update bookings set hold_expires_at = greatest(hold_expires_at, $2) where id = $1", [booking.id, minHold]);
    await tx.query("update inventory_holds set expires_at = greatest(expires_at, $2) where booking_id = $1 and status = 'held'", [booking.id, minHold]);
  });

  return { attemptId: prepared.attemptId, redirectUrl: initiated.redirectUrl, instruction: initiated.instruction };
}

// ───────────────────────────── payment events ─────────────────────────────

export type PaymentEventResult =
  | "duplicate"
  | "invalid_signature"
  | "unknown_reference"
  | "pending"
  | "confirmed"
  | "already_processed"
  | "failed_recorded"
  | "late_payment"
  | "amount_mismatch"
  | "ignored_stale";

/**
 * Entry point for provider callbacks. Persists the event (deduplicated by provider event id),
 * then re-verifies the payment with the provider before changing any state.
 */
export async function handlePaymentWebhook(
  db: Db,
  providerId: string,
  rawBody: string,
  headers: Headers,
  url: URL,
): Promise<PaymentEventResult> {
  const provider = getProvider(db, providerId);
  const parsed = await provider.parseWebhook(rawBody, headers, url);

  const { rows: inserted } = await db.query<{ id: string }>(
    `insert into payment_events (provider, provider_event_id, event_type, signature_valid, payload)
     values ($1, $2, $3, $4, $5) on conflict (provider, provider_event_id) do nothing returning id`,
    [provider.id, parsed.eventId, parsed.eventType, parsed.signatureValid, JSON.stringify(parsed.safePayload)],
  );
  const eventId = inserted[0]?.id;
  if (!eventId) return "duplicate";

  const finish = async (result: PaymentEventResult, attemptId: string | null = null) => {
    await db.query("update payment_events set processing_result = $2, processed_at = now(), payment_attempt_id = $3 where id = $1", [eventId, result, attemptId]);
    return result;
  };

  if (!parsed.signatureValid) return finish("invalid_signature");

  const { rows: attempts } = await db.query<{ id: string }>("select id from payment_attempts where provider = $1 and provider_reference = $2", [
    provider.id,
    parsed.providerReference,
  ]);
  const attempt = attempts[0];
  if (!attempt) return finish("unknown_reference");

  const verified = await provider.queryStatus(parsed.providerReference);
  // M-Pesa's status query omits the amount; fall back to the authenticated callback's amount.
  if (verified.status === "succeeded" && verified.amountMinor === null && typeof parsed.safePayload.amount === "number") {
    verified.amountMinor = Math.round(parsed.safePayload.amount * 100);
    verified.receipt ??= (parsed.safePayload.receipt as string | null) ?? null;
  }
  const result = await applyVerifiedPayment(db, attempt.id, verified);
  return finish(result, attempt.id);
}

/** Applies a provider-verified status to a payment attempt and its booking. Idempotent. */
export async function applyVerifiedPayment(db: Db, attemptId: string, verified: VerifiedStatus): Promise<PaymentEventResult> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; booking_id: string; status: string; amount_minor: number; currency: string; provider: string }>(
      "select id, booking_id, status, amount_minor, currency, provider from payment_attempts where id = $1 for update",
      [attemptId],
    );
    const attempt = rows[0];
    if (!attempt) return "unknown_reference";
    const booking = await lockBooking(tx, attempt.booking_id);

    if (verified.status === "pending") return "pending";

    if (verified.status === "failed") {
      if (attempt.status === "succeeded") return "ignored_stale";
      if (attempt.status === "failed") return "already_processed";
      await tx.query("update payment_attempts set status = 'failed', failure_reason = $2 where id = $1", [attempt.id, verified.failureReason ?? "Payment failed"]);
      if (booking.status === "payment_pending") {
        await setBookingStatus(tx, booking, "awaiting_payment", { id: null, role: "system" }, "Payment failed");
        await setPaymentStatus(tx, booking, "failed");
      }
      await notify(tx, {
        userId: booking.traveller_id,
        type: "payment.failed",
        title: `Payment for ${booking.reference} didn't go through`,
        body: `${verified.failureReason ?? "The payment was not completed."} You can try again before your hold expires.`,
        link: `/dashboard/bookings/${booking.id}`,
        dedupeKey: `payment.failed:${attempt.id}`,
      });
      return "failed_recorded";
    }

    // succeeded
    if (attempt.status === "succeeded") return "already_processed";
    if (verified.amountMinor !== null && (verified.amountMinor !== attempt.amount_minor || (verified.currency && verified.currency !== attempt.currency))) {
      await tx.query("update payment_attempts set failure_reason = 'Amount mismatch — held for review' where id = $1", [attempt.id]);
      await openSystemCase(tx, booking, "Payment amount mismatch", `Provider reported ${verified.amountMinor} ${verified.currency}; expected ${attempt.amount_minor} ${attempt.currency}. Attempt ${attempt.id}.`);
      return "amount_mismatch";
    }
    await tx.query("update payment_attempts set status = 'succeeded', provider_receipt = $2, failure_reason = null where id = $1", [attempt.id, verified.receipt]);

    const canConfirm = booking.status === "payment_pending" || booking.status === "awaiting_payment";
    if (!canConfirm) {
      // Money arrived for a booking that already expired or was cancelled: park it and refund.
      await postLedger(tx, {
        type: "unallocated_payment",
        currency: attempt.currency,
        bookingId: booking.id,
        paymentAttemptId: attempt.id,
        lines: [
          { account: "cash", amountMinor: attempt.amount_minor },
          { account: "suspense", amountMinor: -attempt.amount_minor, memo: "Payment received after booking closed" },
        ],
      });
      await tx.query(
        `insert into refunds (booking_id, payment_attempt_id, amount_minor, currency, reason, status, idempotency_key, requested_by, breakdown)
         values ($1, $2, $3, $4, 'Payment received after the booking closed', 'requested', $5, $6, '{"suspense": true}')`,
        [booking.id, attempt.id, attempt.amount_minor, attempt.currency, `late:${attempt.id}`, booking.traveller_id],
      );
      await openSystemCase(tx, booking, "Late payment requires refund", `Payment ${attempt.id} succeeded after booking moved to ${booking.status}. A refund has been queued.`);
      return "late_payment";
    }

    await confirmBooking(tx, booking, attempt.id);
    return "confirmed";
  });
}

async function openSystemCase(tx: Queryable, booking: BookingRow, subject: string, description: string) {
  await tx.query(
    `insert into support_cases (reference, kind, status, priority, subject, description, booking_id)
     values ($1, 'dispute', 'open', 'high', $2, $3, $4)`,
    [referenceCode("CASE"), subject, description, booking.id],
  );
}

async function confirmBooking(tx: Queryable, booking: BookingRow, attemptId: string) {
  const items = await loadItems(tx, booking.id);
  await setBookingStatus(tx, booking, "confirmed", { id: null, role: "system" }, "Payment verified", { paymentAttemptId: attemptId });
  await setPaymentStatus(tx, booking, "paid");
  await tx.query("update bookings set confirmed_at = now(), hold_expires_at = null where id = $1", [booking.id]);
  await tx.query("update inventory_holds set status = 'confirmed', expires_at = null where booking_id = $1 and status = 'held'", [booking.id]);

  const active = items.filter((i) => i.status === "active");
  await postLedger(tx, {
    type: "payment_captured",
    currency: booking.currency,
    bookingId: booking.id,
    paymentAttemptId: attemptId,
    lines: [
      { account: "cash", amountMinor: booking.total_minor, memo: `Payment for ${booking.reference}` },
      ...active.map((i) => ({ account: "provider_payable" as const, amountMinor: -i.provider_earnings_minor, providerId: i.provider_id, bookingItemId: i.id })),
      { account: "platform_revenue", amountMinor: -(active.reduce((s, i) => s + i.commission_minor, 0) + booking.service_fee_minor), memo: "Commission + service fee" },
      { account: "tax_payable", amountMinor: -booking.tax_minor },
    ],
  });

  const { rows: version } = await tx.query<{ snapshot: unknown; pricing: unknown; trip_id: string }>(
    "select snapshot, pricing, trip_id from itinerary_versions where id = $1",
    [booking.version_id],
  );
  await tx.query(
    `insert into itinerary_versions (trip_id, version, kind, snapshot, pricing, total_minor, currency, created_by)
     values ($1, (select coalesce(max(version), 0) + 1 from itinerary_versions where trip_id = $1), 'confirmed', $2, $3, $4, $5, $6)`,
    [booking.trip_id, JSON.stringify(version[0].snapshot), JSON.stringify(version[0].pricing), booking.total_minor, booking.currency, booking.traveller_id],
  );
  await setTripStatus(tx, booking.trip_id, "confirmed");

  await notify(tx, {
    userId: booking.traveller_id,
    type: "booking.confirmed",
    title: `Confirmed: ${booking.reference}`,
    body: `Your payment of ${formatMoney(booking.total_minor, booking.currency)} was verified and your trip is confirmed.`,
    link: `/dashboard/bookings/${booking.id}`,
    dedupeKey: `booking.confirmed:${booking.id}`,
  });
  for (const p of await providerUserIds(tx, [...new Set(active.map((i) => i.provider_id))])) {
    await notify(tx, {
      userId: p.userId,
      type: "booking.confirmed",
      title: `Booking ${booking.reference} is confirmed`,
      body: "The traveller has paid. The booking is now on your schedule.",
      link: `/provider/bookings/${booking.id}`,
      dedupeKey: `booking.confirmed:${booking.id}:${p.providerId}`,
    });
  }
}

/** Re-checks pending payments whose callbacks may have been lost. */
export async function reconcilePendingPayments(db: Db, opts: { olderThanMinutes?: number } = {}) {
  const { rows } = await db.query<{ id: string; provider: string; provider_reference: string }>(
    `select id, provider, provider_reference from payment_attempts
      where status = 'pending' and provider_reference is not null and updated_at < now() - make_interval(mins => $1)
      order by updated_at limit 50`,
    [opts.olderThanMinutes ?? 2],
  );
  const results: Record<string, number> = {};
  for (const a of rows) {
    let provider: PaymentProvider;
    try {
      provider = getProvider(db, a.provider);
    } catch {
      continue;
    }
    try {
      const verified = await provider.queryStatus(a.provider_reference);
      const r = await applyVerifiedPayment(db, a.id, verified);
      results[r] = (results[r] ?? 0) + 1;
    } catch (err) {
      console.error("[payments] reconciliation failed", a.id, (err as Error).message);
    }
  }
  return results;
}

// ───────────────────────────── cancellation & refunds ─────────────────────────────

/**
 * Cancels a booking (or, for providers, only their own items). Unpaid bookings are simply released.
 * Paid bookings get a policy-based refund for travellers and a full refund when the provider or
 * platform cancels.
 */
export async function cancelBooking(
  db: Db,
  actor: Actor | null,
  bookingId: string,
  reason: string,
  now = new Date(),
): Promise<{ refundId: string | null; refundMinor: number }> {
  const a = requireActor(actor);
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new UserError("Please give a short reason for cancelling.");

  const outcome = await db.transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId);
    const items = await loadItems(tx, bookingId);
    const access = bookingAccess(a, { travellerId: booking.traveller_id, providerIds: items.map((i) => i.provider_id) });
    if (!access || access === "support") throw new NotFoundError("Booking not found.");

    const initiator = access === "traveller" ? "traveller" : access === "provider" ? "provider" : "platform";
    const role = access === "traveller" ? "traveller" : primaryRole(a.roles);
    const targetItems = access === "provider" ? items.filter((i) => i.provider_id === a.providerId && i.status === "active") : items.filter((i) => i.status === "active");
    if (!targetItems.length) throw new UserError("There is nothing left to cancel on this booking.");

    if (booking.status === "payment_pending") throw new UserError("A payment is being processed. Please wait for it to finish before cancelling.");
    if (booking.status === "in_progress" && access !== "admin") throw new UserError("This trip has started. Please contact support to make changes.");
    if (!["pending_provider", "awaiting_payment", "confirmed", "cancellation_requested", "in_progress"].includes(booking.status)) {
      throw new UserError("This booking can no longer be cancelled.");
    }

    const isPaid = booking.payment_status === "paid" || booking.payment_status === "partially_refunded";
    const remainingActive = items.filter((i) => i.status === "active" && !targetItems.includes(i));
    const wholeBooking = remainingActive.length === 0;

    await tx.query("update booking_items set status = 'cancelled', provider_status = case when provider_status = 'pending' then 'cancelled' else provider_status end where id = any($1::uuid[])", [
      targetItems.map((i) => i.id),
    ]);
    await releaseHolds(tx, booking.id, "released", targetItems.map((i) => i.id));

    if (wholeBooking) {
      await setBookingStatus(tx, booking, "cancelled", { id: a.userId, role }, trimmed);
      await tx.query("update bookings set cancelled_at = now(), cancellation_reason = $2, hold_expires_at = null where id = $1", [booking.id, trimmed]);
      await setTripStatus(tx, booking.trip_id, "cancelled");
    } else {
      await tx.query(
        `insert into booking_status_events (booking_id, from_status, to_status, actor_id, actor_role, reason, metadata)
         values ($1, $2, $2, $3, $4, $5, $6)`,
        [booking.id, booking.status, a.userId, role, trimmed, JSON.stringify({ cancelledItems: targetItems.map((i) => i.id) })],
      );
    }

    let refundId: string | null = null;
    let refundMinor = 0;
    if (isPaid) {
      const plan = planRefund(
        targetItems.map((i) => ({
          id: i.id,
          policy: i.cancellation_policy,
          startsAt: i.starts_at,
          lineTotalMinor: i.line_total_minor,
          commissionMinor: i.commission_minor,
          status: "active" as const,
        })),
        // Fees are attributed to the cancelled items in proportion to their share of the booking.
        {
          serviceFeeMinor: proportion(booking.service_fee_minor, targetItems, items),
          taxMinor: proportion(booking.tax_minor, targetItems, items),
        },
        now,
        initiator,
      );
      refundMinor = plan.totalRefundMinor;
      if (refundMinor > 0) {
        const { rows: att } = await tx.query<{ id: string }>(
          "select id from payment_attempts where booking_id = $1 and status = 'succeeded' order by created_at desc limit 1",
          [booking.id],
        );
        if (!att[0]) throw new Error(`Paid booking ${booking.id} has no successful payment attempt`);
        const { rows: refundRows } = await tx.query<{ id: string }>(
          `insert into refunds (booking_id, payment_attempt_id, amount_minor, currency, reason, breakdown, status, idempotency_key, requested_by)
           values ($1, $2, $3, $4, $5, $6, 'requested', $7, $8) returning id`,
          [
            booking.id, att[0].id, refundMinor, booking.currency, trimmed,
            JSON.stringify({ ...plan, initiator }),
            `cancel:${booking.id}:${targetItems.map((i) => i.id).sort().join(",")}`,
            a.userId,
          ],
        );
        refundId = refundRows[0].id;
        await setPaymentStatus(tx, booking, "refund_pending");
      }
    }

    await audit(tx, {
      actorId: a.userId,
      actorRole: role,
      action: wholeBooking ? "booking.cancelled" : "booking.items_cancelled",
      entityType: "booking",
      entityId: booking.id,
      reason: trimmed,
      details: { items: targetItems.map((i) => i.id), refundMinor },
    });

    const message = refundMinor > 0 ? `A refund of ${formatMoney(refundMinor, booking.currency)} is being processed.` : isPaid ? "Under the cancellation policy, no refund is due." : "You have not been charged.";
    await notify(tx, {
      userId: booking.traveller_id,
      type: "booking.cancelled",
      title: wholeBooking ? `Booking ${booking.reference} cancelled` : `Part of booking ${booking.reference} was cancelled`,
      body: `${targetItems.map((i) => i.title).join(", ")} ${targetItems.length === 1 ? "was" : "were"} cancelled. ${message}`,
      link: `/dashboard/bookings/${booking.id}`,
      dedupeKey: `booking.cancelled:${booking.id}:${targetItems.map((i) => i.id).sort().join(",")}`,
    });
    for (const p of await providerUserIds(tx, [...new Set(targetItems.map((i) => i.provider_id))])) {
      if (p.userId === a.userId) continue;
      await notify(tx, {
        userId: p.userId,
        type: "booking.cancelled",
        title: `Booking ${booking.reference} cancelled`,
        body: `Cancelled by ${initiator}: ${trimmed}`,
        link: `/provider/bookings/${booking.id}`,
        dedupeKey: `booking.cancelled:${booking.id}:${p.providerId}:${targetItems.map((i) => i.id).sort().join(",")}`,
      });
    }
    return { refundId, refundMinor };
  });

  if (outcome.refundId) await processRefund(db, outcome.refundId);
  return outcome;
}

function proportion(amount: number, part: ItemRow[], all: ItemRow[]): number {
  const total = all.reduce((s, i) => s + i.line_total_minor, 0);
  if (total === 0) return 0;
  const share = part.reduce((s, i) => s + i.line_total_minor, 0);
  return Math.floor((amount * share) / total);
}

/** Sends a requested refund to the payment provider and records the outcome. Idempotent. */
export async function processRefund(db: Db, refundId: string): Promise<string> {
  const claimed = await db.query<{ id: string; booking_id: string; amount_minor: number; currency: string; provider: string; provider_reference: string }>(
    `update refunds r set status = 'processing'
       from payment_attempts pa
      where r.id = $1 and r.status = 'requested' and pa.id = r.payment_attempt_id
      returning r.id, r.booking_id, r.amount_minor, r.currency, pa.provider, pa.provider_reference`,
    [refundId],
  );
  const refund = claimed.rows[0];
  if (!refund) return "not_claimable";

  let outcome;
  try {
    outcome = await getProvider(db, refund.provider).refund({
      providerReference: refund.provider_reference,
      amountMinor: refund.amount_minor,
      currency: refund.currency,
      refundId: refund.id,
    });
  } catch (err) {
    console.error("[refunds] provider refund failed", refund.id, (err as Error).message);
    outcome = { status: "failed" as const, providerReference: null };
  }

  if (outcome.status === "succeeded") {
    await completeRefund(db, refund.id, outcome.providerReference, null);
    return "succeeded";
  }
  const status = outcome.status === "manual_required" ? "manual_required" : outcome.status === "pending" ? "processing" : "failed";
  await db.query("update refunds set status = $2, provider_reference = $3 where id = $1", [refund.id, status, outcome.providerReference]);
  return status;
}

/** Records a completed refund (automatically or after manual processing by finance). */
export async function completeRefund(db: Db, refundId: string, providerReference: string | null, decidedBy: string | null) {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      booking_id: string;
      payment_attempt_id: string;
      amount_minor: number;
      currency: string;
      status: string;
      breakdown: {
        suspense?: boolean;
        items?: { id: string; refundMinor: number; commissionReversalMinor: number }[];
        serviceFeeRefundMinor?: number;
        taxRefundMinor?: number;
      };
    }>("select * from refunds where id = $1 for update", [refundId]);
    const refund = rows[0];
    if (!refund) throw new NotFoundError("Refund not found.");
    if (refund.status === "succeeded") return;
    if (!["processing", "manual_required", "requested"].includes(refund.status)) throw new UserError(`Refund is ${refund.status}.`);

    await tx.query("update refunds set status = 'succeeded', provider_reference = coalesce($2, provider_reference), decided_by = coalesce($3, decided_by) where id = $1", [
      refund.id,
      providerReference,
      decidedBy,
    ]);

    const booking = await lockBooking(tx, refund.booking_id);
    if (refund.breakdown.suspense) {
      await postLedger(tx, {
        type: "refund_issued",
        currency: refund.currency,
        bookingId: booking.id,
        refundId: refund.id,
        paymentAttemptId: refund.payment_attempt_id,
        createdBy: decidedBy,
        lines: [
          { account: "suspense", amountMinor: refund.amount_minor },
          { account: "cash", amountMinor: -refund.amount_minor },
        ],
      });
    } else {
      const items = await loadItems(tx, booking.id);
      const providerOf = new Map(items.map((i) => [i.id, i.provider_id]));
      const itemLines = (refund.breakdown.items ?? []).filter((i) => i.refundMinor > 0);
      const commissionReversal = itemLines.reduce((s, i) => s + i.commissionReversalMinor, 0);
      await postLedger(tx, {
        type: "refund_issued",
        currency: refund.currency,
        bookingId: booking.id,
        refundId: refund.id,
        paymentAttemptId: refund.payment_attempt_id,
        createdBy: decidedBy,
        lines: [
          { account: "cash", amountMinor: -refund.amount_minor },
          ...itemLines.map((i) => ({
            account: "provider_payable" as const,
            amountMinor: i.refundMinor - i.commissionReversalMinor,
            providerId: providerOf.get(i.id)!,
            bookingItemId: i.id,
          })),
          { account: "platform_revenue", amountMinor: commissionReversal + (refund.breakdown.serviceFeeRefundMinor ?? 0) },
          { account: "tax_payable", amountMinor: refund.breakdown.taxRefundMinor ?? 0 },
        ],
      });

      const { rows: totals } = await tx.query<{ refunded: number }>(
        "select coalesce(sum(amount_minor), 0)::bigint as refunded from refunds where booking_id = $1 and status = 'succeeded' and not coalesce((breakdown->>'suspense')::boolean, false)",
        [booking.id],
      );
      const pending = await tx.query("select 1 from refunds where booking_id = $1 and status in ('requested', 'processing', 'manual_required')", [booking.id]);
      const next: PaymentStatus = totals[0].refunded >= booking.total_minor ? "refunded" : pending.rowCount ? "refund_pending" : "partially_refunded";
      await setPaymentStatus(tx, booking, next);
    }

    await notify(tx, {
      userId: booking.traveller_id,
      type: "refund.updated",
      title: `Refund issued for ${booking.reference}`,
      body: `${formatMoney(refund.amount_minor, refund.currency)} has been refunded to your original payment method.`,
      link: `/dashboard/bookings/${booking.id}`,
      dedupeKey: `refund.succeeded:${refund.id}`,
    });
  });
}

// ───────────────────────────── lifecycle jobs ─────────────────────────────

/** Expires bookings whose hold windows have passed and releases their inventory. */
export async function expireDueBookings(db: Queryable, now = new Date(), opts: { skipPaymentPending?: boolean } = {}) {
  const statuses = opts.skipPaymentPending ? ["pending_provider", "awaiting_payment"] : ["pending_provider", "awaiting_payment", "payment_pending"];
  const { rows } = await db.query<BookingRow>(
    `select * from bookings where status = any($1::text[]) and hold_expires_at is not null and hold_expires_at <= $2 for update skip locked`,
    [statuses, now],
  );
  for (const booking of rows) {
    if (booking.status === "payment_pending") {
      const recent = await db.query("select 1 from payment_attempts where booking_id = $1 and status = 'pending' and updated_at > $2", [
        booking.id,
        new Date(now.getTime() - 30 * 60_000),
      ]);
      if (recent.rowCount) continue;
    }
    await setBookingStatus(db, booking, "expired", { id: null, role: "system" }, "Hold window elapsed");
    await db.query("update bookings set hold_expires_at = null where id = $1", [booking.id]);
    await releaseHolds(db, booking.id, "expired");
    await db.query(
      `update trips set status = 'draft' where id = $1 and status = 'pending_booking'`,
      [booking.trip_id],
    );
    await notify(db, {
      userId: booking.traveller_id,
      type: "booking.expired",
      title: `Booking ${booking.reference} expired`,
      body: "The time to respond or pay ran out, so the reservation was released. Your itinerary is back in draft. You have not been charged.",
      link: `/studio/${booking.trip_id}`,
      dedupeKey: `booking.expired:${booking.id}`,
    });
  }
  return rows.length;
}

/** Moves confirmed bookings to in_progress / completed based on their scheduled times. */
export async function progressBookings(db: Db, now = new Date()) {
  let started = 0;
  let completed = 0;
  const { rows } = await db.query<{ id: string; first_start: Date; last_end: Date; status: BookingStatus }>(
    `select b.id, min(bi.starts_at) as first_start, max(bi.ends_at) as last_end, b.status
       from bookings b join booking_items bi on bi.booking_id = b.id and bi.status = 'active'
      where b.status in ('confirmed', 'in_progress') group by b.id`,
  );
  for (const r of rows) {
    await db.transaction(async (tx) => {
      const booking = await lockBooking(tx, r.id);
      if (booking.status === "confirmed" && r.first_start <= now && r.last_end > now) {
        await setBookingStatus(tx, booking, "in_progress", { id: null, role: "system" }, "Trip started");
        await setTripStatus(tx, booking.trip_id, "in_progress");
        started++;
      }
      if ((booking.status === "confirmed" || booking.status === "in_progress") && r.last_end <= now) {
        await markCompleted(tx, booking, { id: null, role: "system" });
        completed++;
      }
    });
  }
  return { started, completed };
}

async function markCompleted(tx: Queryable, booking: BookingRow, actor: { id: string | null; role: string }) {
  await setBookingStatus(tx, booking, "completed", actor, "All services delivered");
  await tx.query("update bookings set completed_at = now() where id = $1", [booking.id]);
  await tx.query("update booking_items set status = 'completed' where booking_id = $1 and status = 'active'", [booking.id]);
  const { rows } = await tx.query<{ status: TripStatus }>("select status from trips where id = $1", [booking.trip_id]);
  if (rows[0]?.status === "confirmed") await tx.query("update trips set status = 'in_progress' where id = $1", [booking.trip_id]);
  await setTripStatus(tx, booking.trip_id, "completed");
  await notify(tx, {
    userId: booking.traveller_id,
    type: "booking.confirmed",
    title: `How was your trip? (${booking.reference})`,
    body: "Your trip is complete. You can now review the guides and experiences you booked.",
    link: `/dashboard/bookings/${booking.id}`,
    dedupeKey: `booking.completed:${booking.id}`,
  });
}

/** Admin override to complete a booking (e.g. after manual verification). Audited. */
export async function adminCompleteBooking(db: Db, actor: Actor | null, bookingId: string, reason: string) {
  const a = requireActor(actor);
  if (!isAdmin(a)) throw new ForbiddenError();
  await db.transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId);
    await markCompleted(tx, booking, { id: a.userId, role: "admin" });
    await audit(tx, { actorId: a.userId, actorRole: "admin", action: "booking.completed_manually", entityType: "booking", entityId: bookingId, reason });
  });
}

// ───────────────────────────── read models ─────────────────────────────

export interface BookingView {
  access: BookingAccess;
  id: string;
  reference: string;
  tripId: string;
  tripTitle: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  serviceFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
  holdExpiresAt: Date | null;
  createdAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  traveller: { name: string; email: string | null; party: string };
  items: (Pick<ItemRow, "id" | "kind" | "title" | "starts_at" | "ends_at" | "provider_status" | "status" | "cancellation_policy" | "provider_note"> & {
    providerId: string;
    providerName: string;
    providerSlug: string;
    lineTotalMinor: number | null;
    providerEarningsMinor: number | null;
    terms: { meetingPoint?: string | null; inclusions?: string[]; exclusions?: string[]; preparationNotes?: string | null };
    reviewed: boolean;
  })[];
  events: { toStatus: string; fromStatus: string | null; actorRole: string; reason: string | null; createdAt: Date }[];
  payments: { id: string; provider: string; status: string; amountMinor: number; receipt: string | null; createdAt: Date; failureReason: string | null }[];
  refunds: { id: string; amountMinor: number; status: string; reason: string; createdAt: Date }[];
  conversationId: string | null;
  changeRequests: { id: string; message: string; status: string; response: string | null; createdAt: Date }[];
  dietaryNotes: string | null;
  accessibilityNotes: string | null;
}

export async function getBookingView(db: Queryable, actor: Actor | null, bookingId: string): Promise<BookingView> {
  const a = requireActor(actor);
  if (!z.string().uuid().safeParse(bookingId).success) throw new NotFoundError("Booking not found.");
  const { rows } = await db.query<
    BookingRow & { trip_title: string; display_name: string; email: string; adults: number; children: number; dietary_notes: string | null; accessibility_notes: string | null }
  >(
    `select b.*, t.title as trip_title, u.display_name, u.email, t.adults, t.children, t.dietary_notes, t.accessibility_notes
       from bookings b join trips t on t.id = b.trip_id join users u on u.id = b.traveller_id where b.id = $1`,
    [bookingId],
  );
  const b = rows[0];
  if (!b) throw new NotFoundError("Booking not found.");
  const items = await loadItems(db, bookingId);
  const access = bookingAccess(a, { travellerId: b.traveller_id, providerIds: items.map((i) => i.provider_id) });
  if (!access) throw new NotFoundError("Booking not found.");

  const visibleItems = access === "provider" ? items.filter((i) => i.provider_id === a.providerId) : items;
  const { rows: providers } = await db.query<{ id: string; display_name: string; slug: string }>(
    "select id, display_name, slug from provider_profiles where id = any($1::uuid[])",
    [visibleItems.map((i) => i.provider_id)],
  );
  const providerMap = new Map(providers.map((p) => [p.id, p]));
  const { rows: reviewed } = await db.query<{ booking_item_id: string }>("select booking_item_id from reviews where booking_id = $1", [bookingId]);
  const reviewedSet = new Set(reviewed.map((r) => r.booking_item_id));
  const { rows: terms } = await db.query<{ id: string; terms_snapshot: BookingView["items"][number]["terms"] }>(
    "select id, terms_snapshot from booking_items where booking_id = $1",
    [bookingId],
  );
  const termsMap = new Map(terms.map((t) => [t.id, t.terms_snapshot]));

  const seesMoney = access === "traveller" || access === "admin";
  const [events, payments, refunds, conv, changes] = await Promise.all([
    db.query<{ to_status: string; from_status: string | null; actor_role: string; reason: string | null; created_at: Date }>(
      "select to_status, from_status, actor_role, reason, created_at from booking_status_events where booking_id = $1 order by id",
      [bookingId],
    ),
    seesMoney
      ? db.query<{ id: string; provider: string; status: string; amount_minor: number; provider_receipt: string | null; created_at: Date; failure_reason: string | null }>(
          "select id, provider, status, amount_minor, provider_receipt, created_at, failure_reason from payment_attempts where booking_id = $1 order by created_at desc",
          [bookingId],
        )
      : Promise.resolve({ rows: [] }),
    seesMoney
      ? db.query<{ id: string; amount_minor: number; status: string; reason: string; created_at: Date }>(
          "select id, amount_minor, status, reason, created_at from refunds where booking_id = $1 order by created_at desc",
          [bookingId],
        )
      : Promise.resolve({ rows: [] }),
    db.query<{ id: string }>(
      "select c.id from conversations c join conversation_participants cp on cp.conversation_id = c.id where c.booking_id = $1 and cp.user_id = $2",
      [bookingId, a.userId],
    ),
    db.query<{ id: string; message: string; status: string; response: string | null; created_at: Date }>(
      "select id, message, status, response, created_at from itinerary_change_requests where booking_id = $1 order by created_at desc",
      [bookingId],
    ),
  ]);

  const party = `${b.adults} adult${b.adults === 1 ? "" : "s"}${b.children ? `, ${b.children} child${b.children === 1 ? "" : "ren"}` : ""}`;
  return {
    access,
    id: b.id,
    reference: b.reference,
    tripId: b.trip_id,
    tripTitle: access === "support" ? "—" : b.trip_title,
    status: b.status,
    paymentStatus: b.payment_status,
    currency: b.currency,
    subtotalMinor: seesMoney ? b.subtotal_minor : 0,
    discountMinor: seesMoney ? b.discount_minor : 0,
    serviceFeeMinor: seesMoney ? b.service_fee_minor : 0,
    taxMinor: seesMoney ? b.tax_minor : 0,
    totalMinor: seesMoney ? b.total_minor : 0,
    holdExpiresAt: b.hold_expires_at,
    createdAt: b.created_at,
    confirmedAt: b.confirmed_at,
    cancelledAt: b.cancelled_at,
    cancellationReason: b.cancellation_reason,
    traveller: {
      // Providers see first name only; email stays private (contact happens through messaging).
      name: access === "provider" || access === "support" ? b.display_name.split(/\s+/)[0] : b.display_name,
      email: access === "traveller" || access === "admin" ? b.email : null,
      party,
    },
    items: visibleItems.map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      starts_at: i.starts_at,
      ends_at: i.ends_at,
      provider_status: i.provider_status,
      status: i.status,
      cancellation_policy: i.cancellation_policy,
      provider_note: i.provider_note,
      providerId: i.provider_id,
      providerName: providerMap.get(i.provider_id)?.display_name ?? "Provider",
      providerSlug: providerMap.get(i.provider_id)?.slug ?? "",
      lineTotalMinor: access === "support" ? null : i.line_total_minor,
      providerEarningsMinor: access === "provider" || access === "admin" ? i.provider_earnings_minor : null,
      terms: termsMap.get(i.id) ?? {},
      reviewed: reviewedSet.has(i.id),
    })),
    events: events.rows.map((e) => ({ toStatus: e.to_status, fromStatus: e.from_status, actorRole: e.actor_role, reason: access === "support" ? null : e.reason, createdAt: e.created_at })),
    payments: payments.rows.map((p) => ({ id: p.id, provider: p.provider, status: p.status, amountMinor: p.amount_minor, receipt: p.provider_receipt, createdAt: p.created_at, failureReason: p.failure_reason })),
    refunds: refunds.rows.map((r) => ({ id: r.id, amountMinor: r.amount_minor, status: r.status, reason: r.reason, createdAt: r.created_at })),
    conversationId: conv.rows[0]?.id ?? null,
    changeRequests: access === "support" ? [] : changes.rows.map((c) => ({ id: c.id, message: c.message, status: c.status, response: c.response, createdAt: c.created_at })),
    dietaryNotes: access === "support" ? null : b.dietary_notes,
    accessibilityNotes: access === "support" ? null : b.accessibility_notes,
  };
}

export async function listTravellerBookings(db: Queryable, actor: Actor | null) {
  const a = requireActor(actor);
  const { rows } = await db.query<{
    id: string;
    reference: string;
    status: BookingStatus;
    payment_status: PaymentStatus;
    total_minor: number;
    currency: string;
    trip_id: string;
    trip_title: string;
    start_date: string;
    end_date: string;
    created_at: Date;
    hold_expires_at: Date | null;
  }>(
    `select b.id, b.reference, b.status, b.payment_status, b.total_minor, b.currency, b.trip_id, t.title as trip_title, t.start_date, t.end_date, b.created_at, b.hold_expires_at
       from bookings b join trips t on t.id = b.trip_id where b.traveller_id = $1 order by t.start_date desc, b.created_at desc`,
    [a.userId],
  );
  return rows;
}

export async function listProviderBookings(db: Queryable, actor: Actor | null, filter: "requests" | "upcoming" | "past" | "all" = "all") {
  const p = requireProvider(actor);
  const conds = {
    requests: "b.status = 'pending_provider' and exists (select 1 from booking_items x where x.booking_id = b.id and x.provider_id = $1 and x.provider_status = 'pending')",
    upcoming: "b.status in ('awaiting_payment', 'payment_pending', 'confirmed', 'in_progress') and max_end > now()",
    past: "(b.status in ('completed', 'cancelled', 'expired', 'provider_declined') or max_end <= now())",
    all: "true",
  }[filter];
  const { rows } = await db.query<{
    id: string;
    reference: string;
    status: BookingStatus;
    payment_status: PaymentStatus;
    first_start: Date;
    max_end: Date;
    item_titles: string[];
    earnings_minor: number;
    traveller_first_name: string;
    party: number;
    hold_expires_at: Date | null;
  }>(
    `select * from (
       select b.id, b.reference, b.status, b.payment_status, b.hold_expires_at,
              min(bi.starts_at) as first_start, max(bi.ends_at) as max_end,
              array_agg(bi.title order by bi.starts_at) as item_titles,
              sum(bi.provider_earnings_minor) filter (where bi.status <> 'cancelled')::bigint as earnings_minor,
              split_part(u.display_name, ' ', 1) as traveller_first_name,
              max(bi.adults + bi.children) as party
         from bookings b
         join booking_items bi on bi.booking_id = b.id and bi.provider_id = $1
         join users u on u.id = b.traveller_id
        group by b.id, u.display_name
     ) b where ${conds} order by first_start`,
    [p.providerId],
  );
  return rows;
}

// ───────────────────────────── change requests ─────────────────────────────

export async function createChangeRequest(db: Db, actor: Actor | null, bookingId: string, message: string) {
  const a = requireActor(actor);
  const text = message.trim();
  if (text.length < 5) throw new UserError("Please describe the change you'd like.");
  return db.transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId);
    if (booking.traveller_id !== a.userId) throw new NotFoundError("Booking not found.");
    if (!["pending_provider", "awaiting_payment", "confirmed", "in_progress"].includes(booking.status)) {
      throw new UserError("Changes can't be requested for this booking.");
    }
    const open = await tx.query("select 1 from itinerary_change_requests where booking_id = $1 and status = 'open'", [bookingId]);
    if (open.rowCount) throw new UserError("You already have an open change request for this booking.");
    const { rows } = await tx.query<{ id: string }>(
      "insert into itinerary_change_requests (trip_id, booking_id, requested_by, message) values ($1, $2, $3, $4) returning id",
      [booking.trip_id, bookingId, a.userId, text.slice(0, 4000)],
    );
    const items = await loadItems(tx, bookingId);
    for (const p of await providerUserIds(tx, [...new Set(items.map((i) => i.provider_id))])) {
      await notify(tx, {
        userId: p.userId,
        type: "change_request.created",
        title: `Change requested for ${booking.reference}`,
        body: text.slice(0, 300),
        link: `/provider/bookings/${bookingId}`,
        dedupeKey: `change_request.created:${rows[0].id}:${p.providerId}`,
      });
    }
    return { id: rows[0].id };
  });
}

/**
 * Providers (for their bookings) or admins respond to change requests. Accepting records agreement;
 * any resulting schedule or price change is made as an explicit new booking or cancellation, never
 * by silently editing the confirmed booking.
 */
export async function respondToChangeRequest(db: Db, actor: Actor | null, requestId: string, decision: "accepted" | "declined", response: string) {
  const a = requireActor(actor);
  const text = response.trim();
  if (text.length < 2) throw new UserError("Please include a response for the traveller.");
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; booking_id: string; status: string; requested_by: string }>(
      "select id, booking_id, status, requested_by from itinerary_change_requests where id = $1 for update",
      [requestId],
    );
    const cr = rows[0];
    if (!cr) throw new NotFoundError();
    const items = await loadItems(tx, cr.booking_id);
    const access = bookingAccess(a, { travellerId: cr.requested_by, providerIds: items.map((i) => i.provider_id) });
    if (access !== "provider" && access !== "admin") throw new NotFoundError();
    if (cr.status !== "open") throw new UserError("This request has already been answered.");
    await tx.query("update itinerary_change_requests set status = $2, response = $3, responded_by = $4, responded_at = now() where id = $1", [
      cr.id,
      decision,
      text.slice(0, 4000),
      a.userId,
    ]);
    await audit(tx, { actorId: a.userId, actorRole: primaryRole(a.roles), action: `change_request.${decision}`, entityType: "booking", entityId: cr.booking_id });
    await notify(tx, {
      userId: cr.requested_by,
      type: "change_request.updated",
      title: `Your change request was ${decision}`,
      body: text.slice(0, 300),
      link: `/dashboard/bookings/${cr.booking_id}`,
      dedupeKey: `change_request.updated:${cr.id}`,
    });
  });
}
