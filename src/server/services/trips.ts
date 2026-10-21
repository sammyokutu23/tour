import { z } from "zod";
import type { Queryable } from "../db/client";
import { requireActor, NotFoundError, ForbiddenError, type Actor } from "@/domain/authz";
import { isTripEditable, tripMachine, type TripStatus } from "@/domain/states";
import { priceQuote, PricingError, type PriceableLine, type Quote } from "@/domain/pricing";
import { validateSchedule, hasBlockingIssues, type ScheduleIssue, type ScheduleItem } from "@/domain/scheduling";
import type { CancellationPolicy } from "@/domain/cancellation";
import { addDays, daysBetween, fromZoned, toZoned, DEFAULT_TZ, timeToMinutes } from "@/lib/time";
import { loadGuideAvailability, freeWindowsOn } from "./availability";
import { getSettings } from "./settings";
import { newToken } from "../auth/tokens";
import { UserError } from "../errors";
import type { ArtVariant, Media } from "./catalogue";

export const MAX_TRIP_DAYS = 30;

export const tripInputSchema = z
  .object({
    title: z.string().trim().min(1, "Give your trip a name").max(140),
    primaryDestinationId: z.string().uuid().nullable(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an arrival date"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a departure date"),
    adults: z.coerce.number().int().min(1, "At least one adult is required").max(60),
    children: z.coerce.number().int().min(0).max(60),
    budgetMinor: z.number().int().min(0).nullable(),
    interests: z.array(z.string().max(40)).max(12),
    pace: z.enum(["relaxed", "balanced", "adventurous"]),
    tourType: z.enum(["private", "shared"]),
    languages: z.array(z.string().max(40)).max(8),
    accessibilityNotes: z.string().max(1000).nullable(),
    dietaryNotes: z.string().max(1000).nullable(),
    accommodationNotes: z.string().max(1000).nullable(),
    transportNotes: z.string().max(1000).nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Departure must be on or after arrival" });
    else if (daysBetween(v.startDate, v.endDate) + 1 > MAX_TRIP_DAYS) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: `Trips can be up to ${MAX_TRIP_DAYS} days` });
    }
  });
export type TripInput = z.infer<typeof tripInputSchema>;

interface TripRow {
  id: string;
  owner_id: string;
  title: string;
  status: TripStatus;
  start_date: string;
  end_date: string;
  adults: number;
  children: number;
  budget_minor: number | null;
  currency: string;
  interests: string[];
  pace: "relaxed" | "balanced" | "adventurous";
  tour_type: "private" | "shared";
  languages: string[];
  accessibility_notes: string | null;
  dietary_notes: string | null;
  accommodation_notes: string | null;
  transport_notes: string | null;
  primary_destination_id: string | null;
  share_token: string | null;
  group_id: string | null;
  group_purpose: "plan" | "personal" | "group_booking" | null;
  updated_at: Date;
}

async function loadTripRow(db: Queryable, tripId: string, forUpdate = false): Promise<TripRow> {
  if (!z.string().uuid().safeParse(tripId).success) throw new NotFoundError("Trip not found.");
  const { rows } = await db.query<TripRow>(`select * from trips where id = $1 ${forUpdate ? "for update" : ""}`, [tripId]);
  if (!rows[0]) throw new NotFoundError("Trip not found.");
  return rows[0];
}

/** Loads a trip the actor owns. Non-owners get NotFound so trip ids can't be probed. */
export async function loadOwnedTrip(db: Queryable, actor: Actor | null, tripId: string, forUpdate = false): Promise<TripRow> {
  const a = requireActor(actor);
  const trip = await loadTripRow(db, tripId, forUpdate);
  if (trip.owner_id !== a.userId) throw new NotFoundError("Trip not found.");
  return trip;
}

/** Any edit on a quoted trip invalidates the quote. Edits are refused once a booking is in flight. */
async function loadEditableTrip(db: Queryable, actor: Actor | null, tripId: string): Promise<TripRow> {
  const trip = await loadOwnedTrip(db, actor, tripId, true);
  if (trip.group_purpose === "plan") {
    throw new UserError("This is a group's shared plan. Changes go through proposals in Travel Together.");
  }
  if (!isTripEditable(trip.status)) {
    throw new UserError("This itinerary has a booking in progress and can't be edited. Request a change instead.");
  }
  if (trip.status === "quoted") {
    tripMachine.assert("quoted", "draft");
    await db.query("update trips set status = 'draft' where id = $1", [trip.id]);
    trip.status = "draft";
  }
  return trip;
}

export async function ensureDays(db: Queryable, tripId: string, start: string, end: string, destinationId: string | null) {
  const count = daysBetween(start, end) + 1;
  for (let i = 0; i < count; i++) {
    await db.query(
      `insert into itinerary_days (trip_id, day_number, date, destination_id) values ($1, $2, $3, $4)
       on conflict (trip_id, date) do update set day_number = excluded.day_number`,
      [tripId, i + 1, addDays(start, i), destinationId],
    );
  }
}

export async function createTrip(db: Queryable, actor: Actor | null, input: TripInput): Promise<{ id: string }> {
  const a = requireActor(actor);
  const v = tripInputSchema.parse(input);
  const { rows } = await db.query<{ id: string }>(
    `insert into trips (owner_id, title, start_date, end_date, adults, children, budget_minor, interests, pace, tour_type, languages,
                        accessibility_notes, dietary_notes, accommodation_notes, transport_notes, primary_destination_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
    [
      a.userId, v.title, v.startDate, v.endDate, v.adults, v.children, v.budgetMinor, v.interests, v.pace, v.tourType, v.languages,
      v.accessibilityNotes, v.dietaryNotes, v.accommodationNotes, v.transportNotes, v.primaryDestinationId,
    ],
  );
  const id = rows[0].id;
  await db.query("insert into trip_members (trip_id, user_id, role) values ($1, $2, 'owner')", [id, a.userId]);
  await ensureDays(db, id, v.startDate, v.endDate, v.primaryDestinationId);
  return { id };
}

export async function updateTrip(db: Queryable, actor: Actor | null, tripId: string, input: TripInput): Promise<void> {
  const trip = await loadEditableTrip(db, actor, tripId);
  const v = tripInputSchema.parse(input);

  if (v.startDate !== trip.start_date || v.endDate !== trip.end_date) {
    const { rows: stranded } = await db.query<{ date: string; n: number }>(
      `select d.date, count(i.id)::int as n from itinerary_days d join itinerary_items i on i.day_id = d.id
        where d.trip_id = $1 and (d.date < $2 or d.date > $3) group by d.date order by d.date`,
      [tripId, v.startDate, v.endDate],
    );
    if (stranded.length) {
      throw new UserError(
        `These new dates would drop planned activities on ${stranded.map((s) => s.date).join(", ")}. Move or remove them first.`,
      );
    }
    await db.query("delete from itinerary_days where trip_id = $1 and (date < $2 or date > $3)", [tripId, v.startDate, v.endDate]);
    // Temporarily offset day numbers to avoid unique collisions while renumbering.
    await db.query("update itinerary_days set day_number = day_number + 1000 where trip_id = $1", [tripId]);
    await ensureDays(db, tripId, v.startDate, v.endDate, v.primaryDestinationId);
  }

  await db.query(
    `update trips set title=$2, start_date=$3, end_date=$4, adults=$5, children=$6, budget_minor=$7, interests=$8, pace=$9, tour_type=$10,
            languages=$11, accessibility_notes=$12, dietary_notes=$13, accommodation_notes=$14, transport_notes=$15, primary_destination_id=$16
      where id = $1`,
    [
      tripId, v.title, v.startDate, v.endDate, v.adults, v.children, v.budgetMinor, v.interests, v.pace, v.tourType, v.languages,
      v.accessibilityNotes, v.dietaryNotes, v.accommodationNotes, v.transportNotes, v.primaryDestinationId,
    ],
  );
}

async function loadDay(db: Queryable, tripId: string, dayId: string) {
  const { rows } = await db.query<{ id: string; date: string }>("select id, date from itinerary_days where id = $1 and trip_id = $2", [dayId, tripId]);
  if (!rows[0]) throw new NotFoundError("Day not found.");
  return rows[0];
}

async function nextPosition(db: Queryable, dayId: string): Promise<number> {
  const { rows } = await db.query<{ p: number }>("select coalesce(max(position), -1)::int + 1 as p from itinerary_items where day_id = $1", [dayId]);
  return rows[0].p;
}

async function loadPublicSlot(db: Queryable, slotId: string) {
  const { rows } = await db.query<{ id: string; experience_id: string; starts_at: Date; ends_at: Date; timezone: string; title: string }>(
    `select s.id, s.experience_id, s.starts_at, s.ends_at, d.timezone, e.title
       from experience_slots s
       join experiences e on e.id = s.experience_id
       join destinations d on d.id = e.destination_id
       join provider_profiles p on p.id = e.provider_id
      where s.id = $1 and s.status = 'open' and e.status = 'published' and p.status = 'approved'`,
    [slotId],
  );
  if (!rows[0]) throw new UserError("That time is no longer available.");
  return rows[0];
}

export async function addExperienceItem(db: Queryable, actor: Actor | null, tripId: string, input: { slotId: string; dayId?: string }) {
  const trip = await loadEditableTrip(db, actor, tripId);
  return insertExperienceItem(db, trip, input);
}

/**
 * Adds a published experience slot to a trip after date checks. Callers are responsible for
 * authorization (Studio edits use addExperienceItem; group proposals use the group service).
 */
export async function insertExperienceItem(db: Queryable, trip: Pick<TripRow, "id" | "start_date" | "end_date">, input: { slotId: string; dayId?: string }) {
  const tripId = trip.id;
  const slot = await loadPublicSlot(db, input.slotId);
  const slotDate = toZoned(slot.starts_at, slot.timezone).date;
  if (slotDate < trip.start_date || slotDate > trip.end_date) {
    throw new UserError(`${slot.title} on ${slotDate} falls outside the trip dates.`);
  }
  const { rows: days } = await db.query<{ id: string }>("select id from itinerary_days where trip_id = $1 and date = $2", [tripId, slotDate]);
  const day = days[0];
  if (!day) throw new UserError("No itinerary day exists for that date.");
  if (input.dayId && input.dayId !== day.id) {
    throw new UserError(`${slot.title} at that time happens on ${slotDate}; it has been placed on that day instead.`);
  }
  const { rows } = await db.query<{ id: string }>(
    `insert into itinerary_items (trip_id, day_id, position, kind, experience_id, slot_id, starts_at, ends_at)
     values ($1, $2, $3, 'experience', $4, $5, $6, $7) returning id`,
    [tripId, day.id, await nextPosition(db, day.id), slot.experience_id, slot.id, slot.starts_at, slot.ends_at],
  );
  return { id: rows[0].id, dayId: day.id };
}

async function loadPublicService(db: Queryable, serviceId: string) {
  const { rows } = await db.query<{ id: string; provider_id: string; duration_minutes: number; timezone: string; title: string; display_name: string }>(
    `select gs.id, gs.provider_id, gs.duration_minutes, p.timezone, gs.title, p.display_name
       from guide_services gs join provider_profiles p on p.id = gs.provider_id
      where gs.id = $1 and gs.status = 'published' and p.status = 'approved'`,
    [serviceId],
  );
  if (!rows[0]) throw new UserError("That guide service is not available.");
  return rows[0];
}

export async function addGuideItem(
  db: Queryable,
  actor: Actor | null,
  tripId: string,
  input: { serviceId: string; dayId: string; startTime: string },
) {
  await loadEditableTrip(db, actor, tripId);
  return insertGuideItem(db, tripId, input);
}

/** Adds guide time to a trip day. Callers are responsible for authorization. */
export async function insertGuideItem(db: Queryable, tripId: string, input: { serviceId: string; dayId: string; startTime: string }) {
  const day = await loadDay(db, tripId, input.dayId);
  const service = await loadPublicService(db, input.serviceId);
  const startsAt = fromZoned(day.date, input.startTime, service.timezone);
  const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60_000);
  const { rows } = await db.query<{ id: string }>(
    `insert into itinerary_items (trip_id, day_id, position, kind, guide_service_id, starts_at, ends_at, title)
     values ($1, $2, $3, 'guide', $4, $5, $6, $7) returning id`,
    [tripId, day.id, await nextPosition(db, day.id), service.id, startsAt, endsAt, `${service.display_name}: ${service.title}`],
  );
  return { id: rows[0].id };
}

/** Adds a free-text note to a trip day. Callers are responsible for authorization. */
export async function insertNoteItem(db: Queryable, tripId: string, input: { dayId: string; title: string; notes?: string | null }) {
  const { rows } = await db.query<{ id: string }>(
    "insert into itinerary_items (trip_id, day_id, position, kind, title, notes) values ($1, $2, $3, 'note', $4, $5) returning id",
    [tripId, input.dayId, await nextPosition(db, input.dayId), input.title.slice(0, 140), input.notes?.slice(0, 2000) || null],
  );
  return { id: rows[0].id };
}

export async function addNoteItem(db: Queryable, actor: Actor | null, tripId: string, input: { dayId: string; title: string; notes?: string }) {
  await loadEditableTrip(db, actor, tripId);
  const day = await loadDay(db, tripId, input.dayId);
  const title = input.title.trim();
  if (!title || title.length > 140) throw new UserError("Notes need a short title (up to 140 characters).");
  const { rows } = await db.query<{ id: string }>(
    "insert into itinerary_items (trip_id, day_id, position, kind, title, notes) values ($1, $2, $3, 'note', $4, $5) returning id",
    [tripId, day.id, await nextPosition(db, day.id), title, input.notes?.trim().slice(0, 2000) || null],
  );
  return { id: rows[0].id };
}

async function loadItem(db: Queryable, tripId: string, itemId: string) {
  const { rows } = await db.query<{
    id: string;
    day_id: string;
    kind: "experience" | "guide" | "note";
    experience_id: string | null;
    slot_id: string | null;
    guide_service_id: string | null;
    starts_at: Date | null;
    ends_at: Date | null;
    position: number;
  }>("select id, day_id, kind, experience_id, slot_id, guide_service_id, starts_at, ends_at, position from itinerary_items where id = $1 and trip_id = $2", [
    itemId,
    tripId,
  ]);
  if (!rows[0]) throw new NotFoundError("Item not found.");
  return rows[0];
}

export async function removeItem(db: Queryable, actor: Actor | null, tripId: string, itemId: string) {
  await loadEditableTrip(db, actor, tripId);
  await loadItem(db, tripId, itemId);
  await db.query("delete from itinerary_items where id = $1 and trip_id = $2", [itemId, tripId]);
}

/**
 * Moves an item to another day. Experiences are date-bound slots, so we look for a slot of the same
 * experience on the target day (preferring the same local start time). Guide items keep their local time.
 */
export async function moveItem(db: Queryable, actor: Actor | null, tripId: string, itemId: string, targetDayId: string) {
  await loadEditableTrip(db, actor, tripId);
  const item = await loadItem(db, tripId, itemId);
  const target = await loadDay(db, tripId, targetDayId);
  if (item.day_id === target.id) return;

  if (item.kind === "note") {
    await db.query("update itinerary_items set day_id = $2, position = $3 where id = $1", [item.id, target.id, await nextPosition(db, target.id)]);
    return;
  }

  if (item.kind === "experience") {
    const { rows: tz } = await db.query<{ timezone: string }>(
      "select d.timezone from experiences e join destinations d on d.id = e.destination_id where e.id = $1",
      [item.experience_id],
    );
    const zone = tz[0]?.timezone ?? DEFAULT_TZ;
    const preferred = toZoned(item.starts_at!, zone).minutes;
    const dayStart = fromZoned(target.date, "00:00", zone);
    const dayEnd = fromZoned(addDays(target.date, 1), "00:00", zone);
    const { rows: slots } = await db.query<{ id: string; starts_at: Date; ends_at: Date }>(
      `select id, starts_at, ends_at from experience_slots
        where experience_id = $1 and status = 'open' and starts_at >= $2 and starts_at < $3 and reserved < capacity
        order by starts_at`,
      [item.experience_id, dayStart, dayEnd],
    );
    if (!slots.length) throw new UserError("This experience has no available times on that day.");
    const best = slots.sort(
      (a, b) => Math.abs(toZoned(a.starts_at, zone).minutes - preferred) - Math.abs(toZoned(b.starts_at, zone).minutes - preferred),
    )[0];
    await db.query("update itinerary_items set day_id = $2, slot_id = $3, starts_at = $4, ends_at = $5, position = $6 where id = $1", [
      item.id,
      target.id,
      best.id,
      best.starts_at,
      best.ends_at,
      await nextPosition(db, target.id),
    ]);
    return;
  }

  const service = await loadPublicService(db, item.guide_service_id!);
  const localTime = toZoned(item.starts_at!, service.timezone).time;
  const startsAt = fromZoned(target.date, localTime, service.timezone);
  const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60_000);
  await db.query("update itinerary_items set day_id = $2, starts_at = $3, ends_at = $4, position = $5 where id = $1", [
    item.id,
    target.id,
    startsAt,
    endsAt,
    await nextPosition(db, target.id),
  ]);
}

/** Changes an item's time: a different slot for experiences, a new start time for guide services. */
export async function rescheduleItem(
  db: Queryable,
  actor: Actor | null,
  tripId: string,
  itemId: string,
  input: { slotId?: string; startTime?: string },
) {
  await loadEditableTrip(db, actor, tripId);
  const item = await loadItem(db, tripId, itemId);
  if (item.kind === "experience") {
    if (!input.slotId) throw new UserError("Choose a time.");
    const slot = await loadPublicSlot(db, input.slotId);
    if (slot.experience_id !== item.experience_id) throw new UserError("That time belongs to a different experience.");
    const { rows: days } = await db.query<{ id: string }>("select id from itinerary_days where trip_id = $1 and date = $2", [
      tripId,
      toZoned(slot.starts_at, slot.timezone).date,
    ]);
    if (!days[0]) throw new UserError("That time falls outside your trip dates.");
    await db.query("update itinerary_items set slot_id = $2, starts_at = $3, ends_at = $4, day_id = $5 where id = $1", [
      item.id,
      slot.id,
      slot.starts_at,
      slot.ends_at,
      days[0].id,
    ]);
    return;
  }
  if (item.kind === "guide") {
    if (!input.startTime || !/^\d{2}:\d{2}$/.test(input.startTime)) throw new UserError("Choose a valid start time.");
    timeToMinutes(input.startTime);
    const day = await loadDay(db, tripId, item.day_id);
    const service = await loadPublicService(db, item.guide_service_id!);
    const startsAt = fromZoned(day.date, input.startTime, service.timezone);
    const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60_000);
    await db.query("update itinerary_items set starts_at = $2, ends_at = $3 where id = $1", [item.id, startsAt, endsAt]);
    return;
  }
  throw new UserError("Notes don't have a scheduled time.");
}

/** Reorders untimed notes within a day. Timed activities are always shown chronologically. */
export async function shiftNote(db: Queryable, actor: Actor | null, tripId: string, itemId: string, direction: "up" | "down") {
  await loadEditableTrip(db, actor, tripId);
  const item = await loadItem(db, tripId, itemId);
  if (item.kind !== "note") throw new UserError("Only notes can be reordered; activities follow their scheduled times.");
  const { rows } = await db.query<{ id: string; position: number }>(
    `select id, position from itinerary_items where day_id = $1 and kind = 'note' and position ${direction === "up" ? "<" : ">"} $2
      order by position ${direction === "up" ? "desc" : "asc"} limit 1`,
    [item.day_id, item.position],
  );
  const neighbour = rows[0];
  if (!neighbour) return;
  await db.query("update itinerary_items set position = $2 where id = $1", [item.id, neighbour.position]);
  await db.query("update itinerary_items set position = $2 where id = $1", [neighbour.id, item.position]);
}

export async function updateDayNotes(db: Queryable, actor: Actor | null, tripId: string, dayId: string, input: { notes: string | null; destinationId: string | null }) {
  await loadEditableTrip(db, actor, tripId);
  await loadDay(db, tripId, dayId);
  await db.query("update itinerary_days set notes = $3, destination_id = $4 where id = $1 and trip_id = $2", [
    dayId,
    tripId,
    input.notes?.slice(0, 2000) ?? null,
    input.destinationId,
  ]);
}

export async function duplicateTrip(db: Queryable, actor: Actor | null, tripId: string): Promise<{ id: string }> {
  const trip = await loadOwnedTrip(db, actor, tripId);
  const { id } = await createTrip(db, actor, {
    title: `${trip.title} (copy)`.slice(0, 140),
    primaryDestinationId: trip.primary_destination_id,
    startDate: trip.start_date,
    endDate: trip.end_date,
    adults: trip.adults,
    children: trip.children,
    budgetMinor: trip.budget_minor,
    interests: trip.interests,
    pace: trip.pace,
    tourType: trip.tour_type,
    languages: trip.languages,
    accessibilityNotes: trip.accessibility_notes,
    dietaryNotes: trip.dietary_notes,
    accommodationNotes: trip.accommodation_notes,
    transportNotes: trip.transport_notes,
  });
  await db.query(
    `insert into itinerary_items (trip_id, day_id, position, kind, experience_id, slot_id, guide_service_id, starts_at, ends_at, title, notes, is_optional)
     select $2, nd.id, i.position, i.kind, i.experience_id, i.slot_id, i.guide_service_id, i.starts_at, i.ends_at, i.title, i.notes, i.is_optional
       from itinerary_items i
       join itinerary_days od on od.id = i.day_id
       join itinerary_days nd on nd.trip_id = $2 and nd.date = od.date
      where i.trip_id = $1`,
    [tripId, id],
  );
  return { id };
}

export async function setShareEnabled(db: Queryable, actor: Actor | null, tripId: string, enabled: boolean): Promise<string | null> {
  await loadOwnedTrip(db, actor, tripId);
  const token = enabled ? newToken(18) : null;
  await db.query("update trips set share_token = $2 where id = $1", [tripId, token]);
  return token;
}

export async function archiveTrip(db: Queryable, actor: Actor | null, tripId: string) {
  const trip = await loadOwnedTrip(db, actor, tripId, true);
  tripMachine.assert(trip.status, "archived");
  await db.query("update trips set status = 'archived' where id = $1", [tripId]);
}

// ───────────────────────────── Trip graph, validation & pricing ─────────────────────────────

export interface StudioItem {
  id: string;
  dayId: string;
  kind: "experience" | "guide" | "note";
  position: number;
  title: string;
  notes: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isOptional: boolean;
  providerId: string | null;
  providerName: string | null;
  providerSlug: string | null;
  location: { lat: number; lng: number } | null;
  experience: {
    id: string;
    slug: string;
    summary: string;
    durationMinutes: number;
    meetingPoint: string;
    inclusions: string[];
    exclusions: string[];
    preparationNotes: string | null;
    destinationName: string;
    artVariant: ArtVariant;
    media: Media | null;
    categoryId: string;
  } | null;
  guide: { serviceId: string; serviceTitle: string; maxGroupSize: number; bufferMinutes: number } | null;
  slot: { id: string; capacity: number; reserved: number; status: "open" | "closed" | "cancelled" } | null;
  pricing: {
    pricingModel: "per_person" | "per_group";
    currency: string;
    basePriceMinor: number;
    childPriceMinor: number | null;
    discountRules: { id: string; minTravellers: number; percentOffBps: number }[];
  } | null;
  cancellationPolicy: CancellationPolicy | null;
  minNoticeHours: number;
  maxGroupSize: number | null;
  listingAvailable: boolean;
  timezone: string;
}

export type { TripRow };

export interface TripGraph {
  trip: TripRow;
  primaryDestination: { id: string; slug: string; name: string; latitude: number; longitude: number; artVariant: ArtVariant; timezone: string } | null;
  days: { id: string; dayNumber: number; date: string; destinationId: string | null; notes: string | null }[];
  items: StudioItem[];
}

export async function loadTripGraph(db: Queryable, trip: TripRow): Promise<TripGraph> {
  const [{ rows: dest }, { rows: days }, { rows: items }] = await Promise.all([
    db.query<{ id: string; slug: string; name: string; latitude: number; longitude: number; art_variant: ArtVariant; timezone: string }>(
      "select id, slug, name, latitude, longitude, art_variant, timezone from destinations where id = $1",
      [trip.primary_destination_id],
    ),
    db.query<{ id: string; day_number: number; date: string; destination_id: string | null; notes: string | null }>(
      "select id, day_number, date, destination_id, notes from itinerary_days where trip_id = $1 order by date",
      [trip.id],
    ),
    db.query<{
      id: string;
      day_id: string;
      kind: "experience" | "guide" | "note";
      position: number;
      title: string | null;
      notes: string | null;
      starts_at: Date | null;
      ends_at: Date | null;
      is_optional: boolean;
      e_id: string | null;
      e_slug: string | null;
      e_title: string | null;
      e_summary: string | null;
      e_duration: number | null;
      e_meeting_point: string | null;
      e_inclusions: string[] | null;
      e_exclusions: string[] | null;
      e_prep: string | null;
      e_pricing_model: "per_person" | "per_group" | null;
      e_currency: string | null;
      e_price: number | null;
      e_child_price: number | null;
      e_max_group: number | null;
      e_policy: CancellationPolicy | null;
      e_notice: number | null;
      e_status: string | null;
      e_lat: number | null;
      e_lng: number | null;
      e_category: string | null;
      e_media: Media | null;
      d_name: string | null;
      d_art: ArtVariant | null;
      d_lat: number | null;
      d_lng: number | null;
      d_tz: string | null;
      s_id: string | null;
      s_capacity: number | null;
      s_reserved: number | null;
      s_status: "open" | "closed" | "cancelled" | null;
      g_id: string | null;
      g_title: string | null;
      g_pricing_model: "per_person" | "per_group" | null;
      g_currency: string | null;
      g_price: number | null;
      g_max_group: number | null;
      g_buffer: number | null;
      g_notice: number | null;
      g_policy: CancellationPolicy | null;
      g_status: string | null;
      p_id: string | null;
      p_name: string | null;
      p_slug: string | null;
      p_status: string | null;
      p_tz: string | null;
      p_lat: number | null;
      p_lng: number | null;
      discounts: { id: string; minTravellers: number; percentOffBps: number }[];
    }>(
      `select i.id, i.day_id, i.kind, i.position, i.title, i.notes, i.starts_at, i.ends_at, i.is_optional,
              e.id as e_id, e.slug as e_slug, e.title as e_title, e.summary as e_summary, e.duration_minutes as e_duration,
              e.meeting_point as e_meeting_point, e.inclusions as e_inclusions, e.exclusions as e_exclusions, e.preparation_notes as e_prep,
              e.pricing_model as e_pricing_model, e.currency as e_currency, e.base_price_minor as e_price, e.child_price_minor as e_child_price,
              e.max_group_size as e_max_group, e.cancellation_policy as e_policy, e.min_notice_hours as e_notice, e.status as e_status,
              coalesce(e.meeting_lat, d.latitude) as e_lat, coalesce(e.meeting_lng, d.longitude) as e_lng, e.category_id as e_category,
              (select json_build_object('url', m.url, 'altText', m.alt_text, 'credit', m.credit, 'license', m.license)
                 from experience_media m where m.experience_id = e.id order by m.sort_order limit 1) as e_media,
              d.name as d_name, d.art_variant as d_art, d.latitude as d_lat, d.longitude as d_lng, d.timezone as d_tz,
              s.id as s_id, s.capacity as s_capacity, s.reserved as s_reserved, s.status as s_status,
              gs.id as g_id, gs.title as g_title, gs.pricing_model as g_pricing_model, gs.currency as g_currency, gs.base_price_minor as g_price,
              gs.max_group_size as g_max_group, gs.buffer_minutes as g_buffer, gs.min_notice_hours as g_notice,
              gs.cancellation_policy as g_policy, gs.status as g_status,
              p.id as p_id, p.display_name as p_name, p.slug as p_slug, p.status as p_status, p.timezone as p_tz,
              bd.latitude as p_lat, bd.longitude as p_lng,
              coalesce((select json_agg(json_build_object('id', pr.id, 'minTravellers', pr.min_travellers, 'percentOffBps', pr.percent_off_bps))
                          from pricing_rules pr where pr.active and (pr.experience_id = e.id or pr.guide_service_id = gs.id)), '[]') as discounts
         from itinerary_items i
         left join experiences e on e.id = i.experience_id
         left join destinations d on d.id = e.destination_id
         left join experience_slots s on s.id = i.slot_id
         left join guide_services gs on gs.id = i.guide_service_id
         left join provider_profiles p on p.id = coalesce(e.provider_id, gs.provider_id)
         left join destinations bd on bd.id = p.base_destination_id
        where i.trip_id = $1
        order by i.starts_at nulls last, i.position`,
      [trip.id],
    ),
  ]);

  const studioItems: StudioItem[] = items.map((r) => {
    const isExp = r.kind === "experience";
    const isGuide = r.kind === "guide";
    return {
      id: r.id,
      dayId: r.day_id,
      kind: r.kind,
      position: r.position,
      title: isExp ? r.e_title! : (r.title ?? ""),
      notes: r.notes,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      isOptional: r.is_optional,
      providerId: r.p_id,
      providerName: r.p_name,
      providerSlug: r.p_slug,
      location: isExp && r.e_lat !== null ? { lat: r.e_lat, lng: r.e_lng! } : isGuide && r.p_lat !== null ? { lat: r.p_lat, lng: r.p_lng! } : null,
      experience: isExp
        ? {
            id: r.e_id!,
            slug: r.e_slug!,
            summary: r.e_summary!,
            durationMinutes: r.e_duration!,
            meetingPoint: r.e_meeting_point!,
            inclusions: r.e_inclusions ?? [],
            exclusions: r.e_exclusions ?? [],
            preparationNotes: r.e_prep,
            destinationName: r.d_name!,
            artVariant: r.d_art!,
            media: r.e_media,
            categoryId: r.e_category!,
          }
        : null,
      guide: isGuide
        ? { serviceId: r.g_id!, serviceTitle: r.g_title!, maxGroupSize: r.g_max_group!, bufferMinutes: r.g_buffer! }
        : null,
      slot: isExp && r.s_id ? { id: r.s_id, capacity: r.s_capacity!, reserved: r.s_reserved!, status: r.s_status! } : null,
      pricing: isExp
        ? { pricingModel: r.e_pricing_model!, currency: r.e_currency!, basePriceMinor: r.e_price!, childPriceMinor: r.e_child_price, discountRules: r.discounts }
        : isGuide
          ? { pricingModel: r.g_pricing_model!, currency: r.g_currency!, basePriceMinor: r.g_price!, childPriceMinor: null, discountRules: r.discounts }
          : null,
      cancellationPolicy: isExp ? r.e_policy : isGuide ? r.g_policy : null,
      minNoticeHours: isExp ? r.e_notice! : isGuide ? r.g_notice! : 0,
      maxGroupSize: isExp ? (r.e_pricing_model === "per_group" ? r.e_max_group : null) : isGuide ? r.g_max_group : null,
      listingAvailable: isExp ? r.e_status === "published" && r.p_status === "approved" : isGuide ? r.g_status === "published" && r.p_status === "approved" : true,
      timezone: (isExp ? r.d_tz : r.p_tz) ?? DEFAULT_TZ,
    };
  });

  const d = dest[0];
  return {
    trip,
    primaryDestination: d ? { id: d.id, slug: d.slug, name: d.name, latitude: d.latitude, longitude: d.longitude, artVariant: d.art_variant, timezone: d.timezone } : null,
    days: days.map((x) => ({ id: x.id, dayNumber: x.day_number, date: x.date, destinationId: x.destination_id, notes: x.notes })),
    items: studioItems,
  };
}

/**
 * Server-side schedule validation using live slot capacity and guide calendars.
 * `ignoreBookingId` excludes the trip's own reservations (used when re-validating an existing booking).
 */
export async function validateTripGraph(db: Queryable, graph: TripGraph, now = new Date(), ignoreBookingId?: string): Promise<ScheduleIssue[]> {
  const { trip } = graph;
  const guideIds = [...new Set(graph.items.filter((i) => i.kind === "guide" && i.providerId).map((i) => i.providerId!))];
  const availability = await loadGuideAvailability(db, guideIds, trip.start_date, trip.end_date);
  const dayDate = new Map(graph.days.map((d) => [d.id, d.date]));
  const party = trip.adults + trip.children;

  const scheduleItems: ScheduleItem[] = graph.items.map((i) => {
    const base: ScheduleItem = {
      id: i.id,
      kind: i.kind,
      title: i.title,
      dayDate: dayDate.get(i.dayId)!,
      startsAt: i.startsAt,
      endsAt: i.endsAt,
      location: i.location,
      minNoticeHours: i.minNoticeHours,
      listingAvailable: i.listingAvailable,
      maxGroupSize: i.maxGroupSize ?? undefined,
    };
    if (i.kind === "experience") {
      base.slot = i.slot;
      base.slotUnits = slotUnitsFor(i.pricing?.pricingModel ?? "per_person", party);
    }
    if (i.kind === "guide" && i.providerId) {
      const av = availability.get(i.providerId);
      base.guideProviderId = i.providerId;
      base.guideTimezone = i.timezone;
      base.guideWindows = av && i.startsAt ? freeWindowsOn(av, toZoned(i.startsAt, i.timezone).date, { bufferMinutes: i.guide?.bufferMinutes, ignoreBookingId }) : [];
    }
    return base;
  });

  return validateSchedule(scheduleItems, {
    now,
    tripStart: trip.start_date,
    tripEnd: trip.end_date,
    timezone: graph.primaryDestination?.timezone ?? DEFAULT_TZ,
    party,
  });
}

/** Slot capacity is counted in people for per-person listings and in groups for per-group listings. */
export function slotUnitsFor(pricingModel: "per_person" | "per_group", party: number): number {
  return pricingModel === "per_group" ? 1 : party;
}

export function priceableLines(graph: TripGraph): PriceableLine[] {
  return graph.items
    .filter((i) => i.pricing && !i.isOptional)
    .map((i) => ({
      key: i.id,
      title: i.title,
      pricingModel: i.pricing!.pricingModel,
      currency: i.pricing!.currency,
      basePriceMinor: i.pricing!.basePriceMinor,
      childPriceMinor: i.pricing!.childPriceMinor,
      adults: graph.trip.adults,
      children: graph.trip.children,
      discountRules: i.pricing!.discountRules,
    }));
}

export interface StudioView extends TripGraph {
  issues: ScheduleIssue[];
  estimate: Quote | null;
  estimateError: string | null;
  latestQuote: { id: string; version: number; validUntil: Date | null; totalMinor: number; createdAt: Date } | null;
  bookings: { id: string; reference: string; status: string; paymentStatus: string; totalMinor: number; createdAt: Date }[];
  itemBookingStatus: Record<string, string>;
}

export async function getStudioView(db: Queryable, actor: Actor | null, tripId: string, now = new Date()): Promise<StudioView> {
  const trip = await loadOwnedTrip(db, actor, tripId);
  const graph = await loadTripGraph(db, trip);
  const settings = await getSettings(db);

  const { rows: bookings } = await db.query<{ id: string; reference: string; status: string; payment_status: string; total_minor: number; created_at: Date }>(
    "select id, reference, status, payment_status, total_minor, created_at from bookings where trip_id = $1 order by created_at desc",
    [trip.id],
  );
  const active = bookings.find((b) => !["cancelled", "expired", "provider_declined"].includes(b.status));
  const issues = isTripEditable(trip.status) ? await validateTripGraph(db, graph, now) : [];

  let estimate: Quote | null = null;
  let estimateError: string | null = null;
  try {
    estimate = priceQuote(priceableLines(graph), settings);
  } catch (err) {
    if (err instanceof PricingError) estimateError = err.message;
    else throw err;
  }

  const { rows: quotes } = await db.query<{ id: string; version: number; valid_until: Date | null; total_minor: number; created_at: Date }>(
    "select id, version, valid_until, total_minor, created_at from itinerary_versions where trip_id = $1 and kind = 'quote' order by version desc limit 1",
    [trip.id],
  );

  const itemBookingStatus: Record<string, string> = {};
  if (active) {
    const { rows: bi } = await db.query<{ itinerary_item_id: string | null; provider_status: string; status: string }>(
      "select itinerary_item_id, provider_status, status from booking_items where booking_id = $1",
      [active.id],
    );
    for (const b of bi) if (b.itinerary_item_id) itemBookingStatus[b.itinerary_item_id] = b.status === "cancelled" ? "cancelled" : b.provider_status;
  }

  return {
    ...graph,
    issues,
    estimate,
    estimateError,
    latestQuote: quotes[0] ? { id: quotes[0].id, version: quotes[0].version, validUntil: quotes[0].valid_until, totalMinor: quotes[0].total_minor, createdAt: quotes[0].created_at } : null,
    bookings: bookings.map((b) => ({ id: b.id, reference: b.reference, status: b.status, paymentStatus: b.payment_status, totalMinor: b.total_minor, createdAt: b.created_at })),
    itemBookingStatus,
  };
}

/** Builds the immutable snapshot stored with quotes and bookings. */
export function snapshotGraph(graph: TripGraph) {
  return {
    trip: {
      id: graph.trip.id,
      title: graph.trip.title,
      startDate: graph.trip.start_date,
      endDate: graph.trip.end_date,
      adults: graph.trip.adults,
      children: graph.trip.children,
      currency: graph.trip.currency,
    },
    days: graph.days.map((d) => ({
      ...d,
      items: graph.items
        .filter((i) => i.dayId === d.id)
        .map((i) => ({
          id: i.id,
          kind: i.kind,
          title: i.title,
          notes: i.notes,
          startsAt: i.startsAt?.toISOString() ?? null,
          endsAt: i.endsAt?.toISOString() ?? null,
          providerId: i.providerId,
          providerName: i.providerName,
          experienceId: i.experience?.id ?? null,
          meetingPoint: i.experience?.meetingPoint ?? null,
          slotId: i.slot?.id ?? null,
          guideServiceId: i.guide?.serviceId ?? null,
          cancellationPolicy: i.cancellationPolicy,
          inclusions: i.experience?.inclusions ?? [],
          exclusions: i.experience?.exclusions ?? [],
          preparationNotes: i.experience?.preparationNotes ?? null,
        })),
    })),
  };
}

async function nextVersion(db: Queryable, tripId: string): Promise<number> {
  const { rows } = await db.query<{ v: number }>("select coalesce(max(version), 0)::int + 1 as v from itinerary_versions where trip_id = $1", [tripId]);
  return rows[0].v;
}

/** Validates and prices the itinerary on the server, storing an expiring quote. */
export async function quoteTrip(db: Queryable, actor: Actor | null, tripId: string, now = new Date()) {
  const a = requireActor(actor);
  const trip = await loadEditableTrip(db, actor, tripId);
  const graph = await loadTripGraph(db, trip);
  if (!graph.items.some((i) => i.kind !== "note")) throw new UserError("Add at least one experience or guide before requesting a quote.");
  const issues = await validateTripGraph(db, graph, now);
  if (hasBlockingIssues(issues)) {
    throw new UserError(`Fix ${issues.filter((i) => i.severity === "error").length} scheduling issue(s) before requesting a quote.`);
  }
  const settings = await getSettings(db);
  const quote = priceQuote(priceableLines(graph), settings);
  const validUntil = new Date(now.getTime() + settings.quoteValidityMinutes * 60_000);
  const version = await nextVersion(db, tripId);
  const { rows } = await db.query<{ id: string }>(
    `insert into itinerary_versions (trip_id, version, kind, snapshot, pricing, total_minor, currency, valid_until, created_by)
     values ($1, $2, 'quote', $3, $4, $5, $6, $7, $8) returning id`,
    [tripId, version, JSON.stringify(snapshotGraph(graph)), JSON.stringify(quote), quote.totalMinor, quote.currency, validUntil, a.userId],
  );
  tripMachine.assert(trip.status, "quoted");
  await db.query("update trips set status = 'quoted' where id = $1", [tripId]);
  return { versionId: rows[0].id, quote, validUntil };
}

export async function listTripsForOwner(db: Queryable, actor: Actor | null) {
  const a = requireActor(actor);
  const { rows } = await db.query<{
    id: string;
    title: string;
    status: TripStatus;
    start_date: string;
    end_date: string;
    adults: number;
    children: number;
    destination_name: string | null;
    art_variant: ArtVariant | null;
    item_count: number;
    updated_at: Date;
  }>(
    `select t.id, t.title, t.status, t.start_date, t.end_date, t.adults, t.children, d.name as destination_name, d.art_variant,
            (select count(*)::int from itinerary_items i where i.trip_id = t.id and i.kind <> 'note') as item_count, t.updated_at
       from trips t left join destinations d on d.id = t.primary_destination_id
      where t.owner_id = $1 and t.status <> 'archived' and t.group_purpose is distinct from 'plan'
      order by t.start_date`,
    [a.userId],
  );
  return rows;
}

/** Read-only public view for share links. Excludes personal notes and requirements. */
export async function getSharedTrip(db: Queryable, token: string) {
  if (!token || token.length < 16) throw new NotFoundError();
  const { rows } = await db.query<TripRow>("select * from trips where share_token = $1 and status <> 'archived'", [token]);
  const trip = rows[0];
  if (!trip) throw new NotFoundError();
  const graph = await loadTripGraph(db, trip);
  return {
    title: trip.title,
    startDate: trip.start_date,
    endDate: trip.end_date,
    party: trip.adults + trip.children,
    destination: graph.primaryDestination,
    days: graph.days.map((d) => ({
      dayNumber: d.dayNumber,
      date: d.date,
      items: graph.items
        .filter((i) => i.dayId === d.id)
        .map((i) => ({ id: i.id, kind: i.kind, title: i.title, startsAt: i.startsAt, endsAt: i.endsAt, providerName: i.providerName, experienceSlug: i.experience?.slug ?? null, location: i.location, timezone: i.timezone })),
    })),
  };
}

export function assertTripOwner(actor: Actor | null, trip: { owner_id: string }) {
  if (!actor || actor.userId !== trip.owner_id) throw new ForbiddenError();
}

/** Draft/quoted trips with their days, for "add to trip" pickers. */
export async function listEditableTripsWithDays(db: Queryable, actor: Actor | null) {
  if (!actor) return [];
  const { rows } = await db.query<{ id: string; title: string; start_date: string; end_date: string; days: { id: string; date: string; dayNumber: number }[] }>(
    `select t.id, t.title, t.start_date, t.end_date,
            coalesce((select json_agg(json_build_object('id', d.id, 'date', d.date, 'dayNumber', d.day_number) order by d.date)
                        from itinerary_days d where d.trip_id = t.id), '[]') as days
       from trips t where t.owner_id = $1 and t.status in ('draft', 'quoted') and t.group_purpose is distinct from 'plan' order by t.start_date`,
    [actor.userId],
  );
  return rows.map((r) => ({ id: r.id, title: r.title, startDate: r.start_date, endDate: r.end_date, days: r.days }));
}

/** The next scheduled (non-note) item after `now`. */
export function nextScheduledItem(graph: TripGraph, now = new Date()): StudioItem | undefined {
  return graph.items
    .filter((i) => i.kind !== "note" && i.startsAt && i.startsAt > now)
    .sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime())[0];
}
