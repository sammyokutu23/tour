import { z } from "zod";
import type { Db, Queryable } from "../db/client";
import { requireAdmin, requireStaff, NotFoundError, ROLES, type Actor, type Role } from "@/domain/authz";
import { UserError } from "../errors";
import { audit } from "./audit";
import { postLedger } from "./ledger";
import { eligibleForPayout } from "./providers";
import { revokeAllSessions } from "./accounts";
import { completeRefund, processRefund } from "./bookings";
import { setSetting, type PlatformSettings } from "./settings";
import { notify } from "./notifications";

/**
 * Metric definitions (all from live data):
 *  - Gross booking value: total_minor of bookings that reached confirmed/in_progress/completed (incl. later cancelled after payment).
 *  - Platform revenue: net credit balance of the platform_revenue ledger account.
 *  - Refund volume: sum of succeeded refunds.
 */
export async function adminMetrics(db: Queryable, actor: Actor | null) {
  requireStaff(actor);
  const { rows } = await db.query<{
    users: number;
    active_providers: number;
    pending_verifications: number;
    published_experiences: number;
    pending_listings: number;
    pending_requests: number;
    awaiting_payment: number;
    confirmed: number;
    completed: number;
    gbv_minor: number;
    platform_revenue_minor: number;
    refund_volume_minor: number;
    open_cases: number;
    failed_deliveries: number;
    manual_refunds: number;
  }>(
    `select
       (select count(*)::int from users where status = 'active') as users,
       (select count(*)::int from provider_profiles where status = 'approved') as active_providers,
       (select count(*)::int from provider_profiles where status = 'submitted') as pending_verifications,
       (select count(*)::int from experiences where status = 'published') as published_experiences,
       (select count(*)::int from experiences where status = 'pending_review') as pending_listings,
       (select count(*)::int from bookings where status = 'pending_provider') as pending_requests,
       (select count(*)::int from bookings where status in ('awaiting_payment', 'payment_pending')) as awaiting_payment,
       (select count(*)::int from bookings where status in ('confirmed', 'in_progress')) as confirmed,
       (select count(*)::int from bookings where status = 'completed') as completed,
       (select coalesce(sum(total_minor), 0)::bigint from bookings where confirmed_at is not null) as gbv_minor,
       (select coalesce(-sum(amount_minor), 0)::bigint from ledger_entries where account = 'platform_revenue') as platform_revenue_minor,
       (select coalesce(sum(amount_minor), 0)::bigint from refunds where status = 'succeeded') as refund_volume_minor,
       (select count(*)::int from support_cases where status in ('open', 'in_progress', 'escalated')) as open_cases,
       (select count(*)::int from notification_deliveries where status = 'failed') as failed_deliveries,
       (select count(*)::int from refunds where status in ('manual_required', 'requested', 'failed')) as manual_refunds`,
  );
  const funnel = await db.query<{ name: string; n: number }>(
    "select name, count(*)::int as n from analytics_events where created_at > now() - interval '30 days' group by name order by name",
  );
  return { ...rows[0], funnel: funnel.rows };
}

export async function listUsers(db: Queryable, actor: Actor | null, q?: string) {
  requireAdmin(actor);
  const { rows } = await db.query<{ id: string; email: string; display_name: string; status: string; roles: Role[]; created_at: Date }>(
    `select u.id, u.email, u.display_name, u.status, u.created_at, coalesce(array(select role from user_roles r where r.user_id = u.id order by role), '{}') as roles
       from users u where ($1::text is null or u.email ilike '%' || $1 || '%' or u.display_name ilike '%' || $1 || '%')
      order by u.created_at desc limit 200`,
    [q?.replace(/[%_\\]/g, "") || null],
  );
  return rows;
}

export async function setUserStatus(db: Db, actor: Actor | null, userId: string, status: "active" | "suspended", reason: string) {
  const a = requireAdmin(actor);
  if (reason.trim().length < 3) throw new UserError("A documented reason is required.");
  if (userId === a.userId) throw new UserError("You can't change your own account status.");
  await db.transaction(async (tx) => {
    const { rowCount } = await tx.query("update users set status = $2, status_reason = $3 where id = $1", [userId, status, reason.trim()]);
    if (!rowCount) throw new NotFoundError();
    if (status === "suspended") await revokeAllSessions(tx, userId);
    await audit(tx, { actorId: a.userId, actorRole: "admin", action: `user.${status}`, entityType: "user", entityId: userId, reason });
  });
}

export async function setUserRole(db: Queryable, actor: Actor | null, userId: string, role: Role, grant: boolean, reason: string) {
  const a = requireAdmin(actor);
  if (!ROLES.includes(role)) throw new UserError("Unknown role.");
  if (reason.trim().length < 3) throw new UserError("A documented reason is required.");
  if (userId === a.userId && role === "admin" && !grant) throw new UserError("You can't remove your own admin role.");
  if (grant) {
    await db.query("insert into user_roles (user_id, role, granted_by) values ($1, $2, $3) on conflict do nothing", [userId, role, a.userId]);
  } else {
    await db.query("delete from user_roles where user_id = $1 and role = $2", [userId, role]);
  }
  await audit(db, { actorId: a.userId, actorRole: "admin", action: grant ? "role.granted" : "role.revoked", entityType: "user", entityId: userId, reason, details: { role } });
}

export async function listBookingsAdmin(db: Queryable, actor: Actor | null, f: { status?: string; q?: string } = {}) {
  requireStaff(actor);
  const { rows } = await db.query<{
    id: string;
    reference: string;
    status: string;
    payment_status: string;
    total_minor: number;
    currency: string;
    created_at: Date;
    traveller: string;
    start_date: string;
  }>(
    `select b.id, b.reference, b.status, b.payment_status, b.total_minor, b.currency, b.created_at, u.display_name as traveller, t.start_date
       from bookings b join users u on u.id = b.traveller_id join trips t on t.id = b.trip_id
      where ($1::text is null or b.status = $1) and ($2::text is null or b.reference ilike '%' || $2 || '%')
      order by b.created_at desc limit 200`,
    [f.status || null, f.q?.replace(/[%_\\]/g, "") || null],
  );
  return rows;
}

export async function listPaymentsAdmin(db: Queryable, actor: Actor | null) {
  requireAdmin(actor);
  const [attempts, events] = await Promise.all([
    db.query<{ id: string; provider: string; status: string; amount_minor: number; currency: string; provider_reference: string | null; created_at: Date; reference: string; booking_id: string; failure_reason: string | null }>(
      `select pa.id, pa.provider, pa.status, pa.amount_minor, pa.currency, pa.provider_reference, pa.created_at, b.reference, b.id as booking_id, pa.failure_reason
         from payment_attempts pa join bookings b on b.id = pa.booking_id order by pa.created_at desc limit 200`,
    ),
    db.query<{ id: string; provider: string; event_type: string; signature_valid: boolean; processing_result: string | null; received_at: Date }>(
      "select id, provider, event_type, signature_valid, processing_result, received_at from payment_events order by received_at desc limit 100",
    ),
  ]);
  return { attempts: attempts.rows, events: events.rows };
}

export async function listRefundsAdmin(db: Queryable, actor: Actor | null) {
  requireAdmin(actor);
  const { rows } = await db.query<{ id: string; amount_minor: number; currency: string; status: string; reason: string; created_at: Date; reference: string; booking_id: string; provider: string }>(
    `select r.id, r.amount_minor, r.currency, r.status, r.reason, r.created_at, b.reference, b.id as booking_id, pa.provider
       from refunds r join bookings b on b.id = r.booking_id join payment_attempts pa on pa.id = r.payment_attempt_id
      order by case when r.status in ('manual_required', 'requested', 'failed') then 0 else 1 end, r.created_at desc limit 200`,
  );
  return rows;
}

/** Retries an automatic refund, or records one processed manually by finance (e.g. M-Pesa reversal). */
export async function adminRefundAction(db: Db, actor: Actor | null, refundId: string, action: "retry" | "mark_completed", externalReference: string | null, reason: string) {
  const a = requireAdmin(actor);
  if (reason.trim().length < 3) throw new UserError("A documented reason is required.");
  if (action === "retry") {
    await db.query("update refunds set status = 'requested' where id = $1 and status in ('failed', 'requested')", [refundId]);
    const result = await processRefund(db, refundId);
    await audit(db, { actorId: a.userId, actorRole: "admin", action: "refund.retried", entityType: "refund", entityId: refundId, reason, details: { result } });
    return result;
  }
  if (!externalReference?.trim()) throw new UserError("Enter the external transaction reference for the manual refund.");
  await completeRefund(db, refundId, externalReference.trim(), a.userId);
  await audit(db, { actorId: a.userId, actorRole: "admin", action: "refund.marked_completed", entityType: "refund", entityId: refundId, reason, details: { externalReference } });
  return "succeeded";
}

export async function listPayoutCandidates(db: Queryable, actor: Actor | null) {
  requireAdmin(actor);
  const { rows } = await db.query<{ id: string; display_name: string; kind: string }>(
    "select distinct p.id, p.display_name, p.kind from provider_profiles p join ledger_entries le on le.provider_id = p.id order by p.display_name",
  );
  const result = [];
  for (const p of rows) result.push({ ...p, eligibleMinor: await eligibleForPayout(db, p.id) });
  const { rows: payouts } = await db.query<{ id: string; provider_name: string; amount_minor: number; currency: string; status: string; method: string; external_reference: string | null; created_at: Date; paid_at: Date | null }>(
    `select po.id, p.display_name as provider_name, po.amount_minor, po.currency, po.status, po.method, po.external_reference, po.created_at, po.paid_at
       from payouts po join provider_profiles p on p.id = po.provider_id order by po.created_at desc limit 100`,
  );
  return { candidates: result, payouts };
}

export async function createPayout(db: Db, actor: Actor | null, providerId: string, amountMinor: number, method: string, notes: string | null) {
  const a = requireAdmin(actor);
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new UserError("Enter a positive amount.");
  if (!["mpesa_b2c", "bank_transfer", "other"].includes(method)) throw new UserError("Choose a payout method.");
  return db.transaction(async (tx) => {
    // Lock the provider row so two admins can't over-allocate the same balance.
    await tx.query("select id from provider_profiles where id = $1 for update", [providerId]);
    const eligible = await eligibleForPayout(tx, providerId);
    if (amountMinor > eligible) throw new UserError("Amount exceeds the provider's eligible balance.");
    const { rows } = await tx.query<{ id: string }>(
      "insert into payouts (provider_id, amount_minor, currency, method, notes, created_by) values ($1, $2, 'KES', $3, $4, $5) returning id",
      [providerId, amountMinor, method, notes, a.userId],
    );
    await audit(tx, { actorId: a.userId, actorRole: "admin", action: "payout.created", entityType: "payout", entityId: rows[0].id, details: { providerId, amountMinor, method } });
    return { id: rows[0].id };
  });
}

/** Records that money was sent to the provider outside the platform; posts the ledger entry. */
export async function markPayoutPaid(db: Db, actor: Actor | null, payoutId: string, externalReference: string) {
  const a = requireAdmin(actor);
  if (!externalReference.trim()) throw new UserError("Enter the transfer reference.");
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; provider_id: string; amount_minor: number; currency: string; status: string }>(
      "select id, provider_id, amount_minor, currency, status from payouts where id = $1 for update",
      [payoutId],
    );
    const p = rows[0];
    if (!p) throw new NotFoundError();
    if (p.status !== "pending") throw new UserError(`Payout is already ${p.status}.`);
    await tx.query("update payouts set status = 'paid', external_reference = $2, paid_at = now() where id = $1", [payoutId, externalReference.trim()]);
    await postLedger(tx, {
      type: "payout_sent",
      currency: p.currency,
      payoutId,
      createdBy: a.userId,
      lines: [
        { account: "provider_payable", amountMinor: p.amount_minor, providerId: p.provider_id },
        { account: "cash", amountMinor: -p.amount_minor },
      ],
    });
    await audit(tx, { actorId: a.userId, actorRole: "admin", action: "payout.paid", entityType: "payout", entityId: payoutId, details: { externalReference } });
    const { rows: user } = await tx.query<{ user_id: string }>("select user_id from provider_profiles where id = $1", [p.provider_id]);
    await notify(tx, {
      userId: user[0].user_id,
      type: "provider.status",
      title: "Payout sent",
      body: `A payout has been sent. Reference: ${externalReference.trim()}.`,
      link: "/provider/earnings",
      dedupeKey: `payout.paid:${payoutId}`,
    });
  });
}

export async function cancelPayout(db: Queryable, actor: Actor | null, payoutId: string, reason: string) {
  const a = requireAdmin(actor);
  const { rowCount } = await db.query("update payouts set status = 'cancelled', notes = coalesce(notes || E'\\n', '') || $2 where id = $1 and status = 'pending'", [payoutId, reason]);
  if (!rowCount) throw new UserError("Only pending payouts can be cancelled.");
  await audit(db, { actorId: a.userId, actorRole: "admin", action: "payout.cancelled", entityType: "payout", entityId: payoutId, reason });
}

export async function listCommissionRules(db: Queryable, actor: Actor | null) {
  requireAdmin(actor);
  const { rows } = await db.query<{ id: string; provider_name: string | null; provider_kind: string | null; category_name: string | null; commission_bps: number; active: boolean; note: string | null; created_at: Date }>(
    `select r.id, p.display_name as provider_name, r.provider_kind, c.name as category_name, r.commission_bps, r.active, r.note, r.created_at
       from commission_rules r left join provider_profiles p on p.id = r.provider_id left join experience_categories c on c.id = r.category_id
      order by r.active desc, r.created_at desc`,
  );
  return rows;
}

export const commissionRuleSchema = z.object({
  providerId: z.string().uuid().nullable(),
  providerKind: z.enum(["guide", "operator"]).nullable(),
  categoryId: z.string().uuid().nullable(),
  commissionBps: z.number().int().min(0).max(5000),
  note: z.string().trim().min(3, "Explain why this rule exists").max(500),
});

/** Commission rules are append-only in practice: changes deactivate the old rule and add a new one. */
export async function addCommissionRule(db: Queryable, actor: Actor | null, input: z.infer<typeof commissionRuleSchema>) {
  const a = requireAdmin(actor);
  const v = commissionRuleSchema.parse(input);
  const scopes = [v.providerId, v.providerKind, v.categoryId].filter(Boolean).length;
  if (scopes > 1) throw new UserError("Choose one scope: a provider, a provider type or a category.");
  const { rows } = await db.query<{ id: string }>(
    "insert into commission_rules (provider_id, provider_kind, category_id, commission_bps, note, created_by) values ($1,$2,$3,$4,$5,$6) returning id",
    [v.providerId, v.providerKind, v.categoryId, v.commissionBps, v.note, a.userId],
  );
  await audit(db, { actorId: a.userId, actorRole: "admin", action: "commission_rule.created", entityType: "commission_rule", entityId: rows[0].id, details: v });
}

export async function deactivateCommissionRule(db: Queryable, actor: Actor | null, ruleId: string) {
  const a = requireAdmin(actor);
  await db.query("update commission_rules set active = false where id = $1", [ruleId]);
  await audit(db, { actorId: a.userId, actorRole: "admin", action: "commission_rule.deactivated", entityType: "commission_rule", entityId: ruleId });
}

export async function updateSetting(db: Queryable, actor: Actor | null, key: keyof PlatformSettings, value: unknown, reason: string) {
  const a = requireAdmin(actor);
  if (reason.trim().length < 3) throw new UserError("A documented reason is required.");
  await setSetting(db, key, value, a.userId);
  await audit(db, { actorId: a.userId, actorRole: "admin", action: "setting.updated", entityType: "platform_setting", entityId: key, reason, details: { value } });
}

export const destinationSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{2,80}$/, "Use lowercase letters, numbers and hyphens"),
  name: z.string().trim().min(2).max(120),
  region: z.string().trim().min(2).max(80),
  county: z.string().trim().max(80).nullable(),
  summary: z.string().trim().min(10).max(300),
  description: z.string().trim().min(40).max(8000),
  latitude: z.number().min(-5).max(5.5),
  longitude: z.number().min(33.5).max(42),
  travelStyles: z.array(z.string().trim().max(40)).max(10),
  bestTimeToVisit: z.string().trim().max(500).nullable(),
  travelInfo: z.string().trim().max(4000).nullable(),
  artVariant: z.enum(["savanna", "coast", "mountain", "lake", "city", "desert", "forest"]),
  isPublished: z.boolean(),
});

export async function saveDestination(db: Queryable, actor: Actor | null, id: string | null, input: z.infer<typeof destinationSchema>) {
  const a = requireAdmin(actor);
  const v = destinationSchema.parse(input);
  const values = [v.slug, v.name, v.region, v.county, v.summary, v.description, v.latitude, v.longitude, v.travelStyles, v.bestTimeToVisit, v.travelInfo, v.artVariant, v.isPublished];
  try {
    if (id) {
      const { rowCount } = await db.query(
        `update destinations set slug=$2, name=$3, region=$4, county=$5, summary=$6, description=$7, latitude=$8, longitude=$9, travel_styles=$10,
                best_time_to_visit=$11, travel_info=$12, art_variant=$13, is_published=$14 where id = $1`,
        [id, ...values],
      );
      if (!rowCount) throw new NotFoundError();
    } else {
      const { rows } = await db.query<{ id: string }>(
        `insert into destinations (slug, name, region, county, summary, description, latitude, longitude, travel_styles, best_time_to_visit, travel_info, art_variant, is_published)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
        values,
      );
      id = rows[0].id;
    }
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new UserError("That slug is already used.");
    throw err;
  }
  await audit(db, { actorId: a.userId, actorRole: "admin", action: "destination.saved", entityType: "destination", entityId: id });
  return { id };
}

export async function getDestinationAdmin(db: Queryable, actor: Actor | null, id: string) {
  requireAdmin(actor);
  if (!z.string().uuid().safeParse(id).success) throw new NotFoundError();
  const { rows } = await db.query<Record<string, unknown>>("select * from destinations where id = $1", [id]);
  if (!rows[0]) throw new NotFoundError();
  return rows[0];
}

export async function listDestinationsAdmin(db: Queryable, actor: Actor | null) {
  requireAdmin(actor);
  const { rows } = await db.query<{ id: string; slug: string; name: string; region: string; is_published: boolean; experiences: number }>(
    "select d.id, d.slug, d.name, d.region, d.is_published, (select count(*)::int from experiences e where e.destination_id = d.id) as experiences from destinations d order by d.sort_order, d.name",
  );
  return rows;
}

export async function saveCategory(db: Queryable, actor: Actor | null, input: { slug: string; name: string; description: string | null }) {
  const a = requireAdmin(actor);
  const v = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,60}$/), name: z.string().trim().min(2).max(80), description: z.string().trim().max(500).nullable() }).parse(input);
  await db.query(
    "insert into experience_categories (slug, name, description) values ($1, $2, $3) on conflict (slug) do update set name = excluded.name, description = excluded.description",
    [v.slug, v.name, v.description],
  );
  await audit(db, { actorId: a.userId, actorRole: "admin", action: "category.saved", entityType: "category", entityId: v.slug });
}

export async function listListingsForModeration(db: Queryable, actor: Actor | null) {
  requireAdmin(actor);
  const { rows } = await db.query<{ id: string; slug: string; title: string; status: string; provider_name: string; destination_name: string; updated_at: Date; is_demo: boolean; moderation_notes: string | null }>(
    `select e.id, e.slug, e.title, e.status, p.display_name as provider_name, d.name as destination_name, e.updated_at, e.is_demo, e.moderation_notes
       from experiences e join provider_profiles p on p.id = e.provider_id join destinations d on d.id = e.destination_id
      where e.status <> 'archived'
      order by case e.status when 'pending_review' then 0 else 1 end, e.updated_at desc limit 300`,
  );
  return rows;
}

export async function listReviewsAdmin(db: Queryable, actor: Actor | null) {
  requireAdmin(actor);
  const { rows } = await db.query<{ id: string; rating: number; title: string | null; body: string; status: string; provider_name: string; reviewer: string; created_at: Date; reported: number }>(
    `select r.id, r.rating, r.title, r.body, r.status, p.display_name as provider_name, u.display_name as reviewer, r.created_at,
            (select count(*)::int from support_cases s where s.review_id = r.id) as reported
       from reviews r join provider_profiles p on p.id = r.provider_id join users u on u.id = r.reviewer_id
      order by reported desc, r.created_at desc limit 200`,
  );
  return rows;
}

export async function listAuditLogs(db: Queryable, actor: Actor | null, f: { entityType?: string; action?: string } = {}) {
  requireAdmin(actor);
  const { rows } = await db.query<{ id: number; action: string; entity_type: string; entity_id: string | null; reason: string | null; details: unknown; created_at: Date; actor_name: string | null; actor_role: string }>(
    `select l.id, l.action, l.entity_type, l.entity_id, l.reason, l.details, l.created_at, u.display_name as actor_name, l.actor_role
       from audit_logs l left join users u on u.id = l.actor_id
      where ($1::text is null or l.entity_type = $1) and ($2::text is null or l.action ilike $2 || '%')
      order by l.id desc limit 300`,
    [f.entityType || null, f.action?.replace(/[%_\\]/g, "") || null],
  );
  return rows;
}

export async function listDeliveries(db: Queryable, actor: Actor | null) {
  requireAdmin(actor);
  const { rows } = await db.query<{ id: string; channel: string; status: string; attempts: number; last_error: string | null; created_at: Date; sent_at: Date | null; title: string; type: string }>(
    `select d.id, d.channel, d.status, d.attempts, d.last_error, d.created_at, d.sent_at, n.title, n.type
       from notification_deliveries d join notifications n on n.id = d.notification_id
      order by case d.status when 'failed' then 0 when 'pending' then 1 else 2 end, d.created_at desc limit 200`,
  );
  return rows;
}

export async function retryDelivery(db: Queryable, actor: Actor | null, deliveryId: string) {
  const a = requireAdmin(actor);
  await db.query("update notification_deliveries set status = 'pending', next_attempt_at = now(), attempts = 0 where id = $1 and status = 'failed'", [deliveryId]);
  await audit(db, { actorId: a.userId, actorRole: "admin", action: "delivery.retried", entityType: "notification_delivery", entityId: deliveryId });
}

export async function getBookingLedger(db: Queryable, actor: Actor | null, bookingId: string) {
  requireAdmin(actor);
  const { rows } = await db.query<{ id: number; txn_id: string; entry_type: string; account: string; amount_minor: number; currency: string; memo: string | null; created_at: Date; provider_name: string | null }>(
    `select le.id, le.txn_id, le.entry_type, le.account, le.amount_minor, le.currency, le.memo, le.created_at, p.display_name as provider_name
       from ledger_entries le left join provider_profiles p on p.id = le.provider_id where le.booking_id = $1 order by le.id`,
    [bookingId],
  );
  return rows;
}
