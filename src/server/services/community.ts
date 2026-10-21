import { z } from "zod";
import type { Db, Queryable } from "../db/client";
import { requireActor, requireProvider, requireStaff, isStaff, hasRole, NotFoundError, type Actor } from "@/domain/authz";
import { UserError } from "../errors";
import { notify } from "./notifications";
import { audit, primaryRole } from "./audit";
import { referenceCode } from "../auth/tokens";
import { track } from "./analytics";

// ───────────────────────────── reviews ─────────────────────────────

export const reviewSchema = z.object({
  bookingItemId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(140).nullable(),
  body: z.string().trim().min(10, "Write at least a sentence about your experience").max(4000),
});

/** Only the traveller on a completed booking can review each booked item, once. */
export async function submitReview(db: Queryable, actor: Actor | null, input: z.infer<typeof reviewSchema>) {
  const a = requireActor(actor);
  const v = reviewSchema.parse(input);
  const { rows } = await db.query<{ booking_id: string; provider_id: string; experience_id: string | null; status: string; traveller_id: string; booking_status: string; provider_user: string; title: string }>(
    `select bi.booking_id, bi.provider_id, bi.experience_id, bi.status, b.traveller_id, b.status as booking_status, p.user_id as provider_user, bi.title
       from booking_items bi join bookings b on b.id = bi.booking_id join provider_profiles p on p.id = bi.provider_id
      where bi.id = $1`,
    [v.bookingItemId],
  );
  const item = rows[0];
  if (!item || item.traveller_id !== a.userId) throw new NotFoundError();
  if (item.status !== "completed" || item.booking_status !== "completed") throw new UserError("You can review this once the experience has been completed.");
  try {
    await db.query(
      `insert into reviews (booking_item_id, booking_id, reviewer_id, provider_id, experience_id, rating, title, body)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [v.bookingItemId, item.booking_id, a.userId, item.provider_id, item.experience_id, v.rating, v.title, v.body],
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new UserError("You've already reviewed this.");
    throw err;
  }
  await notify(db, {
    userId: item.provider_user,
    type: "review.received",
    title: `New ${v.rating}★ review`,
    body: `A traveller reviewed ${item.title}.`,
    link: "/provider/reviews",
    dedupeKey: `review.received:${v.bookingItemId}`,
  });
  await track(db, "review_submitted", { rating: v.rating }, a.userId);
}

export async function respondToReview(db: Queryable, actor: Actor | null, reviewId: string, response: string) {
  const p = requireProvider(actor);
  const text = response.trim();
  if (text.length < 2 || text.length > 2000) throw new UserError("Responses must be between 2 and 2000 characters.");
  const { rowCount } = await db.query(
    "update reviews set provider_response = $3, provider_responded_at = now() where id = $1 and provider_id = $2 and provider_response is null",
    [reviewId, p.providerId, text],
  );
  if (!rowCount) throw new UserError("This review can't be responded to (it may already have a response).");
}

export async function listProviderReviews(db: Queryable, actor: Actor | null) {
  const p = requireProvider(actor);
  const { rows } = await db.query<{ id: string; rating: number; title: string | null; body: string; status: string; provider_response: string | null; created_at: Date; item_title: string; reviewer: string }>(
    `select r.id, r.rating, r.title, r.body, r.status, r.provider_response, r.created_at, bi.title as item_title, split_part(u.display_name, ' ', 1) as reviewer
       from reviews r join booking_items bi on bi.id = r.booking_item_id join users u on u.id = r.reviewer_id
      where r.provider_id = $1 order by r.created_at desc`,
    [p.providerId],
  );
  return rows;
}

export async function moderateReview(db: Queryable, actor: Actor | null, reviewId: string, status: "published" | "hidden", reason: string) {
  const a = requireStaff(actor);
  if (!hasRole(a, "admin")) throw new NotFoundError();
  if (reason.trim().length < 3) throw new UserError("A documented reason is required.");
  const { rowCount } = await db.query("update reviews set status = $2, moderation_reason = $3 where id = $1", [reviewId, status, reason.trim()]);
  if (!rowCount) throw new NotFoundError();
  await audit(db, { actorId: a.userId, actorRole: "admin", action: `review.${status}`, entityType: "review", entityId: reviewId, reason });
}

// ───────────────────────────── messaging ─────────────────────────────

async function assertParticipant(db: Queryable, actor: Actor, conversationId: string) {
  if (!z.string().uuid().safeParse(conversationId).success) throw new NotFoundError();
  const { rowCount } = await db.query("select 1 from conversation_participants where conversation_id = $1 and user_id = $2", [conversationId, actor.userId]);
  if (!rowCount) throw new NotFoundError("Conversation not found.");
}

export async function listConversations(db: Queryable, actor: Actor | null) {
  const a = requireActor(actor);
  const { rows } = await db.query<{ id: string; subject: string; booking_id: string | null; last_body: string | null; last_at: Date | null; unread: number }>(
    `select c.id, c.subject, c.booking_id,
            (select m.body from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as last_body,
            (select max(m.created_at) from messages m where m.conversation_id = c.id) as last_at,
            (select count(*)::int from messages m where m.conversation_id = c.id and m.sender_id <> $1
               and (cp.last_read_at is null or m.created_at > cp.last_read_at)) as unread
       from conversations c join conversation_participants cp on cp.conversation_id = c.id and cp.user_id = $1
      order by last_at desc nulls last, c.created_at desc`,
    [a.userId],
  );
  return rows;
}

export async function getConversation(db: Queryable, actor: Actor | null, conversationId: string) {
  const a = requireActor(actor);
  await assertParticipant(db, a, conversationId);
  const [conv, msgs, participants] = await Promise.all([
    db.query<{ id: string; subject: string; booking_id: string | null }>("select id, subject, booking_id from conversations where id = $1", [conversationId]),
    db.query<{ id: string; body: string; created_at: Date; sender_id: string; sender_name: string; role: string }>(
      `select m.id, m.body, m.created_at, m.sender_id, coalesce(p.display_name, split_part(u.display_name, ' ', 1)) as sender_name, cp.role
         from messages m join users u on u.id = m.sender_id
         left join provider_profiles p on p.user_id = u.id
         left join conversation_participants cp on cp.conversation_id = m.conversation_id and cp.user_id = m.sender_id
        where m.conversation_id = $1 order by m.created_at`,
      [conversationId],
    ),
    db.query<{ user_id: string; role: string; name: string }>(
      `select cp.user_id, cp.role, coalesce(p.display_name, split_part(u.display_name, ' ', 1)) as name
         from conversation_participants cp join users u on u.id = cp.user_id left join provider_profiles p on p.user_id = u.id
        where cp.conversation_id = $1`,
      [conversationId],
    ),
  ]);
  await db.query("update conversation_participants set last_read_at = now() where conversation_id = $1 and user_id = $2", [conversationId, a.userId]);
  return { ...conv.rows[0], messages: msgs.rows, participants: participants.rows, viewerId: a.userId };
}

export async function sendMessage(db: Queryable, actor: Actor | null, conversationId: string, body: string) {
  const a = requireActor(actor);
  const text = body.trim();
  if (!text) throw new UserError("Write a message first.");
  if (text.length > 4000) throw new UserError("Messages can be up to 4000 characters.");
  await assertParticipant(db, a, conversationId);
  const recent = await db.query<{ n: number }>(
    "select count(*)::int as n from messages where sender_id = $1 and created_at > now() - interval '1 minute'",
    [a.userId],
  );
  if (recent.rows[0].n >= 20) throw new UserError("You're sending messages too quickly. Please wait a moment.");
  const { rows } = await db.query<{ id: string }>("insert into messages (conversation_id, sender_id, body) values ($1, $2, $3) returning id", [conversationId, a.userId, text]);
  const { rows: others } = await db.query<{ user_id: string; role: string; booking_id: string | null; subject: string }>(
    `select cp.user_id, cp.role, c.booking_id, c.subject from conversation_participants cp join conversations c on c.id = cp.conversation_id
      where cp.conversation_id = $1 and cp.user_id <> $2`,
    [conversationId, a.userId],
  );
  for (const o of others) {
    await notify(db, {
      userId: o.user_id,
      type: "message.received",
      title: `New message: ${o.subject}`,
      body: text.slice(0, 200),
      link: o.role === "provider" ? `/provider/messages/${conversationId}` : `/dashboard/messages/${conversationId}`,
      dedupeKey: `message:${rows[0].id}:${o.user_id}`,
    });
  }
}

// ───────────────────────────── favourites ─────────────────────────────

export async function toggleFavourite(db: Queryable, actor: Actor | null, targetType: "experience" | "guide" | "destination", targetId: string) {
  const a = requireActor(actor);
  if (!z.string().uuid().safeParse(targetId).success) throw new NotFoundError();
  const table = { experience: "experiences", guide: "provider_profiles", destination: "destinations" }[targetType];
  const { rowCount: exists } = await db.query(`select 1 from ${table} where id = $1`, [targetId]);
  if (!exists) throw new NotFoundError();
  const { rowCount } = await db.query("delete from favourites where user_id = $1 and target_type = $2 and target_id = $3", [a.userId, targetType, targetId]);
  if (rowCount) return { saved: false };
  await db.query("insert into favourites (user_id, target_type, target_id) values ($1, $2, $3) on conflict do nothing", [a.userId, targetType, targetId]);
  return { saved: true };
}

export async function listFavourites(db: Queryable, actor: Actor | null) {
  const a = requireActor(actor);
  const { rows } = await db.query<{ target_type: string; target_id: string; name: string; slug: string; subtitle: string | null }>(
    `select f.target_type, f.target_id,
            coalesce(e.title, p.display_name, d.name) as name,
            coalesce(e.slug, p.slug, d.slug) as slug,
            coalesce(e.summary, p.headline, d.summary) as subtitle
       from favourites f
       left join experiences e on f.target_type = 'experience' and e.id = f.target_id
       left join provider_profiles p on f.target_type = 'guide' and p.id = f.target_id
       left join destinations d on f.target_type = 'destination' and d.id = f.target_id
      where f.user_id = $1 order by f.created_at desc`,
    [a.userId],
  );
  return rows.filter((r) => r.name);
}

export async function favouriteIds(db: Queryable, actor: Actor | null): Promise<Set<string>> {
  if (!actor) return new Set();
  const { rows } = await db.query<{ target_id: string }>("select target_id from favourites where user_id = $1", [actor.userId]);
  return new Set(rows.map((r) => r.target_id));
}

// ───────────────────────────── support ─────────────────────────────

export const supportCaseSchema = z.object({
  kind: z.enum(["support", "dispute", "safety", "report"]),
  subject: z.string().trim().min(3, "Add a short subject").max(200),
  description: z.string().trim().min(10, "Tell us a little more").max(8000),
  bookingId: z.string().uuid().nullable(),
  reviewId: z.string().uuid().nullable(),
  contactEmail: z.string().trim().email().max(320).nullable(),
});

export async function openSupportCase(db: Queryable, actor: Actor | null, input: z.infer<typeof supportCaseSchema>) {
  const v = supportCaseSchema.parse(input);
  if (!actor && !v.contactEmail) throw new UserError("Enter an email address so we can reply.");
  if (v.bookingId) {
    const a = requireActor(actor);
    const { rows } = await db.query<{ traveller_id: string; provider_ids: string[] }>(
      "select b.traveller_id, array(select provider_id from booking_items where booking_id = b.id) as provider_ids from bookings b where b.id = $1",
      [v.bookingId],
    );
    const b = rows[0];
    if (!b || (b.traveller_id !== a.userId && !(a.providerId && b.provider_ids.includes(a.providerId)))) throw new NotFoundError("Booking not found.");
  }
  const priority = v.kind === "safety" ? "urgent" : v.kind === "dispute" ? "high" : "normal";
  const reference = referenceCode("CASE");
  const { rows } = await db.query<{ id: string }>(
    `insert into support_cases (reference, kind, priority, subject, description, opened_by, contact_email, booking_id, review_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [reference, v.kind, priority, v.subject, v.description, actor?.userId ?? null, v.contactEmail, v.bookingId, v.reviewId],
  );
  return { id: rows[0].id, reference };
}

export async function listOwnSupportCases(db: Queryable, actor: Actor | null) {
  const a = requireActor(actor);
  const { rows } = await db.query<{ id: string; reference: string; kind: string; status: string; subject: string; created_at: Date; resolution: string | null }>(
    "select id, reference, kind, status, subject, created_at, resolution from support_cases where opened_by = $1 order by created_at desc",
    [a.userId],
  );
  return rows;
}

export async function listSupportQueue(db: Queryable, actor: Actor | null, status: "open" | "all" = "open") {
  requireStaff(actor);
  const { rows } = await db.query<{
    id: string;
    reference: string;
    kind: string;
    status: string;
    priority: string;
    subject: string;
    created_at: Date;
    booking_reference: string | null;
    assigned_name: string | null;
  }>(
    `select s.id, s.reference, s.kind, s.status, s.priority, s.subject, s.created_at, b.reference as booking_reference, u.display_name as assigned_name
       from support_cases s left join bookings b on b.id = s.booking_id left join users u on u.id = s.assigned_to
      where ($1 = 'all' or s.status in ('open', 'in_progress', 'escalated'))
      order by case s.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, s.created_at`,
    [status],
  );
  return rows;
}

export async function getSupportCase(db: Queryable, actor: Actor | null, caseId: string) {
  const a = requireActor(actor);
  if (!z.string().uuid().safeParse(caseId).success) throw new NotFoundError();
  const { rows } = await db.query<{
    id: string;
    reference: string;
    kind: string;
    status: string;
    priority: string;
    subject: string;
    description: string;
    opened_by: string | null;
    contact_email: string | null;
    booking_id: string | null;
    booking_reference: string | null;
    review_id: string | null;
    resolution: string | null;
    created_at: Date;
    opener_name: string | null;
  }>(
    `select s.*, b.reference as booking_reference, u.display_name as opener_name
       from support_cases s left join bookings b on b.id = s.booking_id left join users u on u.id = s.opened_by where s.id = $1`,
    [caseId],
  );
  const c = rows[0];
  if (!c || (!isStaff(a) && c.opened_by !== a.userId)) throw new NotFoundError();
  const { rows: events } = await db.query<{ action: string; note: string | null; created_at: Date; actor: string | null }>(
    `select e.action, e.note, e.created_at, u.display_name as actor from support_case_events e left join users u on u.id = e.actor_id
      where e.case_id = $1 order by e.created_at`,
    [caseId],
  );
  return { ...c, contact_email: isStaff(a) ? c.contact_email : null, events: isStaff(a) ? events : events.filter((e) => e.action === "reply") };
}

export async function updateSupportCase(
  db: Queryable,
  actor: Actor | null,
  caseId: string,
  input: { status: "open" | "in_progress" | "escalated" | "resolved" | "closed"; note: string; assignToSelf?: boolean; reply?: boolean },
) {
  const a = requireStaff(actor);
  if (input.note.trim().length < 2) throw new UserError("Record a note for this action.");
  const { rows } = await db.query<{ status: string; opened_by: string | null; reference: string; kind: string }>(
    "select status, opened_by, reference, kind from support_cases where id = $1",
    [caseId],
  );
  const c = rows[0];
  if (!c) throw new NotFoundError();
  // Support agents can escalate but only administrators close disputes.
  if (c.kind === "dispute" && ["resolved", "closed"].includes(input.status) && !hasRole(a, "admin")) {
    throw new UserError("Disputes must be resolved by an administrator. Escalate instead.");
  }
  await db.query(
    `update support_cases set status = $2, assigned_to = case when $3 then $4::uuid else assigned_to end,
            resolution = case when $2 in ('resolved', 'closed') then $5 else resolution end where id = $1`,
    [caseId, input.status, !!input.assignToSelf, a.userId, input.note.trim()],
  );
  await db.query("insert into support_case_events (case_id, actor_id, action, note) values ($1, $2, $3, $4)", [
    caseId,
    a.userId,
    input.reply ? "reply" : `status:${input.status}`,
    input.note.trim(),
  ]);
  await audit(db, { actorId: a.userId, actorRole: primaryRole(a.roles), action: "support_case.updated", entityType: "support_case", entityId: caseId, details: { status: input.status } });
  if (c.opened_by && input.reply) {
    await notify(db, {
      userId: c.opened_by,
      type: "change_request.updated",
      title: `Update on ${c.reference}`,
      body: input.note.trim().slice(0, 300),
      link: `/dashboard/support/${caseId}`,
      dedupeKey: `support:${caseId}:${Date.now()}`,
    });
  }
}

export async function listNotifications(db: Queryable, actor: Actor | null, limit = 50) {
  const a = requireActor(actor);
  const { rows } = await db.query<{ id: string; type: string; title: string; body: string; link: string | null; read_at: Date | null; created_at: Date }>(
    "select id, type, title, body, link, read_at, created_at from notifications where user_id = $1 order by created_at desc limit $2",
    [a.userId, limit],
  );
  return rows;
}

export async function unreadNotificationCount(db: Queryable, actor: Actor | null): Promise<number> {
  if (!actor) return 0;
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from notifications where user_id = $1 and read_at is null", [actor.userId]);
  return rows[0].n;
}

export async function markNotificationsRead(db: Queryable, actor: Actor | null, ids?: string[]) {
  const a = requireActor(actor);
  if (ids?.length) {
    await db.query("update notifications set read_at = now() where user_id = $1 and id = any($2::uuid[]) and read_at is null", [a.userId, ids]);
  } else {
    await db.query("update notifications set read_at = now() where user_id = $1 and read_at is null", [a.userId]);
  }
}

export async function getTravellerProfile(db: Queryable, actor: Actor | null) {
  const a = requireActor(actor);
  const { rows } = await db.query<{
    display_name: string;
    email: string;
    phone: string | null;
    home_country: string | null;
    languages: string[];
    dietary_requirements: string | null;
    accessibility_requirements: string | null;
    notify_email: boolean;
    marketing_consent: boolean;
    analytics_consent: boolean;
  }>(
    `select u.display_name, u.email, u.phone, tp.home_country, coalesce(tp.languages, '{}') as languages, tp.dietary_requirements,
            tp.accessibility_requirements, coalesce(tp.notify_email, true) as notify_email, coalesce(tp.marketing_consent, false) as marketing_consent,
            coalesce(tp.analytics_consent, false) as analytics_consent
       from users u left join traveller_profiles tp on tp.user_id = u.id where u.id = $1`,
    [a.userId],
  );
  return rows[0];
}

export const travellerProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).nullable(),
  homeCountry: z.string().trim().max(80).nullable(),
  languages: z.array(z.string().trim().max(40)).max(10),
  dietaryRequirements: z.string().trim().max(1000).nullable(),
  accessibilityRequirements: z.string().trim().max(1000).nullable(),
  notifyEmail: z.boolean(),
  marketingConsent: z.boolean(),
  analyticsConsent: z.boolean(),
});

export async function updateTravellerProfile(db: Db, actor: Actor | null, input: z.infer<typeof travellerProfileSchema>) {
  const a = requireActor(actor);
  const v = travellerProfileSchema.parse(input);
  await db.transaction(async (tx) => {
    await tx.query("update users set display_name = $2, phone = $3 where id = $1", [a.userId, v.displayName, v.phone]);
    await tx.query(
      `insert into traveller_profiles (user_id, home_country, languages, dietary_requirements, accessibility_requirements, notify_email, marketing_consent, analytics_consent)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (user_id) do update set home_country = excluded.home_country, languages = excluded.languages, dietary_requirements = excluded.dietary_requirements,
         accessibility_requirements = excluded.accessibility_requirements, notify_email = excluded.notify_email,
         marketing_consent = excluded.marketing_consent, analytics_consent = excluded.analytics_consent`,
      [a.userId, v.homeCountry, v.languages, v.dietaryRequirements, v.accessibilityRequirements, v.notifyEmail, v.marketingConsent, v.analyticsConsent],
    );
    if (!v.analyticsConsent) {
      // Withdrawing consent unlinks previously recorded events from the account.
      await tx.query("update analytics_events set user_id = null where user_id = $1", [a.userId]);
    }
  });
}

/** Exports a copy of the traveller's personal data (data-subject access). */
export async function exportPersonalData(db: Queryable, actor: Actor | null) {
  const a = requireActor(actor);
  const [profile, trips, bookings, reviews, messages] = await Promise.all([
    getTravellerProfile(db, a),
    db.query("select id, title, status, start_date, end_date, adults, children, interests, created_at from trips where owner_id = $1", [a.userId]),
    db.query("select reference, status, payment_status, total_minor, currency, created_at from bookings where traveller_id = $1", [a.userId]),
    db.query("select rating, title, body, created_at from reviews where reviewer_id = $1", [a.userId]),
    db.query("select body, created_at from messages where sender_id = $1", [a.userId]),
  ]);
  return { exportedAt: new Date().toISOString(), profile, trips: trips.rows, bookings: bookings.rows, reviews: reviews.rows, messages: messages.rows };
}

export const hasStaffAccess = isStaff;

/**
 * Opens (or reuses) a pre-booking enquiry conversation between a traveller and a provider, then
 * posts the first message. Contact details are never exchanged automatically.
 */
export async function startEnquiry(db: Db, actor: Actor | null, providerId: string, body: string): Promise<{ conversationId: string }> {
  const a = requireActor(actor);
  if (!z.string().uuid().safeParse(providerId).success) throw new NotFoundError();
  const { rows } = await db.query<{ user_id: string; display_name: string; status: string }>(
    "select user_id, display_name, status from provider_profiles where id = $1",
    [providerId],
  );
  const provider = rows[0];
  if (!provider || provider.status !== "approved") throw new NotFoundError();
  if (provider.user_id === a.userId) throw new UserError("You can't message yourself.");
  const { rowCount: blocked } = await db.query(
    "select 1 from user_blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1)",
    [a.userId, provider.user_id],
  );
  if (blocked) throw new UserError("You can't message this account.");
  const conversationId = await db.transaction(async (tx) => {
    const existing = await tx.query<{ id: string }>(
      `select c.id from conversations c
         join conversation_participants a on a.conversation_id = c.id and a.user_id = $1
         join conversation_participants b on b.conversation_id = c.id and b.user_id = $2
        where c.booking_id is null limit 1`,
      [a.userId, provider.user_id],
    );
    if (existing.rows[0]) return existing.rows[0].id;
    const { rows: created } = await tx.query<{ id: string }>("insert into conversations (subject) values ($1) returning id", [`Enquiry with ${provider.display_name}`]);
    await tx.query("insert into conversation_participants (conversation_id, user_id, role) values ($1, $2, 'traveller'), ($1, $3, 'provider')", [
      created[0].id,
      a.userId,
      provider.user_id,
    ]);
    return created[0].id;
  });
  await sendMessage(db, a, conversationId, body);
  return { conversationId };
}
