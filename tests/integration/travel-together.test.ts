import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { actorFor, createTestDb, key, newTraveller } from "./helpers";
import {
  acceptInviteLink,
  adminGetReport,
  adminSetGroupStatus,
  adminUpdateReport,
  blockUser,
  castVote,
  createInviteLink,
  createProposal,
  decideProposal,
  discoverGroups,
  getGroup,
  getGroupChat,
  getGroupItinerary,
  inviteByEmail,
  joinOrRequest,
  leaveGroup,
  prepareBooking,
  removeMember,
  respondToInvitation,
  revokeInvitation,
  reviewRequest,
  saveGroup,
  saveTravelProfile,
  sendGroupMessage,
  submitReport,
  transferOwnership,
  travelGroupHousekeeping,
  type GroupInput,
} from "@/server/services/travel-groups";
import { quoteTrip, getStudioView } from "@/server/services/trips";
import { requestBooking } from "@/server/services/bookings";
import { startEnquiry } from "@/server/services/community";
import { dispatchDeliveries } from "@/server/services/notifications";
import type { EmailAdapter } from "@/server/services/email";
import { ForbiddenError, NotFoundError, type Actor } from "@/domain/authz";
import { UserError } from "@/server/errors";
import { addDays, toZoned } from "@/lib/time";

let db: Db;
let admin: Actor;
let destinations: Record<string, string>;
const start = addDays(toZoned(new Date(), "Africa/Nairobi").date, 10);

async function eligible(actor: Actor) {
  await saveTravelProfile(db, actor, {
    bio: null,
    photoUrl: null,
    pace: "balanced",
    destinationSlugs: ["lake-naivasha"],
    pastTrips: null,
    visibility: "members",
    interests: ["wildlife", "nature"],
    adultConfirmed: true,
    acceptGuidelines: true,
  });
  return actor;
}

async function traveller(name = "Traveller") {
  return eligible(await newTraveller(db, name));
}

function groupInput(over: Partial<GroupInput> = {}): GroupInput {
  return {
    name: "Naivasha birding weekend",
    description: "A relaxed long weekend of birding and boat rides around Lake Naivasha.",
    destinationId: destinations["lake-naivasha"],
    startDate: start,
    endDate: addDays(start, 2),
    maxMembers: 4,
    language: "English",
    visibility: "public",
    interests: ["wildlife", "nature"],
    currency: "KES",
    minBudgetMinor: 2_000_000,
    maxBudgetMinor: 4_000_000,
    budgetIncludes: ["activities"],
    expenseStyle: "individual",
    travelPace: "relaxed",
    activityLevel: "easy",
    sharedTransport: "optional",
    accommodation: "own",
    arrivalNotes: null,
    communicationNotes: null,
    cancellationNotes: null,
    bookingDeadline: null,
    approvalPolicy: "majority",
    coverArt: "lake",
    ...over,
  };
}

async function newGroup(organizer: Actor, over: Partial<GroupInput> = {}) {
  const { id } = await saveGroup(db, organizer, null, groupInput(over), "publish");
  return id;
}

beforeAll(async () => {
  db = await createTestDb();
  admin = await actorFor(db, "admin@demo.test");
  const { rows } = await db.query<{ slug: string; id: string }>("select slug, id from destinations");
  destinations = Object.fromEntries(rows.map((r) => [r.slug, r.id]));
});
afterAll(async () => db?.close());

describe("groups and discovery", () => {
  it("1–3. creates a group atomically; public groups are discoverable, private ones are not", async () => {
    const org = await traveller("Olive Organizer");
    const pub = await newGroup(org);
    const priv = await newGroup(org, { name: "Private friends trip", visibility: "private" });

    const { rows } = await db.query<{ trip_id: string; status: string }>("select trip_id, status from travel_groups where id = $1", [pub]);
    expect(rows[0].status).toBe("published");
    const members = await db.query("select 1 from travel_group_members where group_id = $1 and role = 'organizer' and status = 'active'", [pub]);
    expect(members.rowCount).toBe(1);
    const chat = await db.query("select 1 from conversations where group_id = $1", [pub]);
    expect(chat.rowCount).toBe(1);

    const visitorView = await discoverGroups(db, null, {});
    expect(visitorView.items.map((g) => g.id)).toContain(pub);
    expect(visitorView.items.map((g) => g.id)).not.toContain(priv);
  });

  it("requires adult confirmation and guidelines before creating groups", async () => {
    const t = await newTraveller(db);
    await expect(saveGroup(db, t, null, groupInput(), "publish")).rejects.toThrow(/18 or over/);
  });

  it("validates dates and budgets", async () => {
    const t = await traveller();
    await expect(saveGroup(db, t, null, groupInput({ endDate: addDays(start, -1) }), "publish")).rejects.toThrow();
    await expect(saveGroup(db, t, null, groupInput({ minBudgetMinor: 5_000_000, maxBudgetMinor: 1_000_000 }), "publish")).rejects.toThrow();
  });

  it("4. hides private group details from outsiders, even with the id", async () => {
    const org = await traveller();
    const priv = await newGroup(org, { visibility: "private" });
    const outsider = await traveller();
    await expect(getGroup(db, outsider, priv)).rejects.toThrow(NotFoundError);
    await expect(getGroup(db, null, priv)).rejects.toThrow(NotFoundError);
    await expect(joinOrRequest(db, outsider, priv, null)).rejects.toThrow(NotFoundError);
    await expect(getGroupItinerary(db, outsider, priv)).rejects.toThrow(NotFoundError);
  });

  it("explains matches with reasons", async () => {
    const org = await traveller();
    await newGroup(org, { name: "Matchable birding group" });
    const seeker = await traveller();
    const res = await discoverGroups(db, seeker, { from: start, to: addDays(start, 2), interests: ["wildlife"] });
    const card = res.items.find((g) => g.name === "Matchable birding group")!;
    expect(card.match?.label).toBeTruthy();
    expect(card.match?.reasons.join(" ")).toMatch(/Dates fit|overlapping/);
  });
});

describe("membership", () => {
  it("5–8. request → approve creates exactly one active membership; decline creates none", async () => {
    const org = await traveller();
    const g = await newGroup(org, { visibility: "approval" });
    const a = await traveller();
    const b = await traveller();
    expect(await joinOrRequest(db, a, g, "Hi! Keen birder.")).toBe("requested");
    await expect(joinOrRequest(db, a, g, null)).rejects.toThrow(/already asked/);
    expect(await joinOrRequest(db, b, g, null)).toBe("requested");

    const { rows } = await db.query<{ id: string; user_id: string }>("select id, user_id from travel_group_join_requests where group_id = $1 and status = 'pending'", [g]);
    const reqA = rows.find((r) => r.user_id === a.userId)!;
    const reqB = rows.find((r) => r.user_id === b.userId)!;

    await expect(reviewRequest(db, a, reqB.id, "approve", null)).rejects.toThrow(NotFoundError);
    await reviewRequest(db, org, reqA.id, "approve", null);
    await expect(reviewRequest(db, org, reqA.id, "approve", null)).rejects.toThrow(/already been answered/);
    await reviewRequest(db, org, reqB.id, "decline", "Group is quite set");

    const active = await db.query<{ user_id: string }>("select user_id from travel_group_members where group_id = $1 and status = 'active'", [g]);
    expect(active.rows.map((r) => r.user_id).sort()).toEqual([org.userId, a.userId].sort());
    const detail = await getGroup(db, a, g);
    expect(detail.memberCount).toBe(2);
    expect(detail.placesLeft).toBe(2);
  });

  it("9. a full group rejects additional joins", async () => {
    const org = await traveller();
    const g = await newGroup(org, { maxMembers: 2 });
    await joinOrRequest(db, await traveller(), g, null);
    await expect(joinOrRequest(db, await traveller(), g, null)).rejects.toThrow(/full/);
  });

  it("10. concurrent joins can never exceed capacity", async () => {
    const org = await traveller();
    const g = await newGroup(org, { maxMembers: 3 });
    const racers = await Promise.all(Array.from({ length: 6 }, () => traveller()));
    const results = await Promise.allSettled(racers.map((r) => joinOrRequest(db, r, g, null)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from travel_group_members where group_id = $1 and status = 'active'", [g]);
    expect(rows[0].n).toBe(3);
    // The database itself refuses an over-capacity insert, whatever the code path.
    await expect(db.query("insert into travel_group_members (group_id, user_id, role, status) values ($1, $2, 'member', 'active')", [g, admin.userId])).rejects.toThrow(/full/);
  });

  it("11. the last organizer can't leave or be removed without a handover", async () => {
    const org = await traveller();
    const g = await newGroup(org);
    const m = await traveller();
    await joinOrRequest(db, m, g, null);
    await expect(leaveGroup(db, org, g)).rejects.toThrow(/Transfer/);
    await expect(removeMember(db, m, g, org.userId, { ban: false, reason: "test" })).rejects.toThrow(ForbiddenError);
    await transferOwnership(db, org, g, m.userId);
    await leaveGroup(db, org, g);
    const detail = await getGroup(db, m, g);
    expect(detail.organizerUserId).toBe(m.userId);
    expect(detail.viewer.role).toBe("organizer");
  });

  it("19. invite links expire, can be revoked and respect their use limit", async () => {
    const org = await traveller();
    const g = await newGroup(org, { visibility: "private" });
    const token = await createInviteLink(db, org, g, { maxUses: 1, days: 7 });
    const first = await traveller();
    await acceptInviteLink(db, first, token);
    await expect(acceptInviteLink(db, await traveller(), token)).rejects.toThrow(/expired|used/);

    const token2 = await createInviteLink(db, org, g, { maxUses: 5, days: 7 });
    const { rows } = await db.query<{ id: string }>("select id from travel_group_invitations where group_id = $1 and status = 'pending' and token_hash is not null", [g]);
    await revokeInvitation(db, org, rows[0].id);
    await expect(acceptInviteLink(db, await traveller(), token2)).rejects.toThrow(/expired|revoked/);

    const token3 = await createInviteLink(db, org, g, { maxUses: 5, days: 7 });
    await db.query("update travel_group_invitations set expires_at = now() - interval '1 minute' where token_hash is not null and status = 'pending' and group_id = $1", [g]);
    await expect(acceptInviteLink(db, await traveller(), token3)).rejects.toThrow(/expired/);
    await travelGroupHousekeeping(db);
    const expired = await db.query("select 1 from travel_group_invitations where group_id = $1 and status = 'expired'", [g]);
    expect(expired.rowCount).toBeGreaterThan(0);
    // Raw tokens are never stored.
    const raw = await db.query("select 1 from travel_group_invitations where token_hash = $1", [token3]);
    expect(raw.rowCount).toBe(0);
  });

  it("direct invitations let a private-group invitee see and join", async () => {
    const org = await traveller();
    const g = await newGroup(org, { visibility: "private" });
    const { rows } = await db.query<{ email: string }>("select email from users u join travel_profiles tp on tp.user_id = u.id where u.id <> $1 limit 1", [org.userId]);
    const invitee = await traveller();
    const { rows: em } = await db.query<{ email: string }>("select email from users where id = $1", [invitee.userId]);
    void rows;
    await inviteByEmail(db, org, g, em[0].email);
    await inviteByEmail(db, org, g, "nobody-here@example.test"); // silently ignored, no enumeration
    const detail = await getGroup(db, invitee, g);
    expect(detail.viewer.invitationId).toBeTruthy();
    await respondToInvitation(db, invitee, detail.viewer.invitationId!, "accept");
    expect((await getGroup(db, invitee, g)).viewer.role).toBe("member");
  });
});

describe("itinerary collaboration", () => {
  async function groupWithMembers(n: number, policy: "majority" | "organizer" = "majority") {
    const org = await traveller();
    const g = await newGroup(org, { maxMembers: 6, approvalPolicy: policy });
    const members = [];
    for (let i = 0; i < n; i++) {
      const m = await traveller();
      await joinOrRequest(db, m, g, null);
      members.push(m);
    }
    return { org, g, members };
  }

  async function slotOn(slug: string, date: string) {
    const { rows } = await db.query<{ id: string }>(
      `select s.id from experience_slots s join experiences e on e.id = s.experience_id
        where e.slug = $1 and (s.starts_at at time zone 'Africa/Nairobi')::date = $2 order by s.starts_at limit 1`,
      [slug, date],
    );
    return rows[0].id;
  }

  it("14–16. one vote per member; majority approves and adds to the plan without booking anything", async () => {
    const { org, g, members } = await groupWithMembers(3); // 4 active members
    const slotId = await slotOn("kakamega-rainforest-walk-demo", start).catch(() => null);
    const naivasha = await slotOn("lake-naivasha-boat-ride-demo", start);
    void slotId;
    const { id } = await createProposal(db, members[0], g, { kind: "experience", slotId: naivasha, notes: null, isOptional: false });
    await castVote(db, members[0], id, "yes"); // re-vote updates, not duplicates
    await castVote(db, members[1], id, "no");
    await castVote(db, members[1], id, "yes"); // changed mind
    const votes = await db.query("select 1 from travel_group_activity_votes where proposal_id = $1", [id]);
    expect(votes.rowCount).toBe(2);
    let it = await getGroupItinerary(db, org, g);
    expect(it.proposals.find((p) => p.id === id)!.status).toBe("voting"); // 2 of 4 is not a majority
    await castVote(db, members[2], id, "yes");
    it = await getGroupItinerary(db, org, g);
    const p = it.proposals.find((x) => x.id === id)!;
    expect(p.status).toBe("approved");
    expect(p.itinerary_item_id).toBeTruthy();
    expect(it.graph.items.some((i) => i.id === p.itinerary_item_id)).toBe(true);
    // Voting never reserves inventory or creates bookings.
    const holds = await db.query("select 1 from bookings b join trips t on t.id = b.trip_id where t.group_id = $1", [g]);
    expect(holds.rowCount).toBe(0);
    await expect(castVote(db, members[0], id, "no")).rejects.toThrow(/closed/);
  });

  it("organizer policy: votes are advisory and only organizers decide", async () => {
    const { org, g, members } = await groupWithMembers(2, "organizer");
    const { id } = await createProposal(db, members[0], g, { kind: "note", title: "Sunset drinks by the lake", date: start, notes: null, isOptional: true });
    await castVote(db, members[1], id, "yes");
    await expect(decideProposal(db, members[1], id, "approve")).rejects.toThrow(ForbiddenError);
    await decideProposal(db, org, id, "approve");
    const it = await getGroupItinerary(db, org, g);
    expect(it.proposals.find((p) => p.id === id)!.status).toBe("approved");
  });

  it("17. booking an agreed activity goes through the normal engine, which re-validates", async () => {
    const { org, g, members } = await groupWithMembers(1);
    const naivashaSlot = await slotOn("hells-gate-cycle-gorge-walk-demo", addDays(start, 1));
    const { id } = await createProposal(db, org, g, { kind: "experience", slotId: naivashaSlot, notes: null, isOptional: false });
    await castVote(db, members[0], id, "yes"); // 2/2 → approved
    const { tripId, forWholeGroup } = await prepareBooking(db, members[0], id);
    expect(forWholeGroup).toBe(false);
    // The group plan itself can never be quoted or booked.
    const plan = (await db.query<{ trip_id: string }>("select trip_id from travel_groups where id = $1", [g])).rows[0].trip_id;
    await expect(quoteTrip(db, org, plan)).rejects.toThrow(/shared plan/);
    // The member's personal trip books through the standard engine.
    const view = await getStudioView(db, members[0], tripId);
    expect(view.items).toHaveLength(1);
    const q = await quoteTrip(db, members[0], tripId);
    // Price changes after the quote are caught by the engine.
    await db.query("update experiences set base_price_minor = base_price_minor + 100 where slug = 'hells-gate-cycle-gorge-walk-demo'");
    await expect(requestBooking(db, members[0], { tripId, quoteVersionId: q.versionId, idempotencyKey: key() })).rejects.toThrow(/Prices changed/);
    await db.query("update experiences set base_price_minor = base_price_minor - 100 where slug = 'hells-gate-cycle-gorge-walk-demo'");
    const q2 = await quoteTrip(db, members[0], tripId);
    const booking = await requestBooking(db, members[0], { tripId, quoteVersionId: q2.versionId, idempotencyKey: key() });
    const it = await getGroupItinerary(db, members[0], g);
    const agreed = it.proposals.find((p) => p.id === id)!;
    expect(it.bookings.get(agreed.itinerary_item_id!)?.mine?.bookingId).toBe(booking.bookingId);
  });

  it("per-group items can only be booked by an organizer for the whole party", async () => {
    const { org, g, members } = await groupWithMembers(1);
    const boat = await slotOn("lake-naivasha-boat-ride-demo", addDays(start, 2));
    const { id } = await createProposal(db, org, g, { kind: "experience", slotId: boat, notes: null, isOptional: false });
    await castVote(db, members[0], id, "yes");
    await expect(prepareBooking(db, members[0], id)).rejects.toThrow(ForbiddenError);
    const res = await prepareBooking(db, org, id);
    expect(res.forWholeGroup).toBe(true);
    const { rows } = await db.query<{ adults: number }>("select adults from trips where id = $1", [res.tripId]);
    expect(rows[0].adults).toBe(2);
  });
});

describe("chat, blocking, reports and moderation", () => {
  it("13 & 18. only active members can read chat; leavers lose access", async () => {
    const org = await traveller();
    const g = await newGroup(org);
    const m = await traveller();
    await joinOrRequest(db, m, g, null);
    await sendGroupMessage(db, m, g, "Hello everyone!", "text");
    await expect(sendGroupMessage(db, m, g, "I'm the boss", "announcement")).rejects.toThrow(ForbiddenError);
    const outsider = await traveller();
    await expect(getGroupChat(db, outsider, g)).rejects.toThrow(NotFoundError);
    await expect(sendGroupMessage(db, outsider, g, "spam", "text")).rejects.toThrow(NotFoundError);
    expect((await getGroupChat(db, org, g)).messages.map((x) => x.body)).toContain("Hello everyone!");
    await leaveGroup(db, m, g);
    await expect(getGroupChat(db, m, g)).rejects.toThrow(NotFoundError);
    const part = await db.query("select 1 from conversation_participants cp join conversations c on c.id = cp.conversation_id where c.group_id = $1 and cp.user_id = $2", [g, m.userId]);
    expect(part.rowCount).toBe(0);
  });

  it("12. blocked users can't join the blocker's groups or start direct contact", async () => {
    const org = await traveller();
    const g = await newGroup(org);
    const pest = await traveller();
    await blockUser(db, org, pest.userId);
    await expect(joinOrRequest(db, pest, g, null)).rejects.toThrow(NotFoundError);
    const disc = await discoverGroups(db, pest, {});
    expect(disc.items.map((x) => x.id)).not.toContain(g);
    // Direct enquiries to a provider the user has blocked are refused too.
    const guide = await actorFor(db, "guide.achieng@demo.test");
    const { rows } = await db.query<{ id: string }>("select id from provider_profiles where user_id = $1", [guide.userId]);
    await blockUser(db, guide, pest.userId);
    await expect(startEnquiry(db, pest, rows[0].id, "hello")).rejects.toThrow(UserError);
  });

  it("removed and banned members lose access and can't rejoin when banned", async () => {
    const org = await traveller();
    const g = await newGroup(org);
    const m = await traveller();
    await joinOrRequest(db, m, g, null);
    await removeMember(db, org, g, m.userId, { ban: true, reason: "Harassing others" });
    await expect(getGroupChat(db, m, g)).rejects.toThrow(NotFoundError);
    await expect(joinOrRequest(db, m, g, null)).rejects.toThrow();
    const audit = await db.query("select 1 from audit_logs where action = 'travel_group.member_banned' and entity_id = $1", [g]);
    expect(audit.rowCount).toBe(1);
  });

  it("20. admins review reports, suspend groups and leave an audit trail", async () => {
    const org = await traveller();
    const g = await newGroup(org);
    const m = await traveller();
    await joinOrRequest(db, m, g, null);
    await sendGroupMessage(db, org, g, "Send me your M-Pesa PIN to confirm your place", "text");
    const chat = await getGroupChat(db, m, g);
    const msg = chat.messages.find((x) => x.body.includes("PIN"))!;
    const { id } = await submitReport(db, m, { groupId: g, reportedUserId: org.userId, messageId: msg.id, category: "scam", details: "The organizer asked for my M-Pesa PIN." });
    const outsider = await traveller();
    await expect(submitReport(db, outsider, { groupId: null, reportedUserId: null, messageId: msg.id, category: "scam", details: "I can't even see this" })).rejects.toThrow(NotFoundError);

    const report = await adminGetReport(db, admin, id);
    expect(report.priority).toBe("high");
    expect(report.message_body).toContain("PIN");
    await adminSetGroupStatus(db, admin, g, "suspended", "Scam investigation");
    await expect(getGroup(db, outsider, g)).rejects.toThrow(NotFoundError);
    await expect(sendGroupMessage(db, m, g, "hello?", "text")).rejects.toThrow(/closed/);
    await adminUpdateReport(db, admin, id, { status: "resolved", outcome: "Organizer account restricted", adminNotes: "Confirmed scam attempt" });
    const trail = await db.query<{ action: string }>("select action from audit_logs where entity_id in ($1, $2) order by id", [id, g]);
    expect(trail.rows.map((r) => r.action)).toEqual(expect.arrayContaining(["travel_group.report_message_viewed", "travel_group.suspended", "travel_group.report_resolved"]));
  });

  it("21. notifications are not duplicated when jobs retry", async () => {
    const org = await traveller();
    const g = await newGroup(org, { visibility: "approval" });
    const m = await traveller();
    await joinOrRequest(db, m, g, "hello");
    const before = await db.query("select 1 from notifications where user_id = $1 and type = 'group.join_request'", [org.userId]);
    expect(before.rowCount).toBe(1);
    let sends = 0;
    const adapter: EmailAdapter = { id: "count", async send() { sends++; return { providerMessageId: null }; } };
    await dispatchDeliveries(db, { adapter, limit: 1000 });
    const first = sends;
    await dispatchDeliveries(db, { adapter, limit: 1000 });
    expect(sends).toBe(first);
  });
});
