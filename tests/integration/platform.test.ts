import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { actorFor, createTestDb, newTraveller, PASSWORD, makeTrip } from "./helpers";
import {
  authenticate,
  registerUser,
  requestPasswordReset,
  resetPassword,
  RateLimitedError,
  EmailTakenError,
  createSession,
  resolveSession,
} from "@/server/services/accounts";
import { listExperiences, listGuides, getGuide, listDestinations, getExperience } from "@/server/services/catalogue";
import { saveProviderProfile, submitForReview, recordVerification, decideProvider, saveExperience, getOwnProvider, uploadProviderDocument, setWeeklyHours, addAvailabilityException } from "@/server/services/providers";
import { notify, dispatchDeliveries } from "@/server/services/notifications";
import { postLedger, UnbalancedLedgerError } from "@/server/services/ledger";
import { updateTrip, getSharedTrip, setShareEnabled, duplicateTrip } from "@/server/services/trips";
import type { EmailAdapter } from "@/server/services/email";
import { UserError } from "@/server/errors";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { addDays, toZoned } from "@/lib/time";

let db: Db;
beforeAll(async () => {
  process.env.LOCAL_STORAGE_DIR = await mkdtemp(path.join(tmpdir(), "btd-uploads-"));
  db = await createTestDb();
});
afterAll(async () => db?.close());

describe("accounts", () => {
  it("registers, authenticates and rejects duplicates case-insensitively", async () => {
    await registerUser(db, { email: "Case@Example.test", password: PASSWORD, displayName: "Case", accountType: "traveller" });
    await expect(registerUser(db, { email: "case@example.TEST", password: PASSWORD, displayName: "Dup", accountType: "traveller" })).rejects.toThrow(EmailTakenError);
    expect(await authenticate(db, "case@example.test", PASSWORD, "1.1.1.1")).not.toBeNull();
    expect(await authenticate(db, "case@example.test", "wrong-password", "1.1.1.1")).toBeNull();
  });

  it("throttles repeated failed logins", async () => {
    await registerUser(db, { email: "throttle@example.test", password: PASSWORD, displayName: "T", accountType: "traveller" });
    for (let i = 0; i < 5; i++) expect(await authenticate(db, "throttle@example.test", "nope-nope-nope", `9.9.9.${i}`)).toBeNull();
    await expect(authenticate(db, "throttle@example.test", PASSWORD, "9.9.9.9")).rejects.toThrow(RateLimitedError);
  });

  it("resets passwords with single-use tokens and revokes sessions", async () => {
    const { userId } = await registerUser(db, { email: "reset@example.test", password: PASSWORD, displayName: "R", accountType: "traveller" });
    const { token: sessionToken } = await createSession(db, userId);
    await requestPasswordReset(db, "reset@example.test", "http://app");
    await requestPasswordReset(db, "nobody@example.test", "http://app"); // no error, no email
    const { rows } = await db.query<{ text_body: string }>("select text_body from email_messages where to_address = 'reset@example.test'");
    expect(rows).toHaveLength(1);
    const token = decodeURIComponent(/token=([^\s]+)/.exec(rows[0].text_body)![1]);
    expect(await resetPassword(db, token, "a-brand-new-password")).toBe(true);
    expect(await resetPassword(db, token, "another-password-1")).toBe(false);
    expect(await resolveSession(db, sessionToken)).toBeNull();
    expect(await authenticate(db, "reset@example.test", "a-brand-new-password", "2.2.2.2")).not.toBeNull();
    const none = await db.query("select 1 from email_messages where to_address = 'nobody@example.test'");
    expect(none.rowCount).toBe(0);
  });
});

describe("catalogue", () => {
  it("lists published destinations and filters experiences", async () => {
    const d = await listDestinations(db, { region: "Coast" });
    expect(d.items.map((x) => x.slug).sort()).toEqual(["diani", "lamu", "watamu"]);
    const marine = await listExperiences(db, { category: "beach-marine" });
    expect(marine.items.length).toBeGreaterThan(0);
    expect(marine.items.every((e) => e.category.slug === "beach-marine")).toBe(true);
    const search = await listExperiences(db, { q: "snorkelling" });
    expect(search.items.some((e) => e.title.includes("snorkelling"))).toBe(true);
    const exp = await getExperience(db, marine.items[0].slug);
    expect(exp?.slots.length).toBeGreaterThan(0);
    expect(exp?.reviews).toEqual([]);
    expect(exp?.provider.verified).toBe(false);
  });

  it("filters guides by real availability on a date", async () => {
    const tomorrowPlus = addDays(toZoned(new Date(), "Africa/Nairobi").date, 10);
    const all = await listGuides(db, { date: tomorrowPlus });
    const achieng = await actorFor(db, "guide.achieng@demo.test");
    await addAvailabilityException(db, achieng, { date: tomorrowPlus, kind: "unavailable", startTime: null, endTime: null, reason: "Leave" });
    const after = await listGuides(db, { date: tomorrowPlus });
    expect(after.total).toBe(all.total - (all.items.some((g) => g.name === "Achieng O.") ? 1 : 0));
    expect(after.items.some((g) => g.name === "Achieng O.")).toBe(false);
    const g = await getGuide(db, "achieng-o-demo");
    expect(g?.calendar.find((c) => c.date === tomorrowPlus)?.windows).toEqual([]);
    expect(g?.verified).toBe(false);
  });

  it("filters guides by language", async () => {
    const french = await listGuides(db, { language: "French" });
    expect(french.items.map((g) => g.name)).toEqual(["Njeri W."]);
  });
});

describe("provider onboarding", () => {
  it("requires documents and verification before approval, and only approved providers' listings are public", async () => {
    await registerUser(db, { email: "new.guide@example.test", password: PASSWORD, displayName: "New Guide", accountType: "guide" });
    const g = await actorFor(db, "new.guide@example.test");
    const naivasha = (await db.query<{ id: string }>("select id from destinations where slug = 'lake-naivasha'")).rows[0].id;
    await saveProviderProfile(db, g, {
      displayName: "Test Guide Person",
      headline: "Birding",
      bio: "I have guided birding walks around Lake Naivasha for many years and love sharing the lake with visitors from everywhere.",
      photoUrl: null,
      introVideoUrl: null,
      languages: ["English"],
      specialties: ["birding"],
      yearsExperience: 5,
      baseDestinationId: naivasha,
      regionIds: [naivasha],
    });
    const actor = await actorFor(db, "new.guide@example.test");
    await expect(submitForReview(db, actor)).rejects.toThrow(/identity document/);

    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], "id.pdf", { type: "application/pdf" });
    await uploadProviderDocument(db, actor, { docType: "national_id", file: pdf });
    await expect(
      uploadProviderDocument(db, actor, { docType: "tra_license", file: new File([new Uint8Array([0x4d, 0x5a, 0, 0])], "evil.pdf", { type: "application/pdf" }) }),
    ).rejects.toThrow(/PDF, JPEG/);
    await uploadProviderDocument(db, actor, { docType: "guide_certification", file: pdf });
    await submitForReview(db, actor);

    const admin = await actorFor(db, "admin@demo.test");
    const provider = (await getOwnProvider(db, actor))!;
    await expect(decideProvider(db, admin, provider.id, "approved", "Looks good")).rejects.toThrow(/identity verification/);
    await recordVerification(db, admin, provider.id, {
      verificationType: "identity",
      status: "passed",
      documentId: null,
      referenceNumber: null,
      notes: "Checked ID against applicant on video call",
      expiresAt: null,
    });
    await decideProvider(db, admin, provider.id, "approved", "Identity verified");

    await setWeeklyHours(db, actor, [{ weekday: 1, startTime: "08:00", endTime: "17:00" }]);
    const cat = (await db.query<{ id: string }>("select id from experience_categories where slug = 'nature'")).rows[0].id;
    const created = await saveExperience(db, actor, null, {
      title: "Dawn birding walk",
      summary: "A gentle early walk on the lakeshore.",
      description: "Walk the lakeshore at dawn looking for kingfishers, herons and fish eagles with an experienced guide.",
      destinationId: naivasha,
      categoryId: cat,
      durationMinutes: 120,
      pricingModel: "per_person",
      basePriceMinor: 200_000,
      childPriceMinor: null,
      maxGroupSize: 6,
      minAge: null,
      inclusions: [],
      exclusions: [],
      meetingPoint: "Lakeshore",
      meetingLat: null,
      meetingLng: null,
      preparationNotes: null,
      accessibilityNotes: null,
      restrictions: null,
      cancellationPolicy: "flexible",
      minNoticeHours: 24,
      travelStyles: [],
    });
    expect(created.status).toBe("draft");
    const publicList = await listExperiences(db, { q: "Dawn birding walk" });
    expect(publicList.items.find((e) => e.id === created.id)).toBeUndefined();
  });
});

describe("trips", () => {
  it("prevents date changes that would strand planned items and supports sharing and duplication", async () => {
    const traveller = await newTraveller(db);
    const trip = await makeTrip(db, traveller);
    const { addNoteItem } = await import("@/server/services/trips");
    const lastDay = (await db.query<{ id: string }>("select id from itinerary_days where trip_id = $1 order by date desc limit 1", [trip.id])).rows[0];
    await addNoteItem(db, traveller, trip.id, { dayId: lastDay.id, title: "Sunset drinks" });
    const base = {
      title: "Test trip",
      primaryDestinationId: null,
      startDate: trip.start,
      endDate: trip.start,
      adults: 2,
      children: 0,
      budgetMinor: null,
      interests: [],
      pace: "balanced" as const,
      tourType: "private" as const,
      languages: [],
      accessibilityNotes: null,
      dietaryNotes: null,
      accommodationNotes: null,
      transportNotes: null,
    };
    await expect(updateTrip(db, traveller, trip.id, base)).rejects.toThrow(UserError);
    await updateTrip(db, traveller, trip.id, { ...base, endDate: addDays(trip.end, 2) });
    const days = await db.query("select 1 from itinerary_days where trip_id = $1", [trip.id]);
    expect(days.rowCount).toBe(5);

    const token = await setShareEnabled(db, traveller, trip.id, true);
    const shared = await getSharedTrip(db, token!);
    expect(shared.days.flatMap((d) => d.items).map((i) => i.title)).toContain("Sunset drinks");
    expect(JSON.stringify(shared)).not.toContain("vegetarian");
    await setShareEnabled(db, traveller, trip.id, false);
    await expect(getSharedTrip(db, token!)).rejects.toThrow();

    const copy = await duplicateTrip(db, traveller, trip.id);
    const copied = await db.query("select 1 from itinerary_items where trip_id = $1", [copy.id]);
    expect(copied.rowCount).toBe(1);
  });
});

describe("notifications", () => {
  it("deduplicates events and retries failed deliveries", async () => {
    const traveller = await newTraveller(db);
    const input = { userId: traveller.userId, type: "booking.confirmed" as const, title: "Hi", body: "Body", dedupeKey: `test:${traveller.userId}` };
    await notify(db, input);
    await notify(db, input);
    const n = await db.query("select 1 from notifications where user_id = $1", [traveller.userId]);
    expect(n.rowCount).toBe(1);

    let calls = 0;
    const flaky: EmailAdapter = {
      id: "flaky",
      async send() {
        calls++;
        if (calls === 1) throw new Error("SMTP timeout");
        return { providerMessageId: "m-1" };
      },
    };
    const first = await dispatchDeliveries(db, { adapter: flaky, limit: 500 });
    expect(first.failed).toBeGreaterThanOrEqual(1);
    await db.query("update notification_deliveries set next_attempt_at = now() where status = 'pending'");
    await dispatchDeliveries(db, { adapter: flaky, limit: 500 });
    const d = await db.query<{ status: string; attempts: number }>(
      "select d.status, d.attempts from notification_deliveries d join notifications n on n.id = d.notification_id where n.user_id = $1",
      [traveller.userId],
    );
    expect(d.rows[0].status).toBe("sent");
  });
});

describe("ledger and database guarantees", () => {
  it("refuses unbalanced ledger transactions", async () => {
    await expect(postLedger(db, { type: "adjustment", currency: "KES", lines: [{ account: "cash", amountMinor: 100 }] })).rejects.toThrow(UnbalancedLedgerError);
  });

  it("keeps the ledger, audit log and status events append-only", async () => {
    await postLedger(db, {
      type: "adjustment",
      currency: "KES",
      lines: [
        { account: "cash", amountMinor: 100 },
        { account: "platform_revenue", amountMinor: -100 },
      ],
    });
    await expect(db.query("update ledger_entries set amount_minor = 1")).rejects.toThrow(/append-only/);
    await expect(db.query("delete from ledger_entries")).rejects.toThrow(/append-only/);
    await db.query("insert into audit_logs (actor_role, action, entity_type) values ('system', 'test', 'test')");
    await expect(db.query("delete from audit_logs")).rejects.toThrow(/append-only/);
  });

  it("enables row level security on every table", async () => {
    const { rows } = await db.query<{ relname: string }>(
      "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
    );
    expect(rows).toEqual([]);
  });
});
