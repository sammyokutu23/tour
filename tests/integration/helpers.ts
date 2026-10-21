import { randomUUID } from "node:crypto";
import { createPgliteDb, migrate, type Db } from "@/server/db/client";
import { seed } from "@/server/db/seed";
import { registerUser, createSession, resolveSession } from "@/server/services/accounts";
import { createTrip, addExperienceItem, addGuideItem } from "@/server/services/trips";
import type { Actor } from "@/domain/authz";
import { addDays, toZoned } from "@/lib/time";

export const PASSWORD = "integration-password-1";

/** Fresh in-memory Postgres with migrations and seed data applied. */
export async function createTestDb(now = new Date()): Promise<Db> {
  const db = await createPgliteDb("memory://");
  await migrate(db);
  await seed(db, { password: PASSWORD, slotDays: 30, now });
  return db;
}

export async function actorFor(db: Db, email: string): Promise<Actor> {
  const { rows } = await db.query<{ id: string }>("select id from users where lower(email) = lower($1)", [email]);
  const { token } = await createSession(db, rows[0].id);
  const session = await resolveSession(db, token);
  return session!.actor;
}

export async function newTraveller(db: Db, name = "Test Traveller"): Promise<Actor> {
  const email = `t-${randomUUID()}@example.test`;
  await registerUser(db, { email, password: PASSWORD, displayName: name, accountType: "traveller" });
  return actorFor(db, email);
}

export const key = () => `k-${randomUUID()}`;

export function tripDates(now = new Date(), offsetDays = 7, length = 3) {
  const start = addDays(toZoned(now, "Africa/Nairobi").date, offsetDays);
  return { start, end: addDays(start, length - 1) };
}

export async function makeTrip(db: Db, actor: Actor, opts: { offsetDays?: number; adults?: number; children?: number } = {}) {
  const { start, end } = tripDates(new Date(), opts.offsetDays ?? 7);
  const { id } = await createTrip(db, actor, {
    title: "Test trip",
    primaryDestinationId: null,
    startDate: start,
    endDate: end,
    adults: opts.adults ?? 2,
    children: opts.children ?? 0,
    budgetMinor: null,
    interests: [],
    pace: "balanced",
    tourType: "private",
    languages: [],
    accessibilityNotes: null,
    dietaryNotes: "vegetarian",
    accommodationNotes: null,
    transportNotes: null,
  });
  return { id, start, end };
}

export async function firstSlotOn(db: Db, experienceSlug: string, date: string) {
  const { rows } = await db.query<{ id: string; starts_at: Date }>(
    `select s.id, s.starts_at from experience_slots s join experiences e on e.id = s.experience_id
      where e.slug = $1 and (s.starts_at at time zone 'Africa/Nairobi')::date = $2 order by s.starts_at limit 1`,
    [experienceSlug, date],
  );
  if (!rows[0]) throw new Error(`No slot for ${experienceSlug} on ${date}`);
  return rows[0];
}

export async function guideService(db: Db, guideEmail: string, title: string) {
  const { rows } = await db.query<{ id: string; provider_id: string }>(
    `select gs.id, gs.provider_id from guide_services gs join provider_profiles p on p.id = gs.provider_id join users u on u.id = p.user_id
      where u.email = $1 and gs.title = $2`,
    [guideEmail, title],
  );
  return rows[0];
}

let nextOffset = 3;
/** Each call gets a distinct start date (never a Saturday, the demo guide's day off). */
export function freshOffset(): number {
  for (;;) {
    const o = nextOffset++;
    if (o > 28) throw new Error("Ran out of distinct test dates; reduce guide bookings per test file");
    const date = addDays(toZoned(new Date(), "Africa/Nairobi").date, o);
    if (new Date(`${date}T12:00:00Z`).getUTCDay() !== 6) return o;
  }
}

/** A trip with one operator experience and one guide day (on the trip's first day). */
export async function tripWithGuideAndExperience(db: Db, traveller: Actor, offsetDays = freshOffset()) {
  const trip = await makeTrip(db, traveller, { offsetDays });
  const guideDay = (await db.query<{ id: string; date: string }>("select id, date from itinerary_days where trip_id = $1 order by date limit 1", [trip.id])).rows[0];
  const slot = await firstSlotOn(db, "lake-naivasha-boat-ride-demo", guideDay.date);
  await addExperienceItem(db, traveller, trip.id, { slotId: slot.id });
  const service = await guideService(db, "guide.achieng@demo.test", "Full-day private guiding");
  await addGuideItem(db, traveller, trip.id, { serviceId: service.id, dayId: guideDay.id, startTime: "08:00" });
  return { trip, guideDay, slot, service, offsetDays };
}
