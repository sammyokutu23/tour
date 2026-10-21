import { z } from "zod";
import type { Db, Queryable } from "../db/client";
import { requireActor, isAdmin, isStaff, NotFoundError, ForbiddenError, type Actor } from "@/domain/authz";
import {
  groupMachine,
  matchGroup,
  memberMachine,
  proposalMachine,
  votingOutcome,
  type ApprovalPolicy,
  type GroupStatus,
  type MatchResult,
  type MatchSeeker,
  type MemberStatus,
  type ProposalStatus,
} from "@/domain/travel-groups";
import { addDays, toZoned } from "@/lib/time";
import { likeEscape, pageOffset, SqlParams } from "../db/sql";
import { UserError, isPgError } from "../errors";
import { hashToken, newToken } from "../auth/tokens";
import { notify } from "./notifications";
import { audit } from "./audit";
import {
  createTrip,
  ensureDays,
  insertExperienceItem,
  insertGuideItem,
  insertNoteItem,
  loadTripGraph,
  validateTripGraph,
  type TripRow,
} from "./trips";
import type { ArtVariant } from "./catalogue";

// ───────────────────────────── shared helpers ─────────────────────────────

const today = () => toZoned(new Date(), "Africa/Nairobi").date;
const uuid = z.string().uuid();

export class GroupRateLimitError extends UserError {}

/** Simple sliding-window limiter on the shared auth_attempts table. */
export async function rateLimit(db: Queryable, key: string, max: number, windowMinutes: number, message: string) {
  const { rows } = await db.query<{ n: number }>(
    "select count(*)::int as n from auth_attempts where key = $1 and created_at > now() - make_interval(mins => $2)",
    [key, windowMinutes],
  );
  if (rows[0].n >= max) throw new GroupRateLimitError(message);
  await db.query("insert into auth_attempts (key, success) values ($1, true)", [key]);
}

export async function isBlockedBetween(db: Queryable, a: string, b: string): Promise<boolean> {
  const { rowCount } = await db.query(
    "select 1 from user_blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1)",
    [a, b],
  );
  return rowCount > 0;
}

/** Social features are limited to adults who have accepted the community guidelines (self-attested). */
async function requireSocialEligibility(db: Queryable, userId: string) {
  const { rows } = await db.query<{ adult_confirmed_at: Date | null; guidelines_accepted_at: Date | null }>(
    "select adult_confirmed_at, guidelines_accepted_at from travel_profiles where user_id = $1",
    [userId],
  );
  if (!rows[0]?.adult_confirmed_at || !rows[0]?.guidelines_accepted_at) {
    throw new UserError("Before joining or creating groups, confirm you're 18 or over and accept the community guidelines in your travel profile.");
  }
}

interface GroupRow {
  id: string;
  organizer_user_id: string;
  name: string;
  slug: string;
  description: string;
  destination_id: string;
  start_date: string;
  end_date: string;
  max_members: number;
  language: string;
  visibility: "public" | "approval" | "private";
  status: GroupStatus;
  currency: string;
  min_budget_minor: number | null;
  max_budget_minor: number | null;
  budget_includes: string[];
  expense_style: "individual" | "shared" | "mixed";
  travel_pace: "relaxed" | "balanced" | "adventurous";
  activity_level: "easy" | "moderate" | "challenging";
  shared_transport: "none" | "optional" | "planned";
  accommodation: "own" | "optional_shared";
  arrival_notes: string | null;
  communication_notes: string | null;
  cancellation_notes: string | null;
  booking_deadline: string | null;
  approval_policy: ApprovalPolicy;
  cover_art: ArtVariant;
  cover_storage_key: string | null;
  trip_id: string | null;
  is_demo: boolean;
  status_reason: string | null;
  published_at: Date | null;
  created_at: Date;
}

async function lockGroup(db: Queryable, groupId: string): Promise<GroupRow> {
  if (!uuid.safeParse(groupId).success) throw new NotFoundError("Group not found.");
  const { rows } = await db.query<GroupRow>("select * from travel_groups where id = $1 for update", [groupId]);
  if (!rows[0]) throw new NotFoundError("Group not found.");
  return rows[0];
}

async function loadGroup(db: Queryable, groupId: string): Promise<GroupRow> {
  if (!uuid.safeParse(groupId).success) throw new NotFoundError("Group not found.");
  const { rows } = await db.query<GroupRow>("select * from travel_groups where id = $1", [groupId]);
  if (!rows[0]) throw new NotFoundError("Group not found.");
  return rows[0];
}

interface MemberRow {
  id: string;
  group_id: string;
  user_id: string;
  role: "organizer" | "co_organizer" | "member";
  status: MemberStatus;
}

async function membership(db: Queryable, groupId: string, userId: string): Promise<MemberRow | null> {
  const { rows } = await db.query<MemberRow>("select id, group_id, user_id, role, status from travel_group_members where group_id = $1 and user_id = $2", [groupId, userId]);
  return rows[0] ?? null;
}

async function requireActiveMember(db: Queryable, actor: Actor | null, groupId: string): Promise<{ actor: Actor; member: MemberRow }> {
  const a = requireActor(actor);
  const m = await membership(db, groupId, a.userId);
  if (!m || m.status !== "active") throw new NotFoundError("Group not found.");
  return { actor: a, member: m };
}

async function requireOrganizer(db: Queryable, actor: Actor | null, groupId: string, opts: { ownerOnly?: boolean } = {}) {
  const { actor: a, member } = await requireActiveMember(db, actor, groupId);
  const ok = opts.ownerOnly ? member.role === "organizer" : member.role === "organizer" || member.role === "co_organizer";
  if (!ok) throw new ForbiddenError("Only the group's organizers can do that.");
  return { actor: a, member };
}

async function activeCount(db: Queryable, groupId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from travel_group_members where group_id = $1 and status = 'active'", [groupId]);
  return rows[0].n;
}

async function organizerIds(db: Queryable, groupId: string): Promise<string[]> {
  const { rows } = await db.query<{ user_id: string }>(
    "select user_id from travel_group_members where group_id = $1 and status = 'active' and role in ('organizer', 'co_organizer')",
    [groupId],
  );
  return rows.map((r) => r.user_id);
}

async function activeMemberIds(db: Queryable, groupId: string): Promise<string[]> {
  const { rows } = await db.query<{ user_id: string }>("select user_id from travel_group_members where group_id = $1 and status = 'active'", [groupId]);
  return rows.map((r) => r.user_id);
}

async function event(db: Queryable, groupId: string, actorId: string | null, category: "membership" | "itinerary" | "settings" | "moderation", action: string, subjectUserId: string | null = null, details: Record<string, unknown> = {}) {
  await db.query(
    "insert into travel_group_events (group_id, actor_id, category, action, subject_user_id, details) values ($1, $2, $3, $4, $5, $6)",
    [groupId, actorId, category, action, subjectUserId, JSON.stringify(details)],
  );
}

async function notifyMany(db: Queryable, userIds: string[], n: { type: Parameters<typeof notify>[1]["type"]; title: string; body: string; link: string; dedupe: string }) {
  for (const userId of new Set(userIds)) {
    await notify(db, { userId, type: n.type, title: n.title, body: n.body, link: n.link, dedupeKey: `${n.dedupe}:${userId}` });
  }
}

/** Activates (or re-activates) a membership. Caller must hold the group row lock. */
async function activateMember(db: Queryable, group: GroupRow, userId: string, role: MemberRow["role"] = "member") {
  if (group.status !== "published") throw new UserError("This group isn't accepting members right now.");
  if (group.end_date < today()) throw new UserError("This trip has already ended.");
  const existing = await membership(db, group.id, userId);
  if (existing?.status === "active") return existing.id;
  if (existing?.status === "banned") throw new UserError("You can't join this group.");
  if ((await activeCount(db, group.id)) >= group.max_members) throw new UserError("This group is full.");
  try {
    if (existing) {
      memberMachine.assert(existing.status, "active");
      await db.query("update travel_group_members set status = 'active', role = $2, joined_at = now(), left_at = null, status_reason = null where id = $1", [existing.id, role]);
    } else {
      await db.query("insert into travel_group_members (group_id, user_id, role, status, joined_at) values ($1, $2, $3, 'active', now())", [group.id, userId, role]);
    }
  } catch (err) {
    if (isPgError(err, "23514")) throw new UserError("This group is full.");
    throw err;
  }
  await syncChatParticipant(db, group.id, userId, role === "member" ? "group_member" : "group_organizer");
  await event(db, group.id, userId, "membership", "member_joined", userId);
  if ((await activeCount(db, group.id)) >= group.max_members) {
    await event(db, group.id, null, "membership", "group_full");
    await notifyMany(db, await organizerIds(db, group.id), {
      type: "group.full",
      title: `${group.name} is now full`,
      body: "Every place in your group has been taken.",
      link: `/travel-together/${group.id}/members`,
      dedupe: `group.full:${group.id}:${Date.now()}`,
    });
  }
  return null;
}

async function groupConversationId(db: Queryable, groupId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>("select id from conversations where group_id = $1", [groupId]);
  return rows[0]?.id ?? null;
}

/** Chat access mirrors active membership exactly. */
async function syncChatParticipant(db: Queryable, groupId: string, userId: string, role: "group_member" | "group_organizer" | null) {
  const conv = await groupConversationId(db, groupId);
  if (!conv) return;
  if (role) {
    await db.query(
      `insert into conversation_participants (conversation_id, user_id, role) values ($1, $2, $3)
       on conflict (conversation_id, user_id) do update set role = excluded.role`,
      [conv, userId, role],
    );
  } else {
    await db.query("delete from conversation_participants where conversation_id = $1 and user_id = $2", [conv, userId]);
  }
}

// ───────────────────────────── travel profile ─────────────────────────────

export const travelProfileSchema = z.object({
  bio: z.string().trim().max(600).nullable(),
  photoUrl: z.string().trim().url().startsWith("https://", "Use an https image URL").max(500).nullable(),
  pace: z.enum(["relaxed", "balanced", "adventurous"]).nullable(),
  destinationSlugs: z.array(z.string().max(80)).max(12),
  pastTrips: z.string().trim().max(1000).nullable(),
  visibility: z.enum(["public", "members", "private"]),
  interests: z.array(z.string().max(40)).max(12),
  adultConfirmed: z.boolean(),
  acceptGuidelines: z.boolean(),
});

export async function getTravelProfile(db: Queryable, actor: Actor | null) {
  const a = requireActor(actor);
  const { rows } = await db.query<{
    bio: string | null;
    photo_url: string | null;
    pace: "relaxed" | "balanced" | "adventurous" | null;
    destination_slugs: string[];
    past_trips: string | null;
    visibility: "public" | "members" | "private";
    adult_confirmed_at: Date | null;
    guidelines_accepted_at: Date | null;
  }>("select * from travel_profiles where user_id = $1", [a.userId]);
  const { rows: interests } = await db.query<{ interest_slug: string }>("select interest_slug from user_travel_interests where user_id = $1", [a.userId]);
  const { rows: langs } = await db.query<{ languages: string[] }>("select languages from traveller_profiles where user_id = $1", [a.userId]);
  return {
    bio: rows[0]?.bio ?? null,
    photoUrl: rows[0]?.photo_url ?? null,
    pace: rows[0]?.pace ?? null,
    destinationSlugs: rows[0]?.destination_slugs ?? [],
    pastTrips: rows[0]?.past_trips ?? null,
    visibility: rows[0]?.visibility ?? "members",
    adultConfirmed: !!rows[0]?.adult_confirmed_at,
    guidelinesAccepted: !!rows[0]?.guidelines_accepted_at,
    interests: interests.map((i) => i.interest_slug),
    languages: langs[0]?.languages ?? [],
  };
}

export async function saveTravelProfile(db: Db, actor: Actor | null, input: z.infer<typeof travelProfileSchema>) {
  const a = requireActor(actor);
  const v = travelProfileSchema.parse(input);
  await db.transaction(async (tx) => {
    const { rows: existing } = await tx.query<{ adult_confirmed_at: Date | null; guidelines_accepted_at: Date | null }>(
      "select adult_confirmed_at, guidelines_accepted_at from travel_profiles where user_id = $1",
      [a.userId],
    );
    await tx.query(
      `insert into travel_profiles (user_id, bio, photo_url, pace, destination_slugs, past_trips, visibility, adult_confirmed_at, guidelines_accepted_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (user_id) do update set bio = excluded.bio, photo_url = excluded.photo_url, pace = excluded.pace,
         destination_slugs = excluded.destination_slugs, past_trips = excluded.past_trips, visibility = excluded.visibility,
         adult_confirmed_at = excluded.adult_confirmed_at, guidelines_accepted_at = excluded.guidelines_accepted_at`,
      [
        a.userId, v.bio, v.photoUrl, v.pace, v.destinationSlugs, v.pastTrips, v.visibility,
        v.adultConfirmed ? (existing[0]?.adult_confirmed_at ?? new Date()) : null,
        v.acceptGuidelines ? (existing[0]?.guidelines_accepted_at ?? new Date()) : null,
      ],
    );
    await tx.query("delete from user_travel_interests where user_id = $1", [a.userId]);
    for (const slug of new Set(v.interests)) {
      await tx.query("insert into user_travel_interests (user_id, interest_slug) select $1, slug from travel_interests where slug = $2", [a.userId, slug]);
    }
  });
}

export interface PublicTraveller {
  userId: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  interests: string[];
  languages: string[];
  role?: string;
  visible: boolean;
}

/**
 * Applies profile visibility: 'public' → anyone; 'members' → people sharing an active group with
 * them; 'private' → only themselves. Hidden profiles still show a first name so groups work.
 */
async function travellerCards(db: Queryable, viewerId: string | null, userIds: string[]): Promise<Map<string, PublicTraveller>> {
  const out = new Map<string, PublicTraveller>();
  if (!userIds.length) return out;
  const { rows } = await db.query<{
    id: string;
    display_name: string;
    photo_url: string | null;
    bio: string | null;
    visibility: string | null;
    languages: string[] | null;
    interests: string[];
    shares_group: boolean;
  }>(
    `select u.id, u.display_name, tp.photo_url, tp.bio, tp.visibility, trp.languages,
            coalesce(array(select interest_slug from user_travel_interests i where i.user_id = u.id), '{}') as interests,
            exists (select 1 from travel_group_members a join travel_group_members b on a.group_id = b.group_id
                     where a.user_id = u.id and b.user_id = $2 and a.status = 'active' and b.status = 'active') as shares_group
       from users u left join travel_profiles tp on tp.user_id = u.id left join traveller_profiles trp on trp.user_id = u.id
      where u.id = any($1::uuid[])`,
    [userIds, viewerId],
  );
  for (const r of rows) {
    const visibility = r.visibility ?? "members";
    const visible = r.id === viewerId || visibility === "public" || (visibility === "members" && r.shares_group);
    out.set(r.id, {
      userId: r.id,
      name: r.display_name.split(/\s+/)[0],
      photoUrl: visible ? r.photo_url : null,
      bio: visible ? r.bio : null,
      interests: visible ? r.interests : [],
      languages: visible ? (r.languages ?? []) : [],
      visible,
    });
  }
  return out;
}

// ───────────────────────────── groups ─────────────────────────────

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

export const groupInputSchema = z
  .object({
    name: z.string().trim().min(3, "Name your group").max(80),
    description: z.string().trim().min(20, "Describe the trip in at least 20 characters").max(2000),
    destinationId: z.string().uuid("Choose a destination"),
    startDate: dateStr,
    endDate: dateStr,
    maxMembers: z.number().int().min(2, "Groups need room for at least 2 people").max(30, "Groups can have up to 30 people"),
    language: z.string().trim().min(2).max(40),
    visibility: z.enum(["public", "approval", "private"]),
    interests: z.array(z.string().max(40)).min(1, "Choose at least one interest").max(8),
    currency: z.literal("KES"),
    minBudgetMinor: z.number().int().min(0).nullable(),
    maxBudgetMinor: z.number().int().min(0).nullable(),
    budgetIncludes: z.array(z.enum(["accommodation", "transport", "activities", "meals"])).max(4),
    expenseStyle: z.enum(["individual", "shared", "mixed"]),
    travelPace: z.enum(["relaxed", "balanced", "adventurous"]),
    activityLevel: z.enum(["easy", "moderate", "challenging"]),
    sharedTransport: z.enum(["none", "optional", "planned"]),
    accommodation: z.enum(["own", "optional_shared"]),
    arrivalNotes: z.string().trim().max(500).nullable(),
    communicationNotes: z.string().trim().max(500).nullable(),
    cancellationNotes: z.string().trim().max(500).nullable(),
    bookingDeadline: dateStr.nullable(),
    approvalPolicy: z.enum(["organizer", "majority"]),
    coverArt: z.enum(["savanna", "coast", "mountain", "lake", "city", "desert", "forest"]),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "The trip must end on or after it starts" });
    else if (Date.parse(v.endDate) - Date.parse(v.startDate) > 30 * 86_400_000) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Group trips can last up to 31 days" });
    if (v.minBudgetMinor !== null && v.maxBudgetMinor !== null && v.maxBudgetMinor < v.minBudgetMinor) {
      ctx.addIssue({ code: "custom", path: ["maxBudgetMinor"], message: "The maximum must be at least the minimum" });
    }
    if (v.bookingDeadline && v.bookingDeadline > v.endDate) ctx.addIssue({ code: "custom", path: ["bookingDeadline"], message: "The booking deadline must be before the trip ends" });
  });
export type GroupInput = z.infer<typeof groupInputSchema>;

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 50) || "group";

/**
 * Creates or updates a group. Creation is atomic: group, interests, organizer membership, shared
 * plan trip and group chat succeed together or not at all. Publishing re-validates everything.
 */
export async function saveGroup(db: Db, actor: Actor | null, groupId: string | null, input: GroupInput, intent: "draft" | "publish") {
  const a = requireActor(actor);
  const v = groupInputSchema.parse(input);
  if (intent === "publish" && v.startDate < today()) throw new UserError("A published group must start today or later.");

  return db.transaction(async (tx) => {
    await requireSocialEligibility(tx, a.userId);
    const { rowCount: destOk } = await tx.query("select 1 from destinations where id = $1 and is_published", [v.destinationId]);
    if (!destOk) throw new UserError("Choose a destination from the list.");
    const { rows: validInterests } = await tx.query<{ slug: string }>("select slug from travel_interests where slug = any($1::text[])", [v.interests]);
    if (!validInterests.length) throw new UserError("Choose at least one interest from the list.");

    let id = groupId;
    let group: GroupRow;
    if (!id) {
      await rateLimit(tx, `group.create:${a.userId}`, 5, 24 * 60, "You can create up to 5 groups a day.");
      const slug = `${slugify(v.name)}-${newToken(4).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "g"}`;
      const { rows } = await tx.query<GroupRow>(
        `insert into travel_groups (organizer_user_id, name, slug, description, destination_id, start_date, end_date, max_members, language, visibility,
                                    currency, min_budget_minor, max_budget_minor, budget_includes, expense_style, travel_pace, activity_level,
                                    shared_transport, accommodation, arrival_notes, communication_notes, cancellation_notes, booking_deadline,
                                    approval_policy, cover_art)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) returning *`,
        [
          a.userId, v.name, slug, v.description, v.destinationId, v.startDate, v.endDate, v.maxMembers, v.language, v.visibility, v.currency,
          v.minBudgetMinor, v.maxBudgetMinor, v.budgetIncludes, v.expenseStyle, v.travelPace, v.activityLevel, v.sharedTransport,
          v.accommodation, v.arrivalNotes, v.communicationNotes, v.cancellationNotes, v.bookingDeadline, v.approvalPolicy, v.coverArt,
        ],
      );
      group = rows[0];
      id = group.id;
      await tx.query("insert into travel_group_members (group_id, user_id, role, status, joined_at) values ($1, $2, 'organizer', 'active', now())", [id, a.userId]);

      // Shared plan: an ordinary trip that can only change through approved proposals.
      const { id: tripId } = await createTrip(tx, a, {
        title: `${v.name} (group plan)`.slice(0, 140),
        primaryDestinationId: v.destinationId,
        startDate: v.startDate,
        endDate: v.endDate,
        adults: 1,
        children: 0,
        budgetMinor: null,
        interests: [],
        pace: v.travelPace,
        tourType: "shared",
        languages: [v.language],
        accessibilityNotes: null,
        dietaryNotes: null,
        accommodationNotes: null,
        transportNotes: null,
      });
      await tx.query("update trips set group_id = $2, group_purpose = 'plan' where id = $1", [tripId, id]);
      await tx.query("update travel_groups set trip_id = $2 where id = $1", [id, tripId]);
      const { rows: conv } = await tx.query<{ id: string }>("insert into conversations (subject, group_id) values ($1, $2) returning id", [`${v.name} · group chat`, id]);
      await tx.query("insert into conversation_participants (conversation_id, user_id, role) values ($1, $2, 'group_organizer')", [conv[0].id, a.userId]);
      await event(tx, id, a.userId, "settings", "group_created");
    } else {
      await requireOrganizer(tx, a, id);
      group = await lockGroup(tx, id);
      if (group.status === "cancelled" || group.status === "completed" || group.status === "suspended") throw new UserError(`This group is ${group.status} and can't be edited.`);
      const members = await activeCount(tx, id);
      if (v.maxMembers < members) throw new UserError(`The group already has ${members} members; the size can't be smaller than that.`);
      if (v.startDate !== group.start_date || v.endDate !== group.end_date) {
        const { rowCount } = await tx.query(
          "select 1 from travel_group_proposals where group_id = $1 and status = 'approved' and (day_date < $2 or day_date > $3)",
          [id, v.startDate, v.endDate],
        );
        if (rowCount) throw new UserError("Some agreed activities fall outside the new dates. Cancel them first.");
        await tx.query("delete from itinerary_days d where d.trip_id = $1 and (d.date < $2 or d.date > $3)", [group.trip_id, v.startDate, v.endDate]);
        await tx.query("update itinerary_days set day_number = day_number + 1000 where trip_id = $1", [group.trip_id]);
        await tx.query("update trips set start_date = $2, end_date = $3 where id = $1", [group.trip_id, v.startDate, v.endDate]);
        await ensureDays(tx, group.trip_id!, v.startDate, v.endDate, v.destinationId);
      }
      await tx.query(
        `update travel_groups set name=$2, description=$3, destination_id=$4, start_date=$5, end_date=$6, max_members=$7, language=$8, visibility=$9,
                min_budget_minor=$10, max_budget_minor=$11, budget_includes=$12, expense_style=$13, travel_pace=$14, activity_level=$15,
                shared_transport=$16, accommodation=$17, arrival_notes=$18, communication_notes=$19, cancellation_notes=$20, booking_deadline=$21,
                approval_policy=$22, cover_art=$23
          where id = $1`,
        [
          id, v.name, v.description, v.destinationId, v.startDate, v.endDate, v.maxMembers, v.language, v.visibility, v.minBudgetMinor, v.maxBudgetMinor,
          v.budgetIncludes, v.expenseStyle, v.travelPace, v.activityLevel, v.sharedTransport, v.accommodation, v.arrivalNotes, v.communicationNotes,
          v.cancellationNotes, v.bookingDeadline, v.approvalPolicy, v.coverArt,
        ],
      );
      await tx.query("delete from travel_group_interests where group_id = $1", [id]);
      await event(tx, id, a.userId, "settings", "group_updated");
    }
    for (const r of validInterests) await tx.query("insert into travel_group_interests (group_id, interest_slug) values ($1, $2)", [id, r.slug]);

    if (intent === "publish" && group.status === "draft") {
      groupMachine.assert("draft", "published");
      await tx.query("update travel_groups set status = 'published', published_at = now() where id = $1", [id]);
      await event(tx, id, a.userId, "settings", "group_published");
    }
    return { id: id! };
  });
}

export async function cancelGroup(db: Db, actor: Actor | null, groupId: string, reason: string) {
  if (reason.trim().length < 3) throw new UserError("Tell members why the group is being cancelled.");
  await db.transaction(async (tx) => {
    const { actor: a } = await requireOrganizer(tx, actor, groupId, { ownerOnly: true });
    const group = await lockGroup(tx, groupId);
    groupMachine.assert(group.status, "cancelled");
    await tx.query("update travel_groups set status = 'cancelled', status_reason = $2 where id = $1", [groupId, reason.trim()]);
    await tx.query("update travel_group_join_requests set status = 'expired' where group_id = $1 and status = 'pending'", [groupId]);
    await tx.query("update travel_group_invitations set status = 'revoked' where group_id = $1 and status = 'pending'", [groupId]);
    await event(tx, groupId, a.userId, "settings", "group_cancelled", null, { reason });
    await notifyMany(tx, (await activeMemberIds(tx, groupId)).filter((u) => u !== a.userId), {
      type: "group.cancelled",
      title: `${group.name} was cancelled`,
      body: `The organizer cancelled this group: ${reason.trim()}. Bookings you made yourself are not cancelled automatically — manage them from your bookings page.`,
      link: `/travel-together/${groupId}`,
      dedupe: `group.cancelled:${groupId}`,
    });
  });
}

export async function setGroupCover(db: Queryable, actor: Actor | null, groupId: string, storageKey: string) {
  await requireOrganizer(db, actor, groupId);
  await db.query("update travel_groups set cover_storage_key = $2 where id = $1", [groupId, storageKey]);
}

/** Who may see a group at all. Private/draft/suspended groups are invisible to outsiders. */
async function canView(db: Queryable, actor: Actor | null, group: GroupRow): Promise<{ member: MemberRow | null; invited: boolean }> {
  const member = actor ? await membership(db, group.id, actor.userId) : null;
  const activeMember = member?.status === "active";
  if (actor && isStaff(actor)) return { member, invited: false };
  if (group.status === "draft") {
    if (actor?.userId === group.organizer_user_id) return { member, invited: false };
    throw new NotFoundError("Group not found.");
  }
  if (group.status === "suspended" && !activeMember) throw new NotFoundError("Group not found.");
  if (member?.status === "banned") throw new NotFoundError("Group not found.");
  if (actor && !activeMember && (await isBlockedBetween(db, actor.userId, group.organizer_user_id))) throw new NotFoundError("Group not found.");
  let invited = false;
  if (actor) {
    const { rowCount } = await db.query(
      "select 1 from travel_group_invitations where group_id = $1 and invited_user_id = $2 and status = 'pending' and expires_at > now()",
      [group.id, actor.userId],
    );
    invited = rowCount > 0;
  }
  if (group.visibility === "private" && !activeMember && !invited) throw new NotFoundError("Group not found.");
  return { member, invited };
}

export interface GroupCard {
  id: string;
  name: string;
  description: string;
  destination: { slug: string; name: string };
  startDate: string;
  endDate: string;
  maxMembers: number;
  memberCount: number;
  placesLeft: number;
  visibility: "public" | "approval" | "private";
  status: GroupStatus;
  interests: string[];
  currency: string;
  minBudgetMinor: number | null;
  maxBudgetMinor: number | null;
  pace: "relaxed" | "balanced" | "adventurous";
  language: string;
  coverArt: ArtVariant;
  hasCover: boolean;
  organizer: { name: string; photoUrl: string | null };
  isDemo: boolean;
  viewerStatus: "organizer" | "member" | "requested" | "invited" | null;
  match: MatchResult | null;
  createdAt: Date;
}

interface CardRow {
  id: string;
  name: string;
  description: string;
  destination_slug: string;
  destination_name: string;
  start_date: string;
  end_date: string;
  max_members: number;
  member_count: number;
  visibility: GroupCard["visibility"];
  status: GroupStatus;
  interests: string[];
  currency: string;
  min_budget_minor: number | null;
  max_budget_minor: number | null;
  travel_pace: GroupCard["pace"];
  language: string;
  cover_art: ArtVariant;
  cover_storage_key: string | null;
  organizer_user_id: string;
  is_demo: boolean;
  viewer_role: string | null;
  viewer_requested: boolean;
  viewer_invited: boolean;
  created_at: Date;
}

const CARD_COLUMNS = (viewerParam: string) => `
  g.id, g.name, g.description, d.slug as destination_slug, d.name as destination_name, g.start_date, g.end_date, g.max_members,
  (select count(*)::int from travel_group_members m where m.group_id = g.id and m.status = 'active') as member_count,
  g.visibility, g.status, coalesce(array(select interest_slug from travel_group_interests i where i.group_id = g.id order by interest_slug), '{}') as interests,
  g.currency, g.min_budget_minor, g.max_budget_minor, g.travel_pace, g.language, g.cover_art, g.cover_storage_key, g.organizer_user_id, g.is_demo, g.created_at,
  (select m.role from travel_group_members m where m.group_id = g.id and m.user_id = ${viewerParam} and m.status = 'active') as viewer_role,
  exists (select 1 from travel_group_join_requests r where r.group_id = g.id and r.user_id = ${viewerParam} and r.status = 'pending') as viewer_requested,
  exists (select 1 from travel_group_invitations iv where iv.group_id = g.id and iv.invited_user_id = ${viewerParam} and iv.status = 'pending' and iv.expires_at > now()) as viewer_invited`;

async function toCards(db: Queryable, viewerId: string | null, rows: CardRow[], seeker: MatchSeeker | null): Promise<GroupCard[]> {
  const organizers = await travellerCards(db, viewerId, [...new Set(rows.map((r) => r.organizer_user_id))]);
  return rows.map((r) => {
    const placesLeft = Math.max(0, r.max_members - r.member_count);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      destination: { slug: r.destination_slug, name: r.destination_name },
      startDate: r.start_date,
      endDate: r.end_date,
      maxMembers: r.max_members,
      memberCount: r.member_count,
      placesLeft,
      visibility: r.visibility,
      status: r.status,
      interests: r.interests,
      currency: r.currency,
      minBudgetMinor: r.min_budget_minor,
      maxBudgetMinor: r.max_budget_minor,
      pace: r.travel_pace,
      language: r.language,
      coverArt: r.cover_art,
      hasCover: !!r.cover_storage_key,
      organizer: { name: organizers.get(r.organizer_user_id)?.name ?? "Organizer", photoUrl: organizers.get(r.organizer_user_id)?.photoUrl ?? null },
      isDemo: r.is_demo,
      viewerStatus: r.viewer_role ? (r.viewer_role === "member" ? "member" : "organizer") : r.viewer_requested ? "requested" : r.viewer_invited ? "invited" : null,
      match: seeker
        ? matchGroup(
            {
              destinationSlug: r.destination_slug,
              startDate: r.start_date,
              endDate: r.end_date,
              minBudgetMinor: r.min_budget_minor,
              maxBudgetMinor: r.max_budget_minor,
              interests: r.interests,
              pace: r.travel_pace,
              language: r.language,
              placesLeft,
            },
            seeker,
          )
        : null,
      createdAt: r.created_at,
    };
  });
}

export interface GroupFilters {
  destination?: string;
  from?: string;
  to?: string;
  budgetMaxMinor?: number;
  interests?: string[];
  language?: string;
  pace?: "relaxed" | "balanced" | "adventurous";
  maxSize?: number;
  visibility?: "public" | "approval";
  hasPlaces?: boolean;
  q?: string;
  sort?: "match" | "soonest" | "newest";
  page?: number;
}

const GROUP_PAGE = 12;

/** Public discovery: only published, listed (public/approval), upcoming groups. Never private ones. */
export async function discoverGroups(db: Queryable, actor: Actor | null, f: GroupFilters = {}) {
  const p = new SqlParams();
  const viewer = p.add(actor?.userId ?? null);
  const where = [
    "g.status = 'published'",
    "g.visibility in ('public', 'approval')",
    `g.end_date >= ${p.add(today())}`,
    `not exists (select 1 from user_blocks b where (b.blocker_id = g.organizer_user_id and b.blocked_id = ${viewer}) or (b.blocker_id = ${viewer} and b.blocked_id = g.organizer_user_id))`,
    `not exists (select 1 from travel_group_members m where m.group_id = g.id and m.user_id = ${viewer} and m.status = 'banned')`,
  ];
  if (f.destination) where.push(`d.slug = ${p.add(f.destination)}`);
  if (f.from) where.push(`g.end_date >= ${p.add(f.from)}`);
  if (f.to) where.push(`g.start_date <= ${p.add(f.to)}`);
  if (f.budgetMaxMinor !== undefined) where.push(`(g.min_budget_minor is null or g.min_budget_minor <= ${p.add(f.budgetMaxMinor)})`);
  if (f.interests?.length) where.push(`exists (select 1 from travel_group_interests i where i.group_id = g.id and i.interest_slug = any(${p.add(f.interests)}::text[]))`);
  if (f.language) where.push(`lower(g.language) = lower(${p.add(f.language)})`);
  if (f.pace) where.push(`g.travel_pace = ${p.add(f.pace)}`);
  if (f.maxSize) where.push(`g.max_members <= ${p.add(f.maxSize)}`);
  if (f.visibility) where.push(`g.visibility = ${p.add(f.visibility)}`);
  if (f.hasPlaces) where.push("(select count(*) from travel_group_members m where m.group_id = g.id and m.status = 'active') < g.max_members");
  if (f.q) {
    const q = p.add(`%${likeEscape(f.q)}%`);
    where.push(`(g.name ilike ${q} or g.description ilike ${q} or d.name ilike ${q})`);
  }
  const whereSql = where.join(" and ");
  const from = "from travel_groups g join destinations d on d.id = g.destination_id";
  const total = (await db.query<{ n: number }>(`select count(*)::int as n ${from} where ${whereSql}`, p.values)).rows[0].n;

  let seeker: MatchSeeker | null = null;
  if (actor) {
    const profile = await getTravelProfile(db, actor);
    seeker = {
      destinationSlugs: f.destination ? [f.destination] : profile.destinationSlugs.length ? profile.destinationSlugs : undefined,
      startDate: f.from,
      endDate: f.to ?? (f.from ? addDays(f.from, 6) : undefined),
      budgetMaxMinor: f.budgetMaxMinor,
      interests: f.interests?.length ? f.interests : profile.interests.length ? profile.interests : undefined,
      pace: f.pace ?? profile.pace ?? undefined,
      languages: f.language ? [f.language] : profile.languages.length ? profile.languages : undefined,
    };
  } else if (f.from || f.interests?.length || f.destination || f.budgetMaxMinor !== undefined) {
    seeker = { destinationSlugs: f.destination ? [f.destination] : undefined, startDate: f.from, endDate: f.to ?? (f.from ? addDays(f.from, 6) : undefined), budgetMaxMinor: f.budgetMaxMinor, interests: f.interests };
  }

  const sort = f.sort ?? (seeker ? "match" : "soonest");
  if (sort === "match" && seeker) {
    // Ranking needs every candidate scored; groups are few per search, so score then paginate.
    const { rows } = await db.query<CardRow>(`select ${CARD_COLUMNS(viewer)} ${from} where ${whereSql} order by g.start_date limit 500`, p.values);
    const cards = (await toCards(db, actor?.userId ?? null, rows, seeker)).sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0) || a.startDate.localeCompare(b.startDate));
    const offset = pageOffset(f.page, GROUP_PAGE);
    return { items: cards.slice(offset, offset + GROUP_PAGE), total, page: f.page ?? 1, pageCount: Math.max(1, Math.ceil(total / GROUP_PAGE)) };
  }
  const order = sort === "newest" ? "g.published_at desc nulls last" : "g.start_date, g.name";
  const { rows } = await db.query<CardRow>(
    `select ${CARD_COLUMNS(viewer)} ${from} where ${whereSql} order by ${order} limit ${GROUP_PAGE} offset ${pageOffset(f.page, GROUP_PAGE)}`,
    p.values,
  );
  return { items: await toCards(db, actor?.userId ?? null, rows, seeker), total, page: f.page ?? 1, pageCount: Math.max(1, Math.ceil(total / GROUP_PAGE)) };
}

export async function discoverySections(db: Queryable, actor: Actor | null) {
  const soon = await discoverGroups(db, actor, { to: addDays(today(), 21), hasPlaces: true, sort: "soonest" });
  const fresh = await discoverGroups(db, actor, { hasPlaces: true, sort: "newest" });
  return { leavingSoon: soon.items.slice(0, 3), newGroups: fresh.items.slice(0, 3) };
}

export interface GroupDetail extends GroupCard {
  slug: string;
  organizerUserId: string;
  budgetIncludes: string[];
  expenseStyle: string;
  activityLevel: string;
  sharedTransport: string;
  accommodation: string;
  arrivalNotes: string | null;
  communicationNotes: string | null;
  cancellationNotes: string | null;
  bookingDeadline: string | null;
  approvalPolicy: ApprovalPolicy;
  statusReason: string | null;
  tripId: string | null;
  destinationId: string;
  members: (PublicTraveller & { role: string })[];
  viewer: { userId: string | null; role: string | null; memberStatus: MemberStatus | null; requested: boolean; invitationId: string | null; isStaff: boolean };
}

export async function getGroup(db: Queryable, actor: Actor | null, groupId: string): Promise<GroupDetail> {
  const group = await loadGroup(db, groupId);
  const { member } = await canView(db, actor, group);
  const p = new SqlParams();
  const viewer = p.add(actor?.userId ?? null);
  const { rows } = await db.query<CardRow>(`select ${CARD_COLUMNS(viewer)} from travel_groups g join destinations d on d.id = g.destination_id where g.id = ${p.add(groupId)}`, p.values);
  const [card] = await toCards(db, actor?.userId ?? null, rows, null);
  const { rows: memberRows } = await db.query<{ user_id: string; role: string }>(
    "select user_id, role from travel_group_members where group_id = $1 and status = 'active' order by case role when 'organizer' then 0 when 'co_organizer' then 1 else 2 end, joined_at",
    [groupId],
  );
  const cards = await travellerCards(db, actor?.userId ?? null, memberRows.map((m) => m.user_id));
  const { rows: inv } = actor
    ? await db.query<{ id: string }>("select id from travel_group_invitations where group_id = $1 and invited_user_id = $2 and status = 'pending' and expires_at > now()", [groupId, actor.userId])
    : { rows: [] as { id: string }[] };
  const { rowCount: requested } = actor
    ? await db.query("select 1 from travel_group_join_requests where group_id = $1 and user_id = $2 and status = 'pending'", [groupId, actor.userId])
    : { rowCount: 0 };
  return {
    ...card,
    slug: group.slug,
    organizerUserId: group.organizer_user_id,
    budgetIncludes: group.budget_includes,
    expenseStyle: group.expense_style,
    activityLevel: group.activity_level,
    sharedTransport: group.shared_transport,
    accommodation: group.accommodation,
    arrivalNotes: group.arrival_notes,
    communicationNotes: group.communication_notes,
    cancellationNotes: group.cancellation_notes,
    bookingDeadline: group.booking_deadline,
    approvalPolicy: group.approval_policy,
    statusReason: group.status_reason,
    tripId: member?.status === "active" ? group.trip_id : null,
    destinationId: group.destination_id,
    members: memberRows.map((m) => ({ ...cards.get(m.user_id)!, role: m.role })),
    viewer: {
      userId: actor?.userId ?? null,
      role: member?.status === "active" ? member.role : null,
      memberStatus: member?.status ?? null,
      requested: requested > 0,
      invitationId: inv[0]?.id ?? null,
      isStaff: !!actor && isStaff(actor),
    },
  };
}

/** Raw editable values for the organizer's edit form. */
export async function getGroupForEdit(db: Queryable, actor: Actor | null, groupId: string) {
  await requireOrganizer(db, actor, groupId);
  const group = await loadGroup(db, groupId);
  const { rows } = await db.query<{ interest_slug: string }>("select interest_slug from travel_group_interests where group_id = $1", [groupId]);
  return { ...group, interests: rows.map((r) => r.interest_slug) };
}

export async function myGroups(db: Queryable, actor: Actor | null) {
  const a = requireActor(actor);
  const p = new SqlParams();
  const viewer = p.add(a.userId);
  const { rows } = await db.query<CardRow>(
    `select ${CARD_COLUMNS(viewer)} from travel_groups g join destinations d on d.id = g.destination_id
      where exists (select 1 from travel_group_members m where m.group_id = g.id and m.user_id = ${viewer} and m.status = 'active')
         or (g.organizer_user_id = ${viewer} and g.status = 'draft')
      order by g.start_date`,
    p.values,
  );
  const cards = await toCards(db, a.userId, rows, null);
  const t = today();
  return {
    organizing: cards.filter((c) => c.viewerStatus === "organizer" && c.status !== "draft" && c.endDate >= t),
    drafts: cards.filter((c) => c.status === "draft"),
    joined: cards.filter((c) => c.viewerStatus === "member" && c.endDate >= t),
    past: cards.filter((c) => c.status !== "draft" && c.endDate < t),
  };
}

// ───────────────────────────── membership ─────────────────────────────

/**
 * Public groups: eligible travellers join immediately. Approval groups: a pending request is
 * created for organizers to review. Private groups: invitation only.
 */
export async function joinOrRequest(db: Db, actor: Actor | null, groupId: string, message: string | null): Promise<"joined" | "requested"> {
  const a = requireActor(actor);
  return db.transaction(async (tx) => {
    await requireSocialEligibility(tx, a.userId);
    const group = await lockGroup(tx, groupId);
    await canView(tx, a, group);
    if (await isBlockedBetween(tx, a.userId, group.organizer_user_id)) throw new UserError("You can't join this group.");
    const existing = await membership(tx, groupId, a.userId);
    if (existing?.status === "active") throw new UserError("You're already a member of this group.");
    if (existing?.status === "banned") throw new UserError("You can't join this group.");
    if (group.visibility === "private") throw new UserError("This group is invite-only.");
    if (group.status !== "published") throw new UserError("This group isn't accepting members right now.");

    if (group.visibility === "public") {
      await activateMember(tx, group, a.userId);
      await notifyMany(tx, (await organizerIds(tx, groupId)).filter((u) => u !== a.userId), {
        type: "group.member_joined",
        title: `New member in ${group.name}`,
        body: "Someone joined your group.",
        link: `/travel-together/${groupId}/members`,
        dedupe: `group.joined:${groupId}:${a.userId}:${Date.now()}`,
      });
      return "joined" as const;
    }

    await rateLimit(tx, `group.request:${a.userId}`, 20, 60, "You've sent a lot of requests. Please try again later.");
    if ((await activeCount(tx, groupId)) >= group.max_members) throw new UserError("This group is full.");
    try {
      const { rows } = await tx.query<{ id: string }>(
        "insert into travel_group_join_requests (group_id, user_id, message) values ($1, $2, $3) returning id",
        [groupId, a.userId, message?.trim().slice(0, 500) || null],
      );
      await notifyMany(tx, await organizerIds(tx, groupId), {
        type: "group.join_request",
        title: `New request to join ${group.name}`,
        body: message?.trim() ? `“${message.trim().slice(0, 140)}”` : "A traveller would like to join your group.",
        link: "/travel-together/requests",
        dedupe: `group.request:${rows[0].id}`,
      });
    } catch (err) {
      if (isPgError(err, "23505")) throw new UserError("You've already asked to join this group.");
      throw err;
    }
    return "requested" as const;
  });
}

export async function withdrawRequest(db: Queryable, actor: Actor | null, groupId: string) {
  const a = requireActor(actor);
  await db.query("update travel_group_join_requests set status = 'withdrawn' where group_id = $1 and user_id = $2 and status = 'pending'", [groupId, a.userId]);
}

export async function reviewRequest(db: Db, actor: Actor | null, requestId: string, decision: "approve" | "decline", note: string | null) {
  if (!uuid.safeParse(requestId).success) throw new NotFoundError();
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; group_id: string; user_id: string; status: string }>(
      "select id, group_id, user_id, status from travel_group_join_requests where id = $1 for update",
      [requestId],
    );
    const req = rows[0];
    if (!req) throw new NotFoundError();
    const { actor: a } = await requireOrganizer(tx, actor, req.group_id);
    if (req.status !== "pending") throw new UserError("This request has already been answered.");
    const group = await lockGroup(tx, req.group_id);

    if (decision === "approve") {
      if (await isBlockedBetween(tx, req.user_id, a.userId)) throw new UserError("You can't approve someone you've blocked.");
      await activateMember(tx, group, req.user_id);
    }
    await tx.query("update travel_group_join_requests set status = $2, reviewed_by = $3, reviewed_at = now(), decision_note = $4 where id = $1", [
      requestId,
      decision === "approve" ? "approved" : "declined",
      a.userId,
      note?.trim().slice(0, 500) || null,
    ]);
    await event(tx, group.id, a.userId, "membership", decision === "approve" ? "request_approved" : "request_declined", req.user_id);
    await notify(tx, {
      userId: req.user_id,
      type: decision === "approve" ? "group.request_approved" : "group.request_declined",
      title: decision === "approve" ? `You're in! Welcome to ${group.name}` : `Your request to join ${group.name}`,
      body: decision === "approve" ? "Your request was approved. Say hello in the group chat and help plan the itinerary." : `The organizer couldn't accept your request this time${note?.trim() ? `: “${note.trim().slice(0, 200)}”` : "."}`,
      link: `/travel-together/${group.id}`,
      dedupeKey: `group.request.decided:${requestId}`,
    });
    return decision;
  });
}

export async function listRequestsAndInvites(db: Queryable, actor: Actor | null) {
  const a = requireActor(actor);
  const [incoming, mine, invitations] = await Promise.all([
    db.query<{ id: string; group_id: string; group_name: string; user_id: string; message: string | null; created_at: Date; places_left: number }>(
      `select r.id, r.group_id, g.name as group_name, r.user_id, r.message, r.created_at,
              g.max_members - (select count(*)::int from travel_group_members m where m.group_id = g.id and m.status = 'active') as places_left
         from travel_group_join_requests r join travel_groups g on g.id = r.group_id
        where r.status = 'pending' and exists (select 1 from travel_group_members o where o.group_id = r.group_id and o.user_id = $1
                                                and o.status = 'active' and o.role in ('organizer', 'co_organizer'))
        order by r.created_at`,
      [a.userId],
    ),
    db.query<{ group_id: string; group_name: string; status: string; created_at: Date; decision_note: string | null }>(
      `select r.group_id, g.name as group_name, r.status, r.created_at, r.decision_note
         from travel_group_join_requests r join travel_groups g on g.id = r.group_id where r.user_id = $1 order by r.created_at desc limit 30`,
      [a.userId],
    ),
    db.query<{ id: string; group_id: string; group_name: string; start_date: string; end_date: string; inviter: string; expires_at: Date }>(
      `select i.id, i.group_id, g.name as group_name, g.start_date, g.end_date, split_part(u.display_name, ' ', 1) as inviter, i.expires_at
         from travel_group_invitations i join travel_groups g on g.id = i.group_id join users u on u.id = i.invited_by
        where i.invited_user_id = $1 and i.status = 'pending' and i.expires_at > now() and g.status = 'published'
        order by i.created_at desc`,
      [a.userId],
    ),
  ]);
  const people = await travellerCards(db, a.userId, incoming.rows.map((r) => r.user_id));
  return {
    incoming: incoming.rows.map((r) => ({ ...r, requester: people.get(r.user_id)! })),
    mine: mine.rows,
    invitations: invitations.rows,
  };
}

const INVITE_DAYS = 14;

/** Direct invitation by email. Responds identically whether or not the email has an account. */
export async function inviteByEmail(db: Db, actor: Actor | null, groupId: string, email: string) {
  const address = z.string().trim().email("Enter a valid email address").parse(email);
  await db.transaction(async (tx) => {
    const { actor: a } = await requireOrganizer(tx, actor, groupId);
    const group = await lockGroup(tx, groupId);
    if (group.status !== "published" && group.status !== "draft") throw new UserError("This group can't send invitations.");
    await rateLimit(tx, `group.invite:${a.userId}`, 30, 24 * 60, "You've sent a lot of invitations today. Please try again tomorrow.");
    const { rows } = await tx.query<{ id: string }>("select id from users where lower(email) = lower($1) and status = 'active'", [address]);
    const invitee = rows[0];
    if (!invitee || invitee.id === a.userId) return;
    if (await isBlockedBetween(tx, invitee.id, a.userId)) return;
    const m = await membership(tx, groupId, invitee.id);
    if (m?.status === "active" || m?.status === "banned") return;
    const { rows: created } = await tx.query<{ id: string }>(
      `insert into travel_group_invitations (group_id, invited_user_id, invited_by, expires_at)
       values ($1, $2, $3, now() + make_interval(days => $4))
       on conflict (group_id, invited_user_id) where status = 'pending' and invited_user_id is not null do nothing returning id`,
      [groupId, invitee.id, a.userId, INVITE_DAYS],
    );
    if (!created[0]) return;
    await event(tx, groupId, a.userId, "membership", "invited", invitee.id);
    await notify(tx, {
      userId: invitee.id,
      type: "group.invitation",
      title: `You're invited to ${group.name}`,
      body: `You've been invited to join a group trip (${group.start_date} – ${group.end_date}). The invitation expires in ${INVITE_DAYS} days.`,
      link: "/travel-together/requests",
      dedupeKey: `group.invitation:${created[0].id}`,
    });
  });
}

/** Creates a shareable link. The raw token is returned once; only its hash is stored. */
export async function createInviteLink(db: Queryable, actor: Actor | null, groupId: string, opts: { maxUses: number; days: number }) {
  const { actor: a } = await requireOrganizer(db, actor, groupId);
  const maxUses = z.number().int().min(1).max(30).parse(opts.maxUses);
  const days = z.number().int().min(1).max(30).parse(opts.days);
  await rateLimit(db, `group.invite:${a.userId}`, 30, 24 * 60, "You've created a lot of invitations today. Please try again tomorrow.");
  const token = newToken(24);
  await db.query(
    "insert into travel_group_invitations (group_id, invited_by, token_hash, max_uses, expires_at) values ($1, $2, $3, $4, now() + make_interval(days => $5))",
    [groupId, a.userId, hashToken(token), maxUses, days],
  );
  await event(db, groupId, a.userId, "membership", "invite_link_created", null, { maxUses, days });
  return token;
}

export async function listInvitations(db: Queryable, actor: Actor | null, groupId: string) {
  await requireOrganizer(db, actor, groupId);
  const { rows } = await db.query<{ id: string; kind: string; invitee: string | null; status: string; max_uses: number; use_count: number; expires_at: Date; created_at: Date }>(
    `select i.id, case when i.token_hash is null then 'direct' else 'link' end as kind, split_part(u.display_name, ' ', 1) as invitee,
            case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end as status,
            i.max_uses, i.use_count, i.expires_at, i.created_at
       from travel_group_invitations i left join users u on u.id = i.invited_user_id where i.group_id = $1 order by i.created_at desc`,
    [groupId],
  );
  return rows;
}

export async function revokeInvitation(db: Queryable, actor: Actor | null, invitationId: string) {
  if (!uuid.safeParse(invitationId).success) throw new NotFoundError();
  const { rows } = await db.query<{ group_id: string }>("select group_id from travel_group_invitations where id = $1", [invitationId]);
  if (!rows[0]) throw new NotFoundError();
  const { actor: a } = await requireOrganizer(db, actor, rows[0].group_id);
  await db.query("update travel_group_invitations set status = 'revoked' where id = $1 and status = 'pending'", [invitationId]);
  await event(db, rows[0].group_id, a.userId, "membership", "invitation_revoked");
}

export async function respondToInvitation(db: Db, actor: Actor | null, invitationId: string, decision: "accept" | "decline") {
  const a = requireActor(actor);
  if (!uuid.safeParse(invitationId).success) throw new NotFoundError();
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; group_id: string; status: string; expires_at: Date }>(
      "select id, group_id, status, expires_at from travel_group_invitations where id = $1 and invited_user_id = $2 for update",
      [invitationId, a.userId],
    );
    const inv = rows[0];
    if (!inv) throw new NotFoundError();
    if (inv.status !== "pending" || inv.expires_at <= new Date()) throw new UserError("This invitation is no longer valid.");
    if (decision === "decline") {
      await tx.query("update travel_group_invitations set status = 'declined' where id = $1", [inv.id]);
      return { groupId: inv.group_id };
    }
    await requireSocialEligibility(tx, a.userId);
    const group = await lockGroup(tx, inv.group_id);
    await activateMember(tx, group, a.userId);
    await tx.query("update travel_group_invitations set status = 'accepted', accepted_at = now(), use_count = 1 where id = $1", [inv.id]);
    await notifyMany(tx, await organizerIds(tx, group.id), {
      type: "group.member_joined",
      title: `Invitation accepted for ${group.name}`,
      body: "Someone you invited has joined the group.",
      link: `/travel-together/${group.id}/members`,
      dedupe: `group.invite.accepted:${inv.id}`,
    });
    return { groupId: group.id };
  });
}

/** Limited preview for someone holding an invite link (they may not be able to see a private group yet). */
export async function previewInviteLink(db: Queryable, token: string) {
  if (!token || token.length < 20) throw new NotFoundError("This invitation link is invalid.");
  const { rows } = await db.query<{ status: string; expires_at: Date; use_count: number; max_uses: number; name: string; start_date: string; end_date: string; destination: string; group_status: string }>(
    `select i.status, i.expires_at, i.use_count, i.max_uses, g.name, g.start_date, g.end_date, d.name as destination, g.status as group_status
       from travel_group_invitations i join travel_groups g on g.id = i.group_id join destinations d on d.id = g.destination_id
      where i.token_hash = $1`,
    [hashToken(token)],
  );
  const r = rows[0];
  if (!r) throw new NotFoundError("This invitation link is invalid.");
  const valid = r.status === "pending" && r.expires_at > new Date() && r.use_count < r.max_uses && r.group_status === "published";
  return { valid, name: r.name, startDate: r.start_date, endDate: r.end_date, destination: r.destination };
}

export async function acceptInviteLink(db: Db, actor: Actor | null, token: string) {
  const a = requireActor(actor);
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; group_id: string; status: string; expires_at: Date; use_count: number; max_uses: number }>(
      "select id, group_id, status, expires_at, use_count, max_uses from travel_group_invitations where token_hash = $1 for update",
      [hashToken(token)],
    );
    const inv = rows[0];
    if (!inv || inv.status !== "pending" || inv.expires_at <= new Date() || inv.use_count >= inv.max_uses) {
      throw new UserError("This invitation link has expired, been revoked or already been used.");
    }
    await requireSocialEligibility(tx, a.userId);
    const group = await lockGroup(tx, inv.group_id);
    if (await isBlockedBetween(tx, a.userId, group.organizer_user_id)) throw new UserError("You can't join this group.");
    await activateMember(tx, group, a.userId);
    const uses = inv.use_count + 1;
    await tx.query("update travel_group_invitations set use_count = $2, status = case when $2 >= max_uses then 'accepted' else status end, accepted_at = now() where id = $1", [inv.id, uses]);
    return { groupId: group.id };
  });
}

/** Members leave; organizers must hand over first (or cancel the group if they're alone). */
export async function leaveGroup(db: Db, actor: Actor | null, groupId: string) {
  await db.transaction(async (tx) => {
    const { actor: a, member } = await requireActiveMember(tx, actor, groupId);
    const group = await lockGroup(tx, groupId);
    if (member.role === "organizer") {
      throw new UserError((await activeCount(tx, groupId)) > 1 ? "Transfer the organizer role to another member before leaving." : "You're the only member. Cancel the group instead of leaving it.");
    }
    memberMachine.assert("active", "left");
    await tx.query("update travel_group_members set status = 'left', left_at = now(), role = 'member' where id = $1", [member.id]);
    await syncChatParticipant(tx, groupId, a.userId, null);
    await event(tx, groupId, a.userId, "membership", "member_left", a.userId);
    await notifyMany(tx, await organizerIds(tx, groupId), {
      type: "group.member_left",
      title: `A member left ${group.name}`,
      body: "A place has opened up in your group.",
      link: `/travel-together/${groupId}/members`,
      dedupe: `group.left:${member.id}:${Date.now()}`,
    });
  });
}

export async function removeMember(db: Db, actor: Actor | null, groupId: string, userId: string, opts: { ban: boolean; reason: string }) {
  if (opts.reason.trim().length < 3) throw new UserError("Record a short reason.");
  await db.transaction(async (tx) => {
    const { actor: a, member: me } = await requireOrganizer(tx, actor, groupId);
    const target = await membership(tx, groupId, userId);
    if (!target || target.status === "banned" || (!opts.ban && target.status !== "active")) throw new NotFoundError("Member not found.");
    if (target.role === "organizer") throw new UserError("The organizer can't be removed. Transfer the role first.");
    if (target.role === "co_organizer" && me.role !== "organizer") throw new ForbiddenError("Only the organizer can remove a co-organizer.");
    if (target.user_id === a.userId) throw new UserError("Use “Leave group” to leave.");
    const to = opts.ban ? "banned" : "removed";
    memberMachine.assert(target.status, to);
    await tx.query("update travel_group_members set status = $2, left_at = now(), role = 'member', status_reason = $3 where id = $1", [target.id, to, opts.reason.trim()]);
    await syncChatParticipant(tx, groupId, userId, null);
    await tx.query("update travel_group_join_requests set status = 'declined' where group_id = $1 and user_id = $2 and status = 'pending'", [groupId, userId]);
    await event(tx, groupId, a.userId, "membership", opts.ban ? "member_banned" : "member_removed", userId, { reason: opts.reason.trim() });
    await audit(tx, { actorId: a.userId, actorRole: "traveller", action: `travel_group.member_${to}`, entityType: "travel_group", entityId: groupId, reason: opts.reason, details: { userId } });
    const group = await loadGroup(tx, groupId);
    await notify(tx, {
      userId,
      type: "group.member_removed",
      title: `You were removed from ${group.name}`,
      body: "An organizer removed you from this group. If you think this was a mistake or feel unsafe, contact support.",
      link: "/travel-together/my-groups",
      dedupeKey: `group.removed:${target.id}:${Date.now()}`,
    });
  });
}

export async function setMemberRole(db: Db, actor: Actor | null, groupId: string, userId: string, role: "co_organizer" | "member") {
  await db.transaction(async (tx) => {
    const { actor: a } = await requireOrganizer(tx, actor, groupId, { ownerOnly: true });
    const target = await membership(tx, groupId, userId);
    if (!target || target.status !== "active" || target.role === "organizer") throw new NotFoundError("Member not found.");
    await tx.query("update travel_group_members set role = $2 where id = $1", [target.id, role]);
    await syncChatParticipant(tx, groupId, userId, role === "member" ? "group_member" : "group_organizer");
    await event(tx, groupId, a.userId, "membership", role === "co_organizer" ? "co_organizer_added" : "co_organizer_removed", userId);
  });
}

/** Hands the organizer role (and the shared plan) to another active member. */
export async function transferOwnership(db: Db, actor: Actor | null, groupId: string, userId: string) {
  await db.transaction(async (tx) => {
    const { actor: a, member: me } = await requireOrganizer(tx, actor, groupId, { ownerOnly: true });
    const group = await lockGroup(tx, groupId);
    const target = await membership(tx, groupId, userId);
    if (!target || target.status !== "active" || target.user_id === a.userId) throw new NotFoundError("Member not found.");
    await requireSocialEligibility(tx, userId);
    await tx.query("update travel_group_members set role = 'organizer' where id = $1", [target.id]);
    await tx.query("update travel_group_members set role = 'co_organizer' where id = $1", [me.id]);
    await tx.query("update travel_groups set organizer_user_id = $2 where id = $1", [groupId, userId]);
    if (group.trip_id) await tx.query("update trips set owner_id = $2 where id = $1", [group.trip_id, userId]);
    await syncChatParticipant(tx, groupId, userId, "group_organizer");
    await event(tx, groupId, a.userId, "membership", "ownership_transferred", userId);
    await notify(tx, {
      userId,
      type: "group.member_joined",
      title: `You're now the organizer of ${group.name}`,
      body: "The previous organizer handed the group over to you.",
      link: `/travel-together/${groupId}/members`,
      dedupeKey: `group.owner:${groupId}:${userId}:${Date.now()}`,
    });
  });
}

export async function listMembersForManagement(db: Queryable, actor: Actor | null, groupId: string) {
  const { actor: a, member } = await requireActiveMember(db, actor, groupId);
  const { rows } = await db.query<{ user_id: string; role: string; status: MemberStatus; joined_at: Date | null; left_at: Date | null }>(
    `select user_id, role, status, joined_at, left_at from travel_group_members where group_id = $1
      ${member.role === "member" ? "and status = 'active'" : ""}
      order by case status when 'active' then 0 else 1 end, case role when 'organizer' then 0 when 'co_organizer' then 1 else 2 end, joined_at`,
    [groupId],
  );
  const cards = await travellerCards(db, a.userId, rows.map((r) => r.user_id));
  const { rows: blocked } = await db.query<{ blocked_id: string }>("select blocked_id from user_blocks where blocker_id = $1", [a.userId]);
  const blockedSet = new Set(blocked.map((b) => b.blocked_id));
  return {
    viewerRole: member.role,
    members: rows.map((r) => ({ ...r, profile: cards.get(r.user_id)!, blockedByViewer: blockedSet.has(r.user_id) })),
  };
}

// ───────────────────────────── shared itinerary ─────────────────────────────

export const proposalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("experience"), slotId: z.string().uuid(), notes: z.string().trim().max(1000).nullable(), isOptional: z.boolean() }),
  z.object({ kind: z.literal("guide"), serviceId: z.string().uuid(), date: dateStr, startTime: z.string().regex(/^\d{2}:\d{2}$/), notes: z.string().trim().max(1000).nullable(), isOptional: z.boolean() }),
  z.object({ kind: z.literal("note"), title: z.string().trim().min(2).max(140), date: dateStr, notes: z.string().trim().max(1000).nullable(), isOptional: z.boolean() }),
]);

export async function createProposal(db: Db, actor: Actor | null, groupId: string, input: z.infer<typeof proposalSchema>) {
  const v = proposalSchema.parse(input);
  return db.transaction(async (tx) => {
    const { actor: a } = await requireActiveMember(tx, actor, groupId);
    const group = await loadGroup(tx, groupId);
    if (group.status !== "published") throw new UserError("Proposals are only possible in active groups.");
    await rateLimit(tx, `group.proposal:${a.userId}`, 30, 60, "You're proposing very quickly. Please wait a little.");

    let title: string;
    let dayDate: string;
    let fields: { experience_id: string | null; slot_id: string | null; guide_service_id: string | null; start_time: string | null } = {
      experience_id: null,
      slot_id: null,
      guide_service_id: null,
      start_time: null,
    };
    if (v.kind === "experience") {
      const { rows } = await tx.query<{ experience_id: string; title: string; starts_at: Date; timezone: string }>(
        `select s.experience_id, e.title, s.starts_at, d.timezone from experience_slots s join experiences e on e.id = s.experience_id
           join destinations d on d.id = e.destination_id join provider_profiles p on p.id = e.provider_id
          where s.id = $1 and s.status = 'open' and e.status = 'published' and p.status = 'approved'`,
        [v.slotId],
      );
      if (!rows[0]) throw new UserError("That time is no longer available.");
      title = rows[0].title;
      dayDate = toZoned(rows[0].starts_at, rows[0].timezone).date;
      fields = { ...fields, experience_id: rows[0].experience_id, slot_id: v.slotId, start_time: toZoned(rows[0].starts_at, rows[0].timezone).time };
    } else if (v.kind === "guide") {
      const { rows } = await tx.query<{ title: string; display_name: string }>(
        `select gs.title, p.display_name from guide_services gs join provider_profiles p on p.id = gs.provider_id
          where gs.id = $1 and gs.status = 'published' and p.status = 'approved'`,
        [v.serviceId],
      );
      if (!rows[0]) throw new UserError("That guide service isn't available.");
      title = `${rows[0].display_name}: ${rows[0].title}`;
      dayDate = v.date;
      fields = { ...fields, guide_service_id: v.serviceId, start_time: v.startTime };
    } else {
      title = v.title;
      dayDate = v.date;
    }
    if (dayDate < group.start_date || dayDate > group.end_date) throw new UserError("That falls outside the group's travel dates.");

    const status: ProposalStatus = group.approval_policy === "majority" ? "voting" : "proposed";
    const { rows } = await tx.query<{ id: string }>(
      `insert into travel_group_proposals (group_id, proposed_by, kind, experience_id, slot_id, guide_service_id, day_date, start_time, title, notes, is_optional, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [groupId, a.userId, v.kind, fields.experience_id, fields.slot_id, fields.guide_service_id, dayDate, fields.start_time, title, v.notes, v.isOptional, status],
    );
    const proposalId = rows[0].id;
    // The proposer's own support counts as a vote.
    await tx.query("insert into travel_group_activity_votes (proposal_id, user_id, vote) values ($1, $2, 'yes')", [proposalId, a.userId]);
    await event(tx, groupId, a.userId, "itinerary", "proposal_created", null, { proposalId, title });
    await notifyMany(tx, (await activeMemberIds(tx, groupId)).filter((u) => u !== a.userId), {
      type: "group.proposal",
      title: `New idea for ${group.name}`,
      body: `${title} on ${dayDate}. ${status === "voting" ? "Cast your vote." : "Share your view; an organizer will decide."}`,
      link: `/travel-together/${groupId}/itinerary`,
      dedupe: `group.proposal:${proposalId}`,
    });
    await settleVoting(tx, group, proposalId, a.userId);
    return { id: proposalId };
  });
}

async function loadProposal(db: Queryable, proposalId: string, forUpdate = false) {
  if (!uuid.safeParse(proposalId).success) throw new NotFoundError();
  const { rows } = await db.query<{
    id: string;
    group_id: string;
    proposed_by: string;
    kind: "experience" | "guide" | "note";
    slot_id: string | null;
    guide_service_id: string | null;
    day_date: string;
    start_time: string | null;
    title: string;
    notes: string | null;
    status: ProposalStatus;
    itinerary_item_id: string | null;
  }>(`select * from travel_group_proposals where id = $1 ${forUpdate ? "for update" : ""}`, [proposalId]);
  if (!rows[0]) throw new NotFoundError();
  return rows[0];
}

/** Applies the majority rule after a vote. Votes never create reservations or charge anyone. */
async function settleVoting(tx: Queryable, group: GroupRow, proposalId: string, actorId: string) {
  const p = await loadProposal(tx, proposalId, true);
  if (p.status !== "voting") return p.status;
  const { rows } = await tx.query<{ yes: number; no: number }>(
    `select count(*) filter (where v.vote = 'yes')::int as yes, count(*) filter (where v.vote = 'no')::int as no
       from travel_group_activity_votes v join travel_group_members m on m.user_id = v.user_id and m.group_id = $2 and m.status = 'active'
      where v.proposal_id = $1`,
    [proposalId, group.id],
  );
  const outcome = votingOutcome(group.approval_policy, rows[0].yes, rows[0].no, await activeCount(tx, group.id));
  if (outcome === "approved") await approveProposal(tx, group, proposalId, actorId);
  if (outcome === "rejected") await closeProposal(tx, group, proposalId, actorId, "rejected");
  return outcome;
}

/** Adds an approved activity to the shared plan. Availability problems are surfaced, not hidden. */
async function approveProposal(tx: Queryable, group: GroupRow, proposalId: string, actorId: string) {
  const p = await loadProposal(tx, proposalId, true);
  proposalMachine.assert(p.status, "approved");
  let itemId: string | null = null;
  let warning: string | null = null;
  const trip = (await tx.query<TripRow>("select * from trips where id = $1", [group.trip_id])).rows[0];
  await tx.query("savepoint add_item");
  try {
    if (p.kind === "experience") itemId = (await insertExperienceItem(tx, trip, { slotId: p.slot_id! })).id;
    else {
      const { rows: day } = await tx.query<{ id: string }>("select id from itinerary_days where trip_id = $1 and date = $2", [trip.id, p.day_date]);
      if (!day[0]) throw new UserError("That day is no longer part of the trip.");
      itemId =
        p.kind === "guide"
          ? (await insertGuideItem(tx, trip.id, { serviceId: p.guide_service_id!, dayId: day[0].id, startTime: p.start_time! })).id
          : (await insertNoteItem(tx, trip.id, { dayId: day[0].id, title: p.title, notes: p.notes })).id;
    }
    await tx.query("release savepoint add_item");
  } catch (err) {
    await tx.query("rollback to savepoint add_item");
    if (!(err instanceof UserError)) throw err;
    warning = err.message;
  }
  await tx.query("update travel_group_proposals set status = 'approved', decided_by = $2, decided_at = now(), itinerary_item_id = $3 where id = $1", [proposalId, actorId, itemId]);
  await event(tx, group.id, actorId, "itinerary", "proposal_approved", null, { proposalId, title: p.title, warning });
  await notifyMany(tx, await activeMemberIds(tx, group.id), {
    type: "group.proposal_decided",
    title: `Agreed: ${p.title}`,
    body: warning
      ? `The group agreed on this, but it couldn't be added to the plan: ${warning}`
      : "It's now in the group plan. Nothing has been booked or charged — book your place from the itinerary when you're ready.",
    link: `/travel-together/${group.id}/itinerary`,
    dedupe: `group.proposal.approved:${proposalId}`,
  });
}

async function closeProposal(tx: Queryable, group: GroupRow, proposalId: string, actorId: string, to: "rejected" | "cancelled") {
  const p = await loadProposal(tx, proposalId, true);
  proposalMachine.assert(p.status, to);
  if (p.itinerary_item_id) await tx.query("delete from itinerary_items where id = $1 and trip_id = $2", [p.itinerary_item_id, group.trip_id]);
  await tx.query("update travel_group_proposals set status = $2, decided_by = $3, decided_at = now(), itinerary_item_id = null where id = $1", [proposalId, to, actorId]);
  await event(tx, group.id, actorId, "itinerary", `proposal_${to}`, null, { proposalId, title: p.title });
  await notifyMany(tx, await activeMemberIds(tx, group.id), {
    type: "group.proposal_decided",
    title: `${to === "rejected" ? "Not going ahead" : "Cancelled"}: ${p.title}`,
    body: to === "rejected" ? "The group decided against this idea." : "This activity was removed from the group plan.",
    link: `/travel-together/${group.id}/itinerary`,
    dedupe: `group.proposal.${to}:${proposalId}`,
  });
}

export async function castVote(db: Db, actor: Actor | null, proposalId: string, vote: "yes" | "no") {
  return db.transaction(async (tx) => {
    const p = await loadProposal(tx, proposalId, true);
    const { actor: a } = await requireActiveMember(tx, actor, p.group_id);
    if (p.status !== "voting" && p.status !== "proposed") throw new UserError("Voting has closed for this proposal.");
    await tx.query(
      `insert into travel_group_activity_votes (proposal_id, user_id, vote) values ($1, $2, $3)
       on conflict (proposal_id, user_id) do update set vote = excluded.vote`,
      [proposalId, a.userId, vote],
    );
    const group = await lockGroup(tx, p.group_id);
    return settleVoting(tx, group, proposalId, a.userId);
  });
}

/** Organizer decisions. Under the majority policy organizers may only cancel, not overrule votes. */
export async function decideProposal(db: Db, actor: Actor | null, proposalId: string, decision: "approve" | "reject" | "cancel") {
  await db.transaction(async (tx) => {
    const p = await loadProposal(tx, proposalId, true);
    const group = await lockGroup(tx, p.group_id);
    const { actor: a, member } = await requireActiveMember(tx, actor, p.group_id);
    const isOrganizer = member.role !== "member";
    if (decision === "cancel") {
      if (!isOrganizer && p.proposed_by !== a.userId) throw new ForbiddenError("Only the proposer or an organizer can cancel this.");
      await closeProposal(tx, group, proposalId, a.userId, "cancelled");
      return;
    }
    if (!isOrganizer) throw new ForbiddenError("Only organizers can decide proposals.");
    if (group.approval_policy === "majority") throw new UserError("This group decides by majority vote. Organizers can cancel ideas but not overrule the vote.");
    if (decision === "approve") await approveProposal(tx, group, proposalId, a.userId);
    else await closeProposal(tx, group, proposalId, a.userId, "rejected");
  });
}

export async function commentOnProposal(db: Queryable, actor: Actor | null, proposalId: string, body: string) {
  const p = await loadProposal(db, proposalId);
  const { actor: a } = await requireActiveMember(db, actor, p.group_id);
  const text = body.trim();
  if (!text || text.length > 1000) throw new UserError("Comments must be 1–1000 characters.");
  await rateLimit(db, `group.comment:${a.userId}`, 30, 10, "You're commenting very quickly. Please wait a moment.");
  await db.query("insert into travel_group_proposal_comments (proposal_id, user_id, body) values ($1, $2, $3)", [proposalId, a.userId, text]);
}

export interface BookingSummary {
  confirmed: number;
  pending: number;
  mine: { status: string; bookingId: string } | null;
}

/**
 * Members-only view of the shared plan: the itinerary (with server-side schedule validation),
 * proposals with votes and comments, estimated costs and booking status per agreed activity.
 */
export async function getGroupItinerary(db: Queryable, actor: Actor | null, groupId: string) {
  const { actor: a, member } = await requireActiveMember(db, actor, groupId);
  const group = await loadGroup(db, groupId);
  const trip = (await db.query<TripRow>("select * from trips where id = $1", [group.trip_id])).rows[0];
  const graph = await loadTripGraph(db, trip);
  const members = await activeCount(db, groupId);
  // Validate as if every active member takes part, so capacity warnings reflect the real group.
  const issues = await validateTripGraph(db, { ...graph, trip: { ...graph.trip, adults: Math.max(1, members), children: 0 } });

  const { rows: proposals } = await db.query<{
    id: string;
    kind: "experience" | "guide" | "note";
    title: string;
    notes: string | null;
    day_date: string;
    start_time: string | null;
    is_optional: boolean;
    status: ProposalStatus;
    proposed_by: string;
    proposer: string;
    itinerary_item_id: string | null;
    slot_id: string | null;
    guide_service_id: string | null;
    yes: number;
    no: number;
    my_vote: "yes" | "no" | null;
    created_at: Date;
  }>(
    `select p.id, p.kind, p.title, p.notes, p.day_date, p.start_time, p.is_optional, p.status, p.proposed_by, split_part(u.display_name, ' ', 1) as proposer,
            p.itinerary_item_id, p.slot_id, p.guide_service_id, p.created_at,
            (select count(*)::int from travel_group_activity_votes v join travel_group_members m on m.user_id = v.user_id and m.group_id = p.group_id and m.status = 'active'
              where v.proposal_id = p.id and v.vote = 'yes') as yes,
            (select count(*)::int from travel_group_activity_votes v join travel_group_members m on m.user_id = v.user_id and m.group_id = p.group_id and m.status = 'active'
              where v.proposal_id = p.id and v.vote = 'no') as no,
            (select v.vote from travel_group_activity_votes v where v.proposal_id = p.id and v.user_id = $2) as my_vote
       from travel_group_proposals p join users u on u.id = p.proposed_by
      where p.group_id = $1 order by p.day_date, p.start_time nulls last, p.created_at`,
    [groupId, a.userId],
  );
  const { rows: comments } = await db.query<{ proposal_id: string; body: string; created_at: Date; author: string }>(
    `select c.proposal_id, c.body, c.created_at, split_part(u.display_name, ' ', 1) as author
       from travel_group_proposal_comments c join users u on u.id = c.user_id join travel_group_proposals p on p.id = c.proposal_id
      where p.group_id = $1 and not exists (select 1 from user_blocks b where b.blocker_id = $2 and b.blocked_id = c.user_id)
      order by c.created_at`,
    [groupId, a.userId],
  );

  // Booking status of agreed activities: active members' own bookings of the same slot / guide time.
  const { rows: bookingRows } = await db.query<{ itinerary_item_id: string; traveller_id: string; status: string; booking_id: string }>(
    `select gi.id as itinerary_item_id, b.traveller_id, b.status, b.id as booking_id
       from itinerary_items gi
       join booking_items bi on (bi.slot_id = gi.slot_id and gi.kind = 'experience')
                             or (gi.kind = 'guide' and bi.guide_service_id = gi.guide_service_id and bi.starts_at = gi.starts_at)
       join bookings b on b.id = bi.booking_id
       join trips t on t.id = b.trip_id and t.group_id = $1
       join travel_group_members m on m.group_id = $1 and m.user_id = b.traveller_id and m.status = 'active'
      where gi.trip_id = $2 and bi.status <> 'cancelled' and b.status not in ('cancelled', 'expired', 'provider_declined')`,
    [groupId, group.trip_id],
  );
  const bookings = new Map<string, BookingSummary>();
  for (const r of bookingRows) {
    const s = bookings.get(r.itinerary_item_id) ?? { confirmed: 0, pending: 0, mine: null };
    if (["confirmed", "in_progress", "completed"].includes(r.status)) s.confirmed++;
    else s.pending++;
    if (r.traveller_id === a.userId) s.mine = { status: r.status, bookingId: r.booking_id };
    bookings.set(r.itinerary_item_id, s);
  }

  // Estimated cost per person: per-person prices as-is, per-group prices shared across members.
  let perPersonMinor = 0;
  const itemCosts = new Map<string, number>();
  for (const i of graph.items) {
    if (!i.pricing || i.isOptional) continue;
    const cost = i.pricing.pricingModel === "per_person" ? i.pricing.basePriceMinor : Math.ceil(i.pricing.basePriceMinor / Math.max(1, members));
    itemCosts.set(i.id, cost);
    perPersonMinor += cost;
  }

  return {
    group: { id: group.id, name: group.name, startDate: group.start_date, endDate: group.end_date, approvalPolicy: group.approval_policy, status: group.status, currency: group.currency, minBudgetMinor: group.min_budget_minor, maxBudgetMinor: group.max_budget_minor, destinationId: group.destination_id },
    viewer: { userId: a.userId, role: member.role },
    activeMembers: members,
    graph,
    issues,
    proposals: proposals.map((p) => ({ ...p, comments: comments.filter((c) => c.proposal_id === p.id) })),
    bookings,
    itemCosts,
    perPersonMinor,
    plan: trip,
  };
}

/**
 * Hands an agreed activity to the normal booking engine. Per-person experiences are booked by each
 * traveller for themselves; per-group experiences and guides are booked by an organizer for the
 * whole group. Returns the trip to open in Journey Studio, where quote → request → payment applies.
 */
export async function prepareBooking(db: Db, actor: Actor | null, proposalId: string) {
  return db.transaction(async (tx) => {
    const p = await loadProposal(tx, proposalId);
    const { actor: a, member } = await requireActiveMember(tx, actor, p.group_id);
    if (p.status !== "approved" || !p.itinerary_item_id) throw new UserError("Only agreed activities in the plan can be booked.");
    if (p.kind === "note") throw new UserError("Notes don't need booking.");
    const group = await loadGroup(tx, p.group_id);
    const { rows: item } = await tx.query<{ pricing_model: string | null }>(
      `select coalesce(e.pricing_model, case when i.kind = 'guide' then 'per_group' end) as pricing_model
         from itinerary_items i left join experiences e on e.id = i.experience_id where i.id = $1`,
      [p.itinerary_item_id],
    );
    const forWholeGroup = item[0]?.pricing_model === "per_group";
    if (forWholeGroup && member.role === "member") {
      throw new ForbiddenError("This is booked once for the whole group by an organizer. Nobody is charged until an organizer books it.");
    }
    const purpose = forWholeGroup ? "group_booking" : "personal";
    const party = forWholeGroup ? await activeCount(tx, group.id) : 1;

    const { rows: existing } = await tx.query<TripRow>(
      "select * from trips where group_id = $1 and owner_id = $2 and group_purpose = $3 for update",
      [group.id, a.userId, purpose],
    );
    let trip = existing[0];
    if (trip && !["draft", "quoted"].includes(trip.status)) {
      throw new UserError("You already have a booking in progress for this group. Finish or cancel it from your bookings before adding more.");
    }
    if (!trip) {
      const { id } = await createTrip(tx, a, {
        title: `${group.name}${forWholeGroup ? " — group booking" : " — my bookings"}`.slice(0, 140),
        primaryDestinationId: group.destination_id,
        startDate: group.start_date,
        endDate: group.end_date,
        adults: party,
        children: 0,
        budgetMinor: null,
        interests: [],
        pace: group.travel_pace,
        tourType: "shared",
        languages: [group.language],
        accessibilityNotes: null,
        dietaryNotes: null,
        accommodationNotes: null,
        transportNotes: null,
      });
      await tx.query("update trips set group_id = $2, group_purpose = $3 where id = $1", [id, group.id, purpose]);
      trip = (await tx.query<TripRow>("select * from trips where id = $1", [id])).rows[0];
    } else if (forWholeGroup && trip.adults !== party) {
      await tx.query("update trips set adults = $2, status = 'draft' where id = $1", [trip.id, party]);
    }

    const { rowCount: already } = await tx.query(
      `select 1 from itinerary_items mine join itinerary_items plan on plan.id = $2
        where mine.trip_id = $1 and ((mine.kind = 'experience' and mine.slot_id = plan.slot_id)
           or (mine.kind = 'guide' and mine.guide_service_id = plan.guide_service_id and mine.starts_at = plan.starts_at))`,
      [trip.id, p.itinerary_item_id],
    );
    if (!already) {
      if (p.kind === "experience") await insertExperienceItem(tx, trip, { slotId: p.slot_id! });
      else {
        const { rows: day } = await tx.query<{ id: string }>("select id from itinerary_days where trip_id = $1 and date = $2", [trip.id, p.day_date]);
        await insertGuideItem(tx, trip.id, { serviceId: p.guide_service_id!, dayId: day[0].id, startTime: p.start_time! });
      }
      if (trip.status === "quoted") await tx.query("update trips set status = 'draft' where id = $1", [trip.id]);
    }
    await event(tx, group.id, a.userId, "itinerary", "booking_started", null, { proposalId, forWholeGroup });
    return { tripId: trip.id, forWholeGroup };
  });
}

// ───────────────────────────── chat ─────────────────────────────

export async function getGroupChat(db: Queryable, actor: Actor | null, groupId: string) {
  const { actor: a, member } = await requireActiveMember(db, actor, groupId);
  const conv = await groupConversationId(db, groupId);
  if (!conv) throw new NotFoundError();
  const { rowCount } = await db.query("select 1 from conversation_participants where conversation_id = $1 and user_id = $2", [conv, a.userId]);
  if (!rowCount) throw new NotFoundError();
  const { rows } = await db.query<{ id: string; body: string; kind: string; created_at: Date; sender_id: string; sender_name: string; hidden: boolean }>(
    `select m.id, case when m.hidden_at is null then m.body else '' end as body, m.kind, m.created_at, m.sender_id,
            split_part(u.display_name, ' ', 1) as sender_name, m.hidden_at is not null as hidden
       from messages m join users u on u.id = m.sender_id
      where m.conversation_id = $1
        and not exists (select 1 from user_blocks b where b.blocker_id = $2 and b.blocked_id = m.sender_id)
      order by m.created_at desc limit 200`,
    [conv, a.userId],
  );
  await db.query("update conversation_participants set last_read_at = now() where conversation_id = $1 and user_id = $2", [conv, a.userId]);
  const group = await loadGroup(db, groupId);
  return { conversationId: conv, groupName: group.name, viewerId: a.userId, viewerRole: member.role, messages: rows.reverse() };
}

export async function sendGroupMessage(db: Queryable, actor: Actor | null, groupId: string, body: string, kind: "text" | "announcement") {
  const { actor: a, member } = await requireActiveMember(db, actor, groupId);
  const text = body.trim();
  if (!text) throw new UserError("Write a message first.");
  if (text.length > 4000) throw new UserError("Messages can be up to 4000 characters.");
  if (kind === "announcement" && member.role === "member") throw new ForbiddenError("Only organizers can post announcements.");
  const group = await loadGroup(db, groupId);
  if (group.status === "suspended" || group.status === "cancelled") throw new UserError("This group's chat is closed.");
  const conv = await groupConversationId(db, groupId);
  if (!conv) throw new NotFoundError();
  await rateLimit(db, `group.message:${a.userId}`, 20, 1, "You're sending messages too quickly. Please wait a moment.");
  const { rows } = await db.query<{ id: string }>("insert into messages (conversation_id, sender_id, body, kind) values ($1, $2, $3, $4) returning id", [conv, a.userId, text, kind]);
  if (kind === "announcement") {
    await notifyMany(db, (await activeMemberIds(db, groupId)).filter((u) => u !== a.userId), {
      type: "group.announcement",
      title: `Announcement in ${group.name}`,
      body: text.slice(0, 200),
      link: `/travel-together/${groupId}/chat`,
      dedupe: `group.announcement:${rows[0].id}`,
    });
  }
}

export async function listGroupConversations(db: Queryable, actor: Actor | null) {
  const a = requireActor(actor);
  const { rows } = await db.query<{ group_id: string; name: string; last_body: string | null; last_at: Date | null; unread: number; start_date: string }>(
    `select g.id as group_id, g.name, g.start_date,
            (select case when m.hidden_at is null then m.body else 'Message removed' end from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as last_body,
            (select max(m.created_at) from messages m where m.conversation_id = c.id) as last_at,
            (select count(*)::int from messages m where m.conversation_id = c.id and m.sender_id <> $1 and (cp.last_read_at is null or m.created_at > cp.last_read_at)) as unread
       from conversations c
       join conversation_participants cp on cp.conversation_id = c.id and cp.user_id = $1
       join travel_groups g on g.id = c.group_id
       join travel_group_members tm on tm.group_id = g.id and tm.user_id = $1 and tm.status = 'active'
      order by last_at desc nulls last, g.start_date`,
    [a.userId],
  );
  return rows;
}

/** Organizers (in their own group) and admins can hide a message; the action is recorded. */
export async function hideGroupMessage(db: Queryable, actor: Actor | null, messageId: string, reason: string) {
  const a = requireActor(actor);
  if (!uuid.safeParse(messageId).success) throw new NotFoundError();
  const { rows } = await db.query<{ group_id: string }>("select c.group_id from messages m join conversations c on c.id = m.conversation_id where m.id = $1 and c.group_id is not null", [messageId]);
  const groupId = rows[0]?.group_id;
  if (!groupId) throw new NotFoundError();
  if (!isAdmin(a)) await requireOrganizer(db, a, groupId);
  await db.query("update messages set hidden_at = now(), hidden_by = $2 where id = $1 and hidden_at is null", [messageId, a.userId]);
  await event(db, groupId, a.userId, "moderation", "message_hidden", null, { messageId, reason });
  await audit(db, { actorId: a.userId, actorRole: isAdmin(a) ? "admin" : "traveller", action: "travel_group.message_hidden", entityType: "message", entityId: messageId, reason });
}

// ───────────────────────────── blocking & reports ─────────────────────────────

export async function blockUser(db: Queryable, actor: Actor | null, userId: string) {
  const a = requireActor(actor);
  if (!uuid.safeParse(userId).success || userId === a.userId) throw new UserError("You can't block that account.");
  await db.query("insert into user_blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing", [a.userId, userId]);
  // Pending invitations and requests between the two are withdrawn.
  await db.query(
    `update travel_group_invitations i set status = 'revoked' where status = 'pending' and
       ((i.invited_user_id = $2 and i.invited_by = $1) or (i.invited_user_id = $1 and i.invited_by = $2))`,
    [a.userId, userId],
  );
}

export async function unblockUser(db: Queryable, actor: Actor | null, userId: string) {
  const a = requireActor(actor);
  await db.query("delete from user_blocks where blocker_id = $1 and blocked_id = $2", [a.userId, userId]);
}

export async function listBlocked(db: Queryable, actor: Actor | null) {
  const a = requireActor(actor);
  const { rows } = await db.query<{ blocked_id: string; name: string; created_at: Date }>(
    "select b.blocked_id, split_part(u.display_name, ' ', 1) as name, b.created_at from user_blocks b join users u on u.id = b.blocked_id where b.blocker_id = $1 order by b.created_at desc",
    [a.userId],
  );
  return rows;
}

export const reportSchema = z.object({
  groupId: z.string().uuid().nullable(),
  reportedUserId: z.string().uuid().nullable(),
  messageId: z.string().uuid().nullable(),
  category: z.enum(["harassment", "scam", "impersonation", "safety", "spam", "inappropriate", "other"]),
  details: z.string().trim().min(10, "Tell us a little more (at least 10 characters)").max(4000),
});

/** Reports are visible only to staff. The reported person is never told who reported them. */
export async function submitReport(db: Queryable, actor: Actor | null, input: z.infer<typeof reportSchema>) {
  const a = requireActor(actor);
  const v = reportSchema.parse(input);
  if (!v.groupId && !v.reportedUserId && !v.messageId) throw new UserError("Choose what you're reporting.");
  await rateLimit(db, `group.report:${a.userId}`, 10, 60, "You've sent several reports recently. If you're in danger, contact local emergency services.");
  if (v.messageId) {
    const { rowCount } = await db.query(
      "select 1 from messages m join conversation_participants cp on cp.conversation_id = m.conversation_id and cp.user_id = $2 where m.id = $1",
      [v.messageId, a.userId],
    );
    if (!rowCount) throw new NotFoundError();
  }
  if (v.groupId) await canView(db, a, await loadGroup(db, v.groupId));
  const priority = v.category === "safety" ? "urgent" : v.category === "harassment" || v.category === "scam" || v.category === "impersonation" ? "high" : "normal";
  const { rows } = await db.query<{ id: string }>(
    `insert into travel_group_reports (reporter_id, group_id, reported_user_id, message_id, category, details, priority)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [a.userId, v.groupId, v.reportedUserId, v.messageId, v.category, v.details, priority],
  );
  return { id: rows[0].id };
}

// ───────────────────────────── admin ─────────────────────────────

export async function adminTravelOverview(db: Queryable) {
  const { rows } = await db.query<Record<string, number>>(
    `select
       (select count(*)::int from travel_groups where status = 'published' and end_date >= current_date) as active_groups,
       (select count(*)::int from travel_groups where status = 'published' and start_date > current_date) as upcoming_groups,
       (select count(*)::int from travel_groups where status = 'suspended') as suspended_groups,
       (select count(*)::int from travel_groups where status = 'cancelled') as cancelled_groups,
       (select count(*)::int from travel_groups where status = 'completed') as completed_groups,
       (select count(*)::int from travel_group_reports where status in ('open', 'investigating')) as open_reports,
       (select count(*)::int from travel_group_reports where status in ('open', 'investigating') and priority = 'urgent') as urgent_reports,
       (select count(*)::int from travel_group_join_requests where status = 'approved') as requests_approved,
       (select count(*)::int from travel_group_join_requests where status = 'declined') as requests_declined,
       (select count(*)::int from travel_group_members where status = 'active') as active_memberships,
       (select count(*)::int from travel_groups g where status = 'published' and
          (select count(*) from travel_group_members m where m.group_id = g.id and m.status = 'active') >= g.max_members) as full_groups`,
  );
  return rows[0];
}

export async function adminListGroups(db: Queryable, filter: "active" | "suspended" | "cancelled" | "all") {
  const where = { active: "g.status = 'published'", suspended: "g.status = 'suspended'", cancelled: "g.status = 'cancelled'", all: "true" }[filter];
  const { rows } = await db.query<{ id: string; name: string; status: string; visibility: string; start_date: string; end_date: string; organizer: string; members: number; max_members: number; reports: number; is_demo: boolean }>(
    `select g.id, g.name, g.status, g.visibility, g.start_date, g.end_date, u.display_name as organizer, g.max_members, g.is_demo,
            (select count(*)::int from travel_group_members m where m.group_id = g.id and m.status = 'active') as members,
            (select count(*)::int from travel_group_reports r where r.group_id = g.id and r.status in ('open', 'investigating')) as reports
       from travel_groups g join users u on u.id = g.organizer_user_id where ${where}
      order by reports desc, g.start_date limit 300`,
  );
  return rows;
}

export async function adminListReports(db: Queryable, status: "open" | "all") {
  const { rows } = await db.query<{ id: string; category: string; priority: string; status: string; created_at: Date; group_name: string | null; reported_name: string | null; has_message: boolean }>(
    `select r.id, r.category, r.priority, r.status, r.created_at, g.name as group_name, u.display_name as reported_name, r.message_id is not null as has_message
       from travel_group_reports r left join travel_groups g on g.id = r.group_id left join users u on u.id = r.reported_user_id
      where ($1 = 'all' or r.status in ('open', 'investigating'))
      order by case r.priority when 'urgent' then 0 when 'high' then 1 else 2 end, r.created_at`,
    [status],
  );
  return rows;
}

/** Full report context. Reading a reported message is itself audited. */
export async function adminGetReport(db: Queryable, actor: Actor, reportId: string) {
  if (!uuid.safeParse(reportId).success) throw new NotFoundError();
  const { rows } = await db.query<{
    id: string;
    category: string;
    priority: string;
    status: string;
    details: string;
    outcome: string | null;
    admin_notes: string | null;
    created_at: Date;
    resolved_at: Date | null;
    reporter_id: string;
    reporter_name: string;
    group_id: string | null;
    group_name: string | null;
    group_status: string | null;
    reported_user_id: string | null;
    reported_name: string | null;
    reported_status: string | null;
    message_id: string | null;
    message_body: string | null;
    message_hidden: boolean | null;
  }>(
    `select r.*, ru.display_name as reporter_name, g.name as group_name, g.status as group_status,
            tu.display_name as reported_name, tu.status as reported_status, m.body as message_body, m.hidden_at is not null as message_hidden
       from travel_group_reports r join users ru on ru.id = r.reporter_id left join travel_groups g on g.id = r.group_id
       left join users tu on tu.id = r.reported_user_id left join messages m on m.id = r.message_id
      where r.id = $1`,
    [reportId],
  );
  if (!rows[0]) throw new NotFoundError();
  if (rows[0].message_id) await audit(db, { actorId: actor.userId, actorRole: "admin", action: "travel_group.report_message_viewed", entityType: "travel_group_report", entityId: reportId });
  const { rows: history } = rows[0].group_id
    ? await db.query<{ action: string; category: string; created_at: Date; actor: string | null }>(
        "select e.action, e.category, e.created_at, u.display_name as actor from travel_group_events e left join users u on u.id = e.actor_id where e.group_id = $1 order by e.id desc limit 30",
        [rows[0].group_id],
      )
    : { rows: [] };
  return { ...rows[0], history };
}

export async function adminUpdateReport(db: Queryable, actor: Actor, reportId: string, input: { status: "open" | "investigating" | "resolved" | "dismissed"; outcome: string | null; adminNotes: string | null }) {
  const { rowCount } = await db.query(
    `update travel_group_reports set status = $2, outcome = coalesce($3, outcome), admin_notes = coalesce($4, admin_notes),
            resolved_by = case when $2 in ('resolved', 'dismissed') then $5::uuid else resolved_by end,
            resolved_at = case when $2 in ('resolved', 'dismissed') then now() else resolved_at end
      where id = $1`,
    [reportId, input.status, input.outcome, input.adminNotes, actor.userId],
  );
  if (!rowCount) throw new NotFoundError();
  await audit(db, { actorId: actor.userId, actorRole: "admin", action: `travel_group.report_${input.status}`, entityType: "travel_group_report", entityId: reportId, reason: input.outcome });
}

export async function adminSetGroupStatus(db: Db, actor: Actor, groupId: string, to: "suspended" | "published", reason: string) {
  if (reason.trim().length < 3) throw new UserError("A documented reason is required.");
  await db.transaction(async (tx) => {
    const group = await lockGroup(tx, groupId);
    groupMachine.assert(group.status, to);
    await tx.query("update travel_groups set status = $2, status_reason = $3 where id = $1", [groupId, to, reason.trim()]);
    await event(tx, groupId, actor.userId, "moderation", to === "suspended" ? "group_suspended" : "group_restored", null, { reason });
    await audit(tx, { actorId: actor.userId, actorRole: "admin", action: `travel_group.${to === "suspended" ? "suspended" : "restored"}`, entityType: "travel_group", entityId: groupId, reason });
    await notifyMany(tx, await activeMemberIds(tx, groupId), {
      type: "group.moderation",
      title: to === "suspended" ? `${group.name} has been paused` : `${group.name} is active again`,
      body: to === "suspended" ? "Our safety team has paused this group while it's reviewed. The chat and joining are closed meanwhile." : "Our safety team has finished its review and restored the group.",
      link: `/travel-together/${groupId}`,
      dedupe: `group.moderation:${groupId}:${to}:${Date.now()}`,
    });
  });
}

// ───────────────────────────── housekeeping job ─────────────────────────────

/** Idempotent: completes finished trips, expires stale invitations and requests. */
export async function travelGroupHousekeeping(db: Queryable) {
  const completed = await db.query(
    "update travel_groups set status = 'completed' where status = 'published' and end_date < $1 returning id",
    [today()],
  );
  const invites = await db.query("update travel_group_invitations set status = 'expired' where status = 'pending' and expires_at <= now()");
  const requests = await db.query(
    `update travel_group_join_requests r set status = 'expired' from travel_groups g
      where g.id = r.group_id and r.status = 'pending' and (g.start_date < $1 or g.status <> 'published')`,
    [today()],
  );
  return { completed: completed.rowCount, invitationsExpired: invites.rowCount, requestsExpired: requests.rowCount };
}
