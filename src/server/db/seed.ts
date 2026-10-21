import type { Db } from "./client";
import type { Actor } from "@/domain/authz";
import { joinOrRequest, saveGroup, saveTravelProfile } from "../services/travel-groups";
import { categories, destinations, demoGuides, demoOperators, demoExperiences } from "../../../db/seed-data";
import { hashPassword } from "../auth/password";
import { addDays, fromZoned, toZoned } from "@/lib/time";

export interface SeedOptions {
  /** Password for all seeded accounts. Development only. */
  password: string;
  /** Days of experience slots to generate from today. */
  slotDays?: number;
  now?: Date;
}

const slugify = (s: string) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function upsertUser(db: Db, email: string, name: string, passwordHash: string, roles: string[]): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into users (email, password_hash, display_name, email_verified_at) values ($1, $2, $3, now())
     on conflict ((lower(email))) do update set display_name = excluded.display_name returning id`,
    [email, passwordHash, name],
  );
  const id = rows[0].id;
  for (const role of roles) await db.query("insert into user_roles (user_id, role) values ($1, $2) on conflict do nothing", [id, role]);
  await db.query("insert into traveller_profiles (user_id) values ($1) on conflict do nothing", [id]);
  return id;
}

/** Idempotent development seed. */
export async function seed(db: Db, opts: SeedOptions) {
  const now = opts.now ?? new Date();
  const passwordHash = await hashPassword(opts.password);

  for (const [i, c] of categories.entries()) {
    await db.query(
      `insert into experience_categories (slug, name, description, sort_order) values ($1, $2, $3, $4)
       on conflict (slug) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order`,
      [c.slug, c.name, c.description, i],
    );
  }
  for (const [i, d] of destinations.entries()) {
    await db.query(
      `insert into destinations (slug, name, region, county, summary, description, latitude, longitude, travel_styles, best_time_to_visit, travel_info, art_variant, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (slug) do update set name = excluded.name, region = excluded.region, county = excluded.county, summary = excluded.summary,
         description = excluded.description, latitude = excluded.latitude, longitude = excluded.longitude, travel_styles = excluded.travel_styles,
         best_time_to_visit = excluded.best_time_to_visit, travel_info = excluded.travel_info, art_variant = excluded.art_variant, sort_order = excluded.sort_order`,
      [d.slug, d.name, d.region, d.county, d.summary, d.description, d.latitude, d.longitude, d.travelStyles, d.bestTimeToVisit, d.travelInfo, d.artVariant, i],
    );
  }
  const destId = new Map(
    (await db.query<{ id: string; slug: string }>("select id, slug from destinations")).rows.map((r) => [r.slug, r.id]),
  );
  const catId = new Map(
    (await db.query<{ id: string; slug: string }>("select id, slug from experience_categories")).rows.map((r) => [r.slug, r.id]),
  );

  const adminId = await upsertUser(db, "admin@demo.test", "Platform Admin", passwordHash, ["traveller", "admin"]);
  await upsertUser(db, "support@demo.test", "Support Agent", passwordHash, ["traveller", "support"]);
  await upsertUser(db, "traveller@demo.test", "Demo Traveller", passwordHash, ["traveller"]);

  const providerIds = new Map<string, string>();
  async function upsertProvider(
    email: string,
    kind: "guide" | "operator",
    p: { displayName: string; headline: string; bio: string; base: string; regions: string[]; languages?: string[]; specialties?: string[]; yearsExperience?: number },
  ) {
    const userId = await upsertUser(db, email, p.displayName, passwordHash, ["traveller", kind]);
    const { rows } = await db.query<{ id: string }>(
      `insert into provider_profiles (user_id, kind, display_name, slug, headline, bio, languages, specialties, years_experience, base_destination_id, status, is_demo, submitted_at, approved_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved',true, now(), now())
       on conflict (user_id) do update set display_name = excluded.display_name, headline = excluded.headline, bio = excluded.bio,
         languages = excluded.languages, specialties = excluded.specialties, years_experience = excluded.years_experience,
         base_destination_id = excluded.base_destination_id
       returning id`,
      [userId, kind, p.displayName, `${slugify(p.displayName)}-demo`, p.headline, p.bio, p.languages ?? ["English", "Swahili"], p.specialties ?? [], p.yearsExperience ?? null, destId.get(p.base)],
    );
    const id = rows[0].id;
    providerIds.set(email, id);
    for (const r of p.regions) {
      await db.query("insert into provider_regions (provider_id, destination_id) values ($1, $2) on conflict do nothing", [id, destId.get(r)]);
    }
    return id;
  }

  for (const g of demoGuides) {
    const id = await upsertProvider(g.email, "guide", g);
    await db.query("delete from availability_rules where provider_id = $1", [id]);
    for (const h of g.hours) {
      await db.query("insert into availability_rules (provider_id, weekday, start_time, end_time) values ($1, $2, $3, $4)", [id, h.weekday, h.start, h.end]);
    }
    for (const s of g.services) {
      const exists = await db.query("select 1 from guide_services where provider_id = $1 and title = $2", [id, s.title]);
      if (exists.rowCount) continue;
      await db.query(
        `insert into guide_services (provider_id, title, description, duration_minutes, pricing_model, base_price_minor, max_group_size, buffer_minutes,
                                     min_notice_hours, cancellation_policy, status, is_demo)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'published',true)`,
        [id, s.title, s.description, s.durationMinutes, s.pricingModel, s.priceKes * 100, s.maxGroupSize, s.bufferMinutes, s.minNoticeHours, s.policy],
      );
    }
  }
  for (const o of demoOperators) await upsertProvider(o.email, "operator", o);

  const slotDays = opts.slotDays ?? 60;
  const today = toZoned(now, "Africa/Nairobi").date;
  for (const e of demoExperiences) {
    const slug = `${slugify(e.title)}-demo`;
    const { rows } = await db.query<{ id: string }>(
      `insert into experiences (provider_id, destination_id, category_id, slug, title, summary, description, duration_minutes, pricing_model, base_price_minor,
                                child_price_minor, max_group_size, min_age, inclusions, exclusions, meeting_point, meeting_lat, meeting_lng, preparation_notes,
                                accessibility_notes, restrictions, cancellation_policy, min_notice_hours, travel_styles, status, is_demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'published',true)
       on conflict (slug) do update set title = excluded.title, summary = excluded.summary, description = excluded.description
       returning id`,
      [
        providerIds.get(e.operator), destId.get(e.destination), catId.get(e.category), slug, e.title, e.summary, e.description, e.durationMinutes,
        e.pricingModel, e.priceKes * 100, e.childPriceKes === null ? null : e.childPriceKes * 100, e.maxGroupSize, e.minAge, e.inclusions, e.exclusions,
        e.meetingPoint, e.meetingLat, e.meetingLng, e.preparationNotes, e.accessibilityNotes, e.restrictions, e.policy, e.minNoticeHours, e.styles,
      ],
    );
    const experienceId = rows[0].id;
    if (e.groupDiscount) {
      const exists = await db.query("select 1 from pricing_rules where experience_id = $1", [experienceId]);
      if (!exists.rowCount) {
        await db.query(
          "insert into pricing_rules (experience_id, kind, min_travellers, percent_off_bps, created_by) values ($1, 'group_discount', $2, $3, $4)",
          [experienceId, e.groupDiscount.minTravellers, e.groupDiscount.percentOffBps, adminId],
        );
      }
    }
    for (let i = 1; i <= slotDays; i++) {
      const date = addDays(today, i);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (!e.slotDays.includes(weekday as never)) continue;
      for (const t of e.slotTimes) {
        const startsAt = fromZoned(date, t, "Africa/Nairobi");
        await db.query(
          "insert into experience_slots (experience_id, starts_at, ends_at, capacity) values ($1, $2, $3, $4) on conflict (experience_id, starts_at) do nothing",
          [experienceId, startsAt, new Date(startsAt.getTime() + e.durationMinutes * 60_000), e.capacity],
        );
      }
    }
  }

  await seedDemoGroups(db, passwordHash, destId, today);
  return { adminId };
}

/** Demo Travel Together groups (flagged is_demo, organised by clearly named demo accounts). Idempotent. */
async function seedDemoGroups(db: Db, passwordHash: string, destId: Map<string, string>, today: string) {
  const { rowCount } = await db.query("select 1 from travel_groups where is_demo");
  if (rowCount) return;
  const asActor = (userId: string): Actor => ({ userId, roles: ["traveller"], providerId: null });
  const people = {
    traveller: asActor((await db.query<{ id: string }>("select id from users where lower(email) = 'traveller@demo.test'")).rows[0].id),
    amina: asActor(await upsertUser(db, "amina.demo@demo.test", "Amina (demo)", passwordHash, ["traveller"])),
    kip: asActor(await upsertUser(db, "kip.demo@demo.test", "Kip (demo)", passwordHash, ["traveller"])),
  };
  const profiles: [Actor, string, string[], "relaxed" | "balanced" | "adventurous"][] = [
    [people.traveller, "Demo traveller account for development.", ["wildlife", "photography"], "balanced"],
    [people.amina, "Fictional demo traveller. Loves wildlife photography and early starts.", ["wildlife", "photography", "nature"], "adventurous"],
    [people.kip, "Fictional demo traveller. Beach days, street food and good company.", ["beach", "food", "culture"], "relaxed"],
  ];
  for (const [actor, bio, interests, pace] of profiles) {
    await saveTravelProfile(db, actor, { bio, photoUrl: null, pace, destinationSlugs: [], pastTrips: null, visibility: "public", interests, adultConfirmed: true, acceptGuidelines: true });
  }
  const base = {
    language: "English",
    currency: "KES" as const,
    budgetIncludes: ["activities"] as ("activities")[],
    expenseStyle: "individual" as const,
    activityLevel: "moderate" as const,
    sharedTransport: "optional" as const,
    accommodation: "own" as const,
    arrivalNotes: null,
    communicationNotes: "Demo group — check the chat every couple of days.",
    cancellationNotes: null,
    bookingDeadline: null,
    approvalPolicy: "majority" as const,
  };
  const groups: [Actor, Parameters<typeof saveGroup>[3], Actor[]][] = [
    [people.traveller, { ...base, name: "Mara migration photography (demo)", description: "Demo group: four days chasing the light on the Mara with fellow photographers. Shared game drives, individual bookings.", destinationId: destId.get("maasai-mara")!, startDate: addDays(today, 20), endDate: addDays(today, 23), maxMembers: 6, visibility: "approval", interests: ["wildlife", "photography"], minBudgetMinor: 6_000_000, maxBudgetMinor: 12_000_000, travelPace: "adventurous", coverArt: "savanna" }, [people.amina]],
    [people.kip, { ...base, name: "Diani beach & snorkel weekend (demo)", description: "Demo group: a relaxed coastal weekend — snorkelling, a sunset dhow and plenty of seafood.", destinationId: destId.get("diani")!, startDate: addDays(today, 12), endDate: addDays(today, 14), maxMembers: 8, visibility: "public", interests: ["beach", "food"], minBudgetMinor: 2_500_000, maxBudgetMinor: 5_000_000, travelPace: "relaxed", coverArt: "coast" }, [people.amina]],
    [people.amina, { ...base, name: "Nairobi food & culture weekend (demo)", description: "Demo group: markets, street food and museums in Nairobi, with an early-morning park drive.", destinationId: destId.get("nairobi")!, startDate: addDays(today, 6), endDate: addDays(today, 7), maxMembers: 5, visibility: "public", interests: ["food", "culture", "wildlife"], minBudgetMinor: 1_000_000, maxBudgetMinor: 3_000_000, travelPace: "balanced", coverArt: "city" }, []],
  ];
  for (const [organizer, input, members] of groups) {
    const { id } = await saveGroup(db, organizer, null, input, "publish");
    await db.query("update travel_groups set is_demo = true where id = $1", [id]);
    for (const m of members) await joinOrRequest(db, m, id, "Demo request").catch(() => undefined);
  }
}
