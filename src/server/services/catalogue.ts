import type { Queryable } from "../db/client";
import { likeEscape, pageOffset, PAGE_SIZE, SqlParams } from "../db/sql";
import { loadGuideAvailability, hasCapacityOn, freeWindowsOn } from "./availability";
import { rankGuides, type GuideCandidate } from "@/domain/ranking";
import { addDays, fromZoned, toZoned } from "@/lib/time";

export type ArtVariant = "savanna" | "coast" | "mountain" | "lake" | "city" | "desert" | "forest";

export interface Media {
  url: string;
  altText: string;
  credit: string;
  license: string;
}

export interface DestinationCard {
  id: string;
  slug: string;
  name: string;
  region: string;
  county: string | null;
  summary: string;
  artVariant: ArtVariant;
  travelStyles: string[];
  latitude: number;
  longitude: number;
  experienceCount: number;
  guideCount: number;
  fromPriceMinor: number | null;
  media: Media | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}

const paged = <T>(items: T[], total: number, page: number | undefined): Paged<T> => ({
  items,
  total,
  page: page && page > 0 ? page : 1,
  pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
});

/** Listings are publicly visible only when published AND owned by an approved provider. */
const PUBLIC_EXPERIENCE = `e.status = 'published' and exists (select 1 from provider_profiles pp where pp.id = e.provider_id and pp.status = 'approved')`;

const DESTINATION_COLUMNS = `
  d.id, d.slug, d.name, d.region, d.county, d.summary, d.art_variant, d.travel_styles, d.latitude, d.longitude,
  (select count(*)::int from experiences e where e.destination_id = d.id and ${PUBLIC_EXPERIENCE}) as experience_count,
  (select count(*)::int from provider_regions r join provider_profiles p on p.id = r.provider_id
     where r.destination_id = d.id and p.status = 'approved' and p.kind = 'guide') as guide_count,
  (select min(e.base_price_minor) from experiences e where e.destination_id = d.id and ${PUBLIC_EXPERIENCE}) as from_price_minor,
  (select json_build_object('url', m.url, 'altText', m.alt_text, 'credit', m.credit, 'license', m.license)
     from destination_media m where m.destination_id = d.id order by m.sort_order limit 1) as media`;

interface DestinationRow {
  id: string;
  slug: string;
  name: string;
  region: string;
  county: string | null;
  summary: string;
  art_variant: ArtVariant;
  travel_styles: string[];
  latitude: number;
  longitude: number;
  experience_count: number;
  guide_count: number;
  from_price_minor: number | null;
  media: Media | null;
}

const toDestinationCard = (r: DestinationRow): DestinationCard => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  region: r.region,
  county: r.county,
  summary: r.summary,
  artVariant: r.art_variant,
  travelStyles: r.travel_styles,
  latitude: r.latitude,
  longitude: r.longitude,
  experienceCount: r.experience_count,
  guideCount: r.guide_count,
  fromPriceMinor: r.from_price_minor,
  media: r.media,
});

export interface DestinationFilters {
  q?: string;
  region?: string;
  style?: string;
  category?: string;
  maxPriceMinor?: number;
  maxDurationMinutes?: number;
  sort?: "featured" | "name" | "price";
  page?: number;
}

export async function listDestinations(db: Queryable, f: DestinationFilters = {}): Promise<Paged<DestinationCard>> {
  const p = new SqlParams();
  const where = ["d.is_published"];
  if (f.q) {
    const q = p.add(`%${likeEscape(f.q)}%`);
    where.push(`(d.name ilike ${q} or d.summary ilike ${q} or d.region ilike ${q} or d.county ilike ${q})`);
  }
  if (f.region) where.push(`d.region = ${p.add(f.region)}`);
  if (f.style) where.push(`${p.add(f.style)} = any(d.travel_styles)`);
  const expConds: string[] = [];
  if (f.category) expConds.push(`e.category_id = (select id from experience_categories where slug = ${p.add(f.category)})`);
  if (f.maxPriceMinor !== undefined) expConds.push(`e.base_price_minor <= ${p.add(f.maxPriceMinor)}`);
  if (f.maxDurationMinutes !== undefined) expConds.push(`e.duration_minutes <= ${p.add(f.maxDurationMinutes)}`);
  if (expConds.length) {
    where.push(`exists (select 1 from experiences e where e.destination_id = d.id and ${PUBLIC_EXPERIENCE} and ${expConds.join(" and ")})`);
  }
  const order =
    f.sort === "name" ? "d.name" : f.sort === "price" ? "from_price_minor asc nulls last, d.name" : "d.sort_order, d.name";
  const whereSql = where.join(" and ");
  const total = (await db.query<{ n: number }>(`select count(*)::int as n from destinations d where ${whereSql}`, p.values)).rows[0].n;
  const { rows } = await db.query<DestinationRow>(
    `select ${DESTINATION_COLUMNS} from destinations d where ${whereSql} order by ${order} limit ${PAGE_SIZE} offset ${pageOffset(f.page)}`,
    p.values,
  );
  return paged(rows.map(toDestinationCard), total, f.page);
}

export async function listFeaturedDestinations(db: Queryable, limit = 6): Promise<DestinationCard[]> {
  const { rows } = await db.query<DestinationRow>(
    `select ${DESTINATION_COLUMNS} from destinations d where d.is_published order by d.sort_order, d.name limit $1`,
    [limit],
  );
  return rows.map(toDestinationCard);
}

export async function listAllDestinationsBrief(db: Queryable) {
  const { rows } = await db.query<{ id: string; slug: string; name: string; region: string; latitude: number; longitude: number }>(
    "select id, slug, name, region, latitude, longitude from destinations where is_published order by name",
  );
  return rows;
}

export async function listRegions(db: Queryable): Promise<string[]> {
  const { rows } = await db.query<{ region: string }>("select distinct region from destinations where is_published order by region");
  return rows.map((r) => r.region);
}

export async function listCategories(db: Queryable) {
  const { rows } = await db.query<{ id: string; slug: string; name: string; description: string | null }>(
    "select id, slug, name, description from experience_categories order by sort_order, name",
  );
  return rows;
}

export interface DestinationDetail extends DestinationCard {
  description: string;
  timezone: string;
  bestTimeToVisit: string | null;
  travelInfo: string | null;
  gallery: Media[];
}

export async function getDestination(db: Queryable, slug: string): Promise<DestinationDetail | null> {
  const { rows } = await db.query<
    DestinationRow & { description: string; timezone: string; best_time_to_visit: string | null; travel_info: string | null; gallery: Media[] }
  >(
    `select ${DESTINATION_COLUMNS}, d.description, d.timezone, d.best_time_to_visit, d.travel_info,
            coalesce((select json_agg(json_build_object('url', m.url, 'altText', m.alt_text, 'credit', m.credit, 'license', m.license) order by m.sort_order)
                        from destination_media m where m.destination_id = d.id), '[]') as gallery
       from destinations d where d.slug = $1 and d.is_published`,
    [slug],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    ...toDestinationCard(r),
    description: r.description,
    timezone: r.timezone,
    bestTimeToVisit: r.best_time_to_visit,
    travelInfo: r.travel_info,
    gallery: r.gallery,
  };
}

// ───────────────────────────── Experiences ─────────────────────────────

export interface ExperienceCard {
  id: string;
  slug: string;
  title: string;
  summary: string;
  durationMinutes: number;
  pricingModel: "per_person" | "per_group";
  currency: string;
  basePriceMinor: number;
  maxGroupSize: number;
  isDemo: boolean;
  destination: { slug: string; name: string; artVariant: ArtVariant };
  category: { slug: string; name: string };
  provider: { slug: string; name: string; kind: "guide" | "operator" };
  ratingAvg: number | null;
  reviewCount: number;
  media: Media | null;
  meetingLat: number | null;
  meetingLng: number | null;
}

interface ExperienceRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  duration_minutes: number;
  pricing_model: "per_person" | "per_group";
  currency: string;
  base_price_minor: number;
  max_group_size: number;
  is_demo: boolean;
  destination_slug: string;
  destination_name: string;
  art_variant: ArtVariant;
  category_slug: string;
  category_name: string;
  provider_slug: string;
  provider_name: string;
  provider_kind: "guide" | "operator";
  rating_avg: number | null;
  review_count: number;
  media: Media | null;
  meeting_lat: number | null;
  meeting_lng: number | null;
}

const EXPERIENCE_COLUMNS = `
  e.id, e.slug, e.title, e.summary, e.duration_minutes, e.pricing_model, e.currency, e.base_price_minor, e.max_group_size, e.is_demo,
  e.meeting_lat, e.meeting_lng,
  d.slug as destination_slug, d.name as destination_name, d.art_variant,
  c.slug as category_slug, c.name as category_name,
  p.slug as provider_slug, p.display_name as provider_name, p.kind as provider_kind,
  (select round(avg(rv.rating)::numeric, 2) from reviews rv where rv.experience_id = e.id and rv.status = 'published') as rating_avg,
  (select count(*)::int from reviews rv where rv.experience_id = e.id and rv.status = 'published') as review_count,
  (select json_build_object('url', m.url, 'altText', m.alt_text, 'credit', m.credit, 'license', m.license)
     from experience_media m where m.experience_id = e.id order by m.sort_order limit 1) as media`;

const EXPERIENCE_FROM = `
  from experiences e
  join destinations d on d.id = e.destination_id
  join experience_categories c on c.id = e.category_id
  join provider_profiles p on p.id = e.provider_id`;

const toExperienceCard = (r: ExperienceRow): ExperienceCard => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  summary: r.summary,
  durationMinutes: r.duration_minutes,
  pricingModel: r.pricing_model,
  currency: r.currency,
  basePriceMinor: r.base_price_minor,
  maxGroupSize: r.max_group_size,
  isDemo: r.is_demo,
  destination: { slug: r.destination_slug, name: r.destination_name, artVariant: r.art_variant },
  category: { slug: r.category_slug, name: r.category_name },
  provider: { slug: r.provider_slug, name: r.provider_name, kind: r.provider_kind },
  ratingAvg: r.rating_avg,
  reviewCount: r.review_count,
  media: r.media,
  meetingLat: r.meeting_lat,
  meetingLng: r.meeting_lng,
});

export interface ExperienceFilters {
  q?: string;
  destination?: string;
  category?: string;
  style?: string;
  maxPriceMinor?: number;
  maxDurationMinutes?: number;
  date?: string;
  party?: number;
  providerId?: string;
  sort?: "recommended" | "price_asc" | "price_desc" | "duration" | "rating";
  page?: number;
  pageSize?: number;
}

export async function listExperiences(db: Queryable, f: ExperienceFilters = {}): Promise<Paged<ExperienceCard>> {
  const p = new SqlParams();
  const where = [PUBLIC_EXPERIENCE];
  if (f.q) {
    const q = p.add(f.q);
    const like = p.add(`%${likeEscape(f.q)}%`);
    where.push(`(e.search @@ websearch_to_tsquery('english', ${q}) or e.title ilike ${like} or d.name ilike ${like})`);
  }
  if (f.destination) where.push(`d.slug = ${p.add(f.destination)}`);
  if (f.category) where.push(`c.slug = ${p.add(f.category)}`);
  if (f.style) where.push(`${p.add(f.style)} = any(e.travel_styles)`);
  if (f.maxPriceMinor !== undefined) where.push(`e.base_price_minor <= ${p.add(f.maxPriceMinor)}`);
  if (f.maxDurationMinutes !== undefined) where.push(`e.duration_minutes <= ${p.add(f.maxDurationMinutes)}`);
  if (f.providerId) where.push(`e.provider_id = ${p.add(f.providerId)}`);
  if (f.date) {
    const start = fromZoned(f.date, "00:00");
    const end = fromZoned(addDays(f.date, 1), "00:00");
    where.push(`exists (select 1 from experience_slots s where s.experience_id = e.id and s.status = 'open'
      and s.starts_at >= ${p.add(start)} and s.starts_at < ${p.add(end)} and s.starts_at > now()
      and s.capacity - s.reserved >= case when e.pricing_model = 'per_group' then 1 else ${p.add(Math.max(1, f.party ?? 1))} end)`);
  }
  const order = {
    recommended: "e.is_demo, review_count desc, e.title",
    price_asc: "e.base_price_minor, e.title",
    price_desc: "e.base_price_minor desc, e.title",
    duration: "e.duration_minutes, e.title",
    rating: "rating_avg desc nulls last, review_count desc, e.title",
  }[f.sort ?? "recommended"];
  const size = Math.min(f.pageSize ?? PAGE_SIZE, 100);
  const whereSql = where.join(" and ");
  const total = (await db.query<{ n: number }>(`select count(*)::int as n ${EXPERIENCE_FROM} where ${whereSql}`, p.values)).rows[0].n;
  const { rows } = await db.query<ExperienceRow>(
    `select ${EXPERIENCE_COLUMNS} ${EXPERIENCE_FROM} where ${whereSql} order by ${order} limit ${size} offset ${pageOffset(f.page, size)}`,
    p.values,
  );
  return { ...paged(rows.map(toExperienceCard), total, f.page), pageCount: Math.max(1, Math.ceil(total / size)) };
}

export interface SlotView {
  id: string;
  startsAt: Date;
  endsAt: Date;
  remaining: number;
  capacity: number;
}

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  reviewerName: string;
  createdAt: Date;
  providerResponse: string | null;
  experienceTitle: string | null;
}

export interface ExperienceDetail extends ExperienceCard {
  description: string;
  childPriceMinor: number | null;
  minAge: number | null;
  inclusions: string[];
  exclusions: string[];
  meetingPoint: string;
  preparationNotes: string | null;
  accessibilityNotes: string | null;
  restrictions: string | null;
  cancellationPolicy: "flexible" | "moderate" | "strict";
  minNoticeHours: number;
  travelStyles: string[];
  gallery: Media[];
  provider: ExperienceCard["provider"] & { id: string; verified: boolean; isDemo: boolean };
  destinationTimezone: string;
  slots: SlotView[];
  reviews: Review[];
  groupDiscounts: { minTravellers: number; percentOffBps: number }[];
}

const VERIFIED_SQL = (providerAlias: string) => `(
  exists (select 1 from (select distinct on (verification_type) verification_type, status, expires_at
            from provider_verifications v where v.provider_id = ${providerAlias}.id
           order by verification_type, created_at desc) latest
          where latest.verification_type = 'identity' and latest.status = 'passed' and (latest.expires_at is null or latest.expires_at > now()))
  and exists (select 1 from (select distinct on (verification_type) verification_type, status, expires_at
            from provider_verifications v where v.provider_id = ${providerAlias}.id
           order by verification_type, created_at desc) latest
          where latest.verification_type in ('tourism_license', 'guide_certification', 'business_registration')
            and latest.status = 'passed' and (latest.expires_at is null or latest.expires_at > now()))
)`;

export async function getExperience(db: Queryable, slug: string, opts: { includeUnpublishedFor?: string } = {}): Promise<ExperienceDetail | null> {
  const p = new SqlParams();
  const slugParam = p.add(slug);
  const visibility = opts.includeUnpublishedFor
    ? `(${PUBLIC_EXPERIENCE} or e.provider_id = ${p.add(opts.includeUnpublishedFor)})`
    : PUBLIC_EXPERIENCE;
  const { rows } = await db.query<
    ExperienceRow & {
      description: string;
      child_price_minor: number | null;
      min_age: number | null;
      inclusions: string[];
      exclusions: string[];
      meeting_point: string;
      preparation_notes: string | null;
      accessibility_notes: string | null;
      restrictions: string | null;
      cancellation_policy: "flexible" | "moderate" | "strict";
      min_notice_hours: number;
      travel_styles: string[];
      provider_id: string;
      provider_is_demo: boolean;
      provider_verified: boolean;
      timezone: string;
      gallery: Media[];
    }
  >(
    `select ${EXPERIENCE_COLUMNS}, e.description, e.child_price_minor, e.min_age, e.inclusions, e.exclusions, e.meeting_point,
            e.preparation_notes, e.accessibility_notes, e.restrictions, e.cancellation_policy, e.min_notice_hours, e.travel_styles,
            p.id as provider_id, p.is_demo as provider_is_demo, ${VERIFIED_SQL("p")} as provider_verified, d.timezone,
            coalesce((select json_agg(json_build_object('url', m.url, 'altText', m.alt_text, 'credit', m.credit, 'license', m.license) order by m.sort_order)
                        from experience_media m where m.experience_id = e.id), '[]') as gallery
       ${EXPERIENCE_FROM}
      where e.slug = ${slugParam} and ${visibility}`,
    p.values,
  );
  const r = rows[0];
  if (!r) return null;

  const [slots, reviews, discounts] = await Promise.all([
    listUpcomingSlots(db, r.id, 60),
    listReviews(db, { experienceId: r.id }),
    db.query<{ min_travellers: number; percent_off_bps: number }>(
      "select min_travellers, percent_off_bps from pricing_rules where experience_id = $1 and active order by min_travellers",
      [r.id],
    ),
  ]);

  const card = toExperienceCard(r);
  return {
    ...card,
    description: r.description,
    childPriceMinor: r.child_price_minor,
    minAge: r.min_age,
    inclusions: r.inclusions,
    exclusions: r.exclusions,
    meetingPoint: r.meeting_point,
    preparationNotes: r.preparation_notes,
    accessibilityNotes: r.accessibility_notes,
    restrictions: r.restrictions,
    cancellationPolicy: r.cancellation_policy,
    minNoticeHours: r.min_notice_hours,
    travelStyles: r.travel_styles,
    gallery: r.gallery,
    provider: { ...card.provider, id: r.provider_id, verified: r.provider_verified, isDemo: r.provider_is_demo },
    destinationTimezone: r.timezone,
    slots,
    reviews,
    groupDiscounts: discounts.rows.map((d) => ({ minTravellers: d.min_travellers, percentOffBps: d.percent_off_bps })),
  };
}

export async function listUpcomingSlots(db: Queryable, experienceId: string, days: number): Promise<SlotView[]> {
  const { rows } = await db.query<{ id: string; starts_at: Date; ends_at: Date; capacity: number; reserved: number }>(
    `select s.id, s.starts_at, s.ends_at, s.capacity, s.reserved
       from experience_slots s join experiences e on e.id = s.experience_id
      where s.experience_id = $1 and s.status = 'open'
        and s.starts_at > now() + make_interval(hours => e.min_notice_hours)
        and s.starts_at < now() + make_interval(days => $2)
      order by s.starts_at`,
    [experienceId, days],
  );
  return rows.map((s) => ({ id: s.id, startsAt: s.starts_at, endsAt: s.ends_at, capacity: s.capacity, remaining: s.capacity - s.reserved }));
}

export async function listReviews(db: Queryable, f: { experienceId?: string; providerId?: string }, limit = 20): Promise<Review[]> {
  const p = new SqlParams();
  const where = ["rv.status = 'published'"];
  if (f.experienceId) where.push(`rv.experience_id = ${p.add(f.experienceId)}`);
  if (f.providerId) where.push(`rv.provider_id = ${p.add(f.providerId)}`);
  const { rows } = await db.query<{
    id: string;
    rating: number;
    title: string | null;
    body: string;
    display_name: string;
    created_at: Date;
    provider_response: string | null;
    experience_title: string | null;
  }>(
    `select rv.id, rv.rating, rv.title, rv.body, u.display_name, rv.created_at, rv.provider_response, e.title as experience_title
       from reviews rv join users u on u.id = rv.reviewer_id left join experiences e on e.id = rv.experience_id
      where ${where.join(" and ")} order by rv.created_at desc limit ${Number(limit)}`,
    p.values,
  );
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    // Only first name + initial is shown publicly.
    reviewerName: r.display_name.split(/\s+/).map((part, i) => (i === 0 ? part : `${part[0]}.`)).join(" "),
    createdAt: r.created_at,
    providerResponse: r.provider_response,
    experienceTitle: r.experience_title,
  }));
}

// ───────────────────────────── Guides ─────────────────────────────

export interface GuideCard {
  id: string;
  slug: string;
  name: string;
  headline: string | null;
  photoUrl: string | null;
  languages: string[];
  specialties: string[];
  yearsExperience: number | null;
  regions: { slug: string; name: string }[];
  baseDestination: { slug: string; name: string; artVariant: ArtVariant } | null;
  fromPriceMinor: number | null;
  currency: string;
  ratingAvg: number | null;
  reviewCount: number;
  verified: boolean;
  isDemo: boolean;
  availableOnDate: boolean | null;
  rankReasons: string[];
}

interface GuideRow {
  id: string;
  slug: string;
  display_name: string;
  headline: string | null;
  photo_url: string | null;
  languages: string[];
  specialties: string[];
  years_experience: number | null;
  regions: { slug: string; name: string; id: string }[];
  base_slug: string | null;
  base_name: string | null;
  base_art: ArtVariant | null;
  from_price_minor: number | null;
  max_group: number | null;
  min_duration: number | null;
  rating_avg: number | null;
  review_count: number;
  completed: number;
  provider_cancellations: number;
  verified: boolean;
  is_demo: boolean;
}

const GUIDE_COLUMNS = `
  p.id, p.slug, p.display_name, p.headline, p.photo_url, p.languages, p.specialties, p.years_experience, p.is_demo,
  coalesce((select json_agg(json_build_object('id', d.id, 'slug', d.slug, 'name', d.name) order by d.name)
              from provider_regions r join destinations d on d.id = r.destination_id where r.provider_id = p.id), '[]') as regions,
  bd.slug as base_slug, bd.name as base_name, bd.art_variant as base_art,
  (select min(gs.base_price_minor) from guide_services gs where gs.provider_id = p.id and gs.status = 'published') as from_price_minor,
  (select max(gs.max_group_size) from guide_services gs where gs.provider_id = p.id and gs.status = 'published') as max_group,
  (select min(gs.duration_minutes) from guide_services gs where gs.provider_id = p.id and gs.status = 'published') as min_duration,
  (select round(avg(rv.rating)::numeric, 2) from reviews rv where rv.provider_id = p.id and rv.status = 'published') as rating_avg,
  (select count(*)::int from reviews rv where rv.provider_id = p.id and rv.status = 'published') as review_count,
  (select count(*)::int from booking_items bi where bi.provider_id = p.id and bi.status = 'completed') as completed,
  (select count(*)::int from booking_status_events ev join booking_items bi on bi.booking_id = ev.booking_id
     where bi.provider_id = p.id and ev.to_status = 'cancelled' and ev.actor_role in ('guide', 'operator')) as provider_cancellations,
  ${VERIFIED_SQL("p")} as verified`;

export interface GuideFilters {
  destination?: string;
  language?: string;
  specialty?: string;
  date?: string;
  maxPriceMinor?: number;
  minRating?: number;
  party?: number;
  interests?: string[];
  sort?: "recommended" | "price" | "rating" | "experience";
  page?: number;
}

export async function listGuides(db: Queryable, f: GuideFilters = {}): Promise<Paged<GuideCard>> {
  const p = new SqlParams();
  const where = ["p.kind = 'guide'", "p.status = 'approved'", "exists (select 1 from guide_services gs where gs.provider_id = p.id and gs.status = 'published')"];
  if (f.destination) {
    where.push(`exists (select 1 from provider_regions r join destinations d on d.id = r.destination_id where r.provider_id = p.id and d.slug = ${p.add(f.destination)})`);
  }
  if (f.language) where.push(`exists (select 1 from unnest(p.languages) l where lower(l) = lower(${p.add(f.language)}))`);
  if (f.specialty) where.push(`exists (select 1 from unnest(p.specialties) s where lower(s) = lower(${p.add(f.specialty)}))`);
  if (f.maxPriceMinor !== undefined) {
    where.push(`exists (select 1 from guide_services gs where gs.provider_id = p.id and gs.status = 'published' and gs.base_price_minor <= ${p.add(f.maxPriceMinor)})`);
  }
  if (f.party) {
    where.push(`exists (select 1 from guide_services gs where gs.provider_id = p.id and gs.status = 'published' and gs.max_group_size >= ${p.add(f.party)})`);
  }

  const { rows } = await db.query<GuideRow>(
    `select ${GUIDE_COLUMNS} from provider_profiles p left join destinations bd on bd.id = p.base_destination_id
      where ${where.join(" and ")}`,
    p.values,
  );

  let filtered = rows;
  if (f.minRating) filtered = filtered.filter((r) => (r.rating_avg ?? 0) >= f.minRating!);

  // Availability is evaluated against real schedules, never assumed.
  let availability = new Map<string, boolean>();
  if (f.date) {
    const av = await loadGuideAvailability(db, filtered.map((r) => r.id), f.date, f.date);
    availability = new Map(filtered.map((r) => [r.id, av.has(r.id) ? hasCapacityOn(av.get(r.id)!, f.date!, r.min_duration ?? 60) : false]));
  }

  const candidates: GuideCandidate[] = filtered.map((r) => ({
    id: r.id,
    availableOnDate: f.date ? availability.get(r.id) ?? false : null,
    servesDestination: null,
    canHostGroup: f.party ? (r.max_group ?? 0) >= f.party : true,
    languagesRequested: f.language ? [f.language] : [],
    languages: r.languages,
    specialtiesRequested: f.interests ?? (f.specialty ? [f.specialty] : []),
    specialties: r.specialties,
    ratingAvg: r.rating_avg,
    reviewCount: r.review_count,
    completedBookings: r.completed,
    providerCancellations: r.provider_cancellations,
    fromPriceMinor: r.from_price_minor,
  }));
  const ranked = rankGuides(candidates);
  const byId = new Map(filtered.map((r) => [r.id, r]));

  let ordered = ranked.map((rk) => ({ row: byId.get(rk.id)!, reasons: rk.reasons }));
  if (f.sort === "price") ordered = ordered.sort((a, b) => (a.row.from_price_minor ?? Infinity) - (b.row.from_price_minor ?? Infinity));
  if (f.sort === "rating") ordered = ordered.sort((a, b) => (b.row.rating_avg ?? 0) - (a.row.rating_avg ?? 0) || b.row.review_count - a.row.review_count);
  if (f.sort === "experience") ordered = ordered.sort((a, b) => (b.row.years_experience ?? 0) - (a.row.years_experience ?? 0));

  const offset = pageOffset(f.page);
  const items = ordered.slice(offset, offset + PAGE_SIZE).map(({ row, reasons }) => toGuideCard(row, f.date ? availability.get(row.id) ?? false : null, reasons));
  return paged(items, ordered.length, f.page);
}

const toGuideCard = (r: GuideRow, availableOnDate: boolean | null, reasons: string[]): GuideCard => ({
  id: r.id,
  slug: r.slug,
  name: r.display_name,
  headline: r.headline,
  photoUrl: r.photo_url,
  languages: r.languages,
  specialties: r.specialties,
  yearsExperience: r.years_experience,
  regions: r.regions.map(({ slug, name }) => ({ slug, name })),
  baseDestination: r.base_slug ? { slug: r.base_slug, name: r.base_name!, artVariant: r.base_art! } : null,
  fromPriceMinor: r.from_price_minor,
  currency: "KES",
  ratingAvg: r.rating_avg,
  reviewCount: r.review_count,
  verified: r.verified,
  isDemo: r.is_demo,
  availableOnDate,
  rankReasons: reasons,
});

export interface GuideServiceView {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  pricingModel: "per_person" | "per_group";
  currency: string;
  basePriceMinor: number;
  maxGroupSize: number;
  minNoticeHours: number;
  bufferMinutes: number;
  cancellationPolicy: "flexible" | "moderate" | "strict";
}

export interface GuideDetail extends GuideCard {
  bio: string | null;
  introVideoUrl: string | null;
  timezone: string;
  services: GuideServiceView[];
  verifications: { type: string; expiresAt: Date | null }[];
  reviews: Review[];
  calendar: { date: string; windows: { start: number; end: number }[] }[];
  experiences: ExperienceCard[];
}

export async function getGuide(db: Queryable, slug: string, now = new Date()): Promise<GuideDetail | null> {
  const { rows } = await db.query<GuideRow & { bio: string | null; intro_video_url: string | null; timezone: string }>(
    `select ${GUIDE_COLUMNS}, p.bio, p.intro_video_url, p.timezone
       from provider_profiles p left join destinations bd on bd.id = p.base_destination_id
      where p.slug = $1 and p.status = 'approved'`,
    [slug],
  );
  const r = rows[0];
  if (!r) return null;

  const [services, verifications, reviews, experiences] = await Promise.all([
    listGuideServices(db, r.id, { publishedOnly: true }),
    db.query<{ verification_type: string; expires_at: Date | null }>(
      `select verification_type, expires_at from (
         select distinct on (verification_type) verification_type, status, expires_at
           from provider_verifications where provider_id = $1 order by verification_type, created_at desc) latest
        where status = 'passed' and (expires_at is null or expires_at > now())`,
      [r.id],
    ),
    listReviews(db, { providerId: r.id }),
    listExperiences(db, { providerId: r.id, pageSize: 6 }),
  ]);

  const today = toZoned(now, r.timezone).date;
  const end = addDays(today, 20);
  const av = (await loadGuideAvailability(db, [r.id], today, end)).get(r.id)!;
  const calendar = Array.from({ length: 21 }, (_, i) => {
    const date = addDays(today, i);
    return { date, windows: freeWindowsOn(av, date) };
  });

  return {
    ...toGuideCard(r, null, []),
    bio: r.bio,
    introVideoUrl: r.intro_video_url,
    timezone: r.timezone,
    services,
    verifications: verifications.rows.map((v) => ({ type: v.verification_type, expiresAt: v.expires_at })),
    reviews,
    calendar,
    experiences: experiences.items,
  };
}

export async function listGuideServices(db: Queryable, providerId: string, opts: { publishedOnly?: boolean } = {}): Promise<(GuideServiceView & { status: string })[]> {
  const { rows } = await db.query<{
    id: string;
    title: string;
    description: string;
    duration_minutes: number;
    pricing_model: "per_person" | "per_group";
    currency: string;
    base_price_minor: number;
    max_group_size: number;
    min_notice_hours: number;
    buffer_minutes: number;
    cancellation_policy: "flexible" | "moderate" | "strict";
    status: string;
  }>(
    `select id, title, description, duration_minutes, pricing_model, currency, base_price_minor, max_group_size, min_notice_hours,
            buffer_minutes, cancellation_policy, status
       from guide_services where provider_id = $1 ${opts.publishedOnly ? "and status = 'published'" : "and status <> 'archived'"}
      order by base_price_minor`,
    [providerId],
  );
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    durationMinutes: s.duration_minutes,
    pricingModel: s.pricing_model,
    currency: s.currency,
    basePriceMinor: s.base_price_minor,
    maxGroupSize: s.max_group_size,
    minNoticeHours: s.min_notice_hours,
    bufferMinutes: s.buffer_minutes,
    cancellationPolicy: s.cancellation_policy,
    status: s.status,
  }));
}

export async function listLanguagesAndSpecialties(db: Queryable) {
  const { rows } = await db.query<{ languages: string[]; specialties: string[] }>(
    `select coalesce(array(select distinct unnest(languages) from provider_profiles where status = 'approved' and kind = 'guide' order by 1), '{}') as languages,
            coalesce(array(select distinct unnest(specialties) from provider_profiles where status = 'approved' and kind = 'guide' order by 1), '{}') as specialties`,
  );
  return rows[0];
}

export async function getPlatformStats(db: Queryable) {
  const { rows } = await db.query<{ destinations: number; experiences: number; guides: number }>(
    `select (select count(*)::int from destinations where is_published) as destinations,
            (select count(*)::int from experiences e where ${PUBLIC_EXPERIENCE}) as experiences,
            (select count(*)::int from provider_profiles where kind = 'guide' and status = 'approved') as guides`,
  );
  return rows[0];
}
