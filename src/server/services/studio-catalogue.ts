import type { Queryable } from "../db/client";
import { listExperiences, listGuides, listGuideServices, type ExperienceCard, type GuideCard, type GuideServiceView } from "./catalogue";
import { addDays, fromZoned } from "@/lib/time";

export interface StudioSlot {
  id: string;
  startsAt: Date;
  endsAt: Date;
  remaining: number;
}

/** Open slots for the given experiences that fall within the trip dates (Nairobi time). */
async function slotsWithin(db: Queryable, experienceIds: string[], startDate: string, endDate: string) {
  const map = new Map<string, StudioSlot[]>();
  if (!experienceIds.length) return map;
  const { rows } = await db.query<{ experience_id: string; id: string; starts_at: Date; ends_at: Date; remaining: number }>(
    `select s.experience_id, s.id, s.starts_at, s.ends_at, s.capacity - s.reserved as remaining
       from experience_slots s join experiences e on e.id = s.experience_id
      where s.experience_id = any($1::uuid[]) and s.status = 'open' and s.reserved < s.capacity
        and s.starts_at >= $2 and s.starts_at < $3 and s.starts_at > now() + make_interval(hours => e.min_notice_hours)
      order by s.starts_at`,
    [experienceIds, fromZoned(startDate, "00:00"), fromZoned(addDays(endDate, 1), "00:00")],
  );
  for (const r of rows) map.set(r.experience_id, [...(map.get(r.experience_id) ?? []), { id: r.id, startsAt: r.starts_at, endsAt: r.ends_at, remaining: r.remaining }]);
  return map;
}

export interface StudioCatalogue {
  tab: "experiences" | "guides";
  experiences: (ExperienceCard & { slots: StudioSlot[] })[];
  guides: (GuideCard & { services: GuideServiceView[] })[];
  suggestions: (ExperienceCard & { slots: StudioSlot[] })[];
}

export async function studioCatalogue(
  db: Queryable,
  trip: { start_date: string; end_date: string; interests: string[]; adults: number; children: number },
  destinationSlugs: string[],
  f: { tab?: string; q?: string; destination?: string; category?: string },
): Promise<StudioCatalogue> {
  const tab = f.tab === "guides" ? "guides" : "experiences";
  const destination = f.destination || destinationSlugs[0];
  const party = trip.adults + trip.children;

  if (tab === "guides") {
    const { items } = await listGuides(db, { destination, party, interests: trip.interests });
    const guides = await Promise.all(items.slice(0, 8).map(async (g) => ({ ...g, services: await listGuideServices(db, g.id, { publishedOnly: true }) })));
    return { tab, experiences: [], guides, suggestions: [] };
  }

  const { items } = await listExperiences(db, { q: f.q || undefined, destination, category: f.category || undefined, pageSize: 12 });
  const slots = await slotsWithin(db, items.map((e) => e.id), trip.start_date, trip.end_date);
  const experiences = items.map((e) => ({ ...e, slots: slots.get(e.id) ?? [] }));

  // Rule-based suggestions: experiences at the trip's destinations matching stated interests.
  let suggestions: StudioCatalogue["suggestions"] = [];
  if (!f.q && !f.category && trip.interests.length) {
    const pool = new Map<string, ExperienceCard>();
    for (const slug of destinationSlugs.slice(0, 4)) {
      for (const e of (await listExperiences(db, { destination: slug, pageSize: 20 })).items) pool.set(e.id, e);
    }
    const { rows } = await db.query<{ id: string; travel_styles: string[] }>("select id, travel_styles from experiences where id = any($1::uuid[])", [[...pool.keys()]]);
    const interests = trip.interests.map((i) => i.toLowerCase());
    const matching = rows.filter((r) => r.travel_styles.some((s) => interests.includes(s.toLowerCase()))).map((r) => pool.get(r.id)!);
    const sSlots = await slotsWithin(db, matching.map((e) => e.id), trip.start_date, trip.end_date);
    suggestions = matching
      .map((e) => ({ ...e, slots: sSlots.get(e.id) ?? [] }))
      .filter((e) => e.slots.length > 0 && (e.pricingModel === "per_group" ? e.maxGroupSize >= party : e.slots.some((s) => s.remaining >= party)))
      .slice(0, 4);
  }
  return { tab, experiences, guides: [], suggestions };
}

/** Other open slots of the same experience on the same local day, for "change time". */
export async function alternativeSlots(db: Queryable, tripId: string): Promise<Record<string, StudioSlot[]>> {
  const { rows } = await db.query<{ item_id: string; id: string; starts_at: Date; ends_at: Date; remaining: number }>(
    `select i.id as item_id, s.id, s.starts_at, s.ends_at, s.capacity - s.reserved as remaining
       from itinerary_items i
       join experiences e on e.id = i.experience_id
       join destinations d on d.id = e.destination_id
       join experience_slots s on s.experience_id = i.experience_id and s.status = 'open'
        and (s.starts_at at time zone d.timezone)::date = (i.starts_at at time zone d.timezone)::date
      where i.trip_id = $1 and i.kind = 'experience' and s.starts_at > now()
      order by s.starts_at`,
    [tripId],
  );
  const out: Record<string, StudioSlot[]> = {};
  for (const r of rows) (out[r.item_id] ??= []).push({ id: r.id, startsAt: r.starts_at, endsAt: r.ends_at, remaining: r.remaining });
  return out;
}
