import { z } from "zod";
import type { Db, Queryable } from "../db/client";
import { requireActor, requireProvider, requireAdmin, hasRole, NotFoundError, ForbiddenError, type Actor } from "@/domain/authz";
import { providerMachine, listingMachine, type ProviderStatus, type ListingStatus } from "@/domain/states";
import { fromZoned, addDays, toZoned } from "@/lib/time";
import { UserError } from "../errors";
import { audit, primaryRole } from "./audit";
import { notify } from "./notifications";
import { getStorage, MAX_UPLOAD_BYTES, newDocumentKey, sha256, sniffDocumentType } from "../storage";
import { providerBalance } from "./ledger";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 60) || "listing";

async function uniqueSlug(db: Queryable, table: "provider_profiles" | "experiences", base: string): Promise<string> {
  const root = slugify(base);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const { rowCount } = await db.query(`select 1 from ${table} where slug = $1`, [candidate]);
    if (!rowCount) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

// ───────────────────────────── profile & onboarding ─────────────────────────────

export const providerProfileSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your public name").max(120),
  headline: z.string().trim().max(160).nullable(),
  bio: z.string().trim().max(4000).nullable(),
  photoUrl: z.string().trim().url("Enter a valid image URL").max(500).startsWith("https://", "Use an https URL").nullable(),
  introVideoUrl: z.string().trim().url().max(500).startsWith("https://", "Use an https URL").nullable(),
  languages: z.array(z.string().trim().min(2).max(40)).min(1, "Add at least one language").max(10),
  specialties: z.array(z.string().trim().min(2).max(40)).max(12),
  yearsExperience: z.number().int().min(0).max(70).nullable(),
  baseDestinationId: z.string().uuid().nullable(),
  regionIds: z.array(z.string().uuid()).max(20),
});
export type ProviderProfileInput = z.infer<typeof providerProfileSchema>;

export async function getOwnProvider(db: Queryable, actor: Actor | null) {
  const a = requireActor(actor);
  const { rows } = await db.query<{
    id: string;
    kind: "guide" | "operator";
    display_name: string;
    slug: string;
    headline: string | null;
    bio: string | null;
    photo_url: string | null;
    intro_video_url: string | null;
    languages: string[];
    specialties: string[];
    years_experience: number | null;
    base_destination_id: string | null;
    status: ProviderStatus;
    status_reason: string | null;
    region_ids: string[];
    is_demo: boolean;
  }>(
    `select p.*, coalesce(array(select destination_id from provider_regions r where r.provider_id = p.id), '{}') as region_ids
       from provider_profiles p where p.user_id = $1`,
    [a.userId],
  );
  return rows[0] ?? null;
}

export async function saveProviderProfile(db: Queryable, actor: Actor | null, input: ProviderProfileInput) {
  const a = requireActor(actor);
  const kind = hasRole(a, "operator") ? "operator" : hasRole(a, "guide") ? "guide" : null;
  if (!kind) throw new ForbiddenError("Only guide or operator accounts can create a provider profile.");
  const v = providerProfileSchema.parse(input);
  const existing = await getOwnProvider(db, a);

  let providerId: string;
  if (!existing) {
    const slug = await uniqueSlug(db, "provider_profiles", v.displayName);
    const { rows } = await db.query<{ id: string }>(
      `insert into provider_profiles (user_id, kind, display_name, slug, headline, bio, photo_url, intro_video_url, languages, specialties, years_experience, base_destination_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [a.userId, kind, v.displayName, slug, v.headline, v.bio, v.photoUrl, v.introVideoUrl, v.languages, v.specialties, v.yearsExperience, v.baseDestinationId],
    );
    providerId = rows[0].id;
  } else {
    if (existing.status === "suspended") throw new UserError("Your profile is suspended. Please contact support.");
    providerId = existing.id;
    await db.query(
      `update provider_profiles set display_name=$2, headline=$3, bio=$4, photo_url=$5, intro_video_url=$6, languages=$7, specialties=$8,
              years_experience=$9, base_destination_id=$10 where id = $1`,
      [providerId, v.displayName, v.headline, v.bio, v.photoUrl, v.introVideoUrl, v.languages, v.specialties, v.yearsExperience, v.baseDestinationId],
    );
  }
  await db.query("delete from provider_regions where provider_id = $1", [providerId]);
  for (const regionId of new Set(v.regionIds)) {
    await db.query("insert into provider_regions (provider_id, destination_id) values ($1, $2)", [providerId, regionId]);
  }
  return { providerId };
}

export async function uploadProviderDocument(
  db: Queryable,
  actor: Actor | null,
  input: { docType: string; file: File },
) {
  const a = requireActor(actor);
  const provider = await getOwnProvider(db, a);
  if (!provider) throw new UserError("Create your profile before uploading documents.");
  const docType = z
    .enum(["national_id", "passport", "tra_license", "guide_certification", "business_registration", "insurance", "other"])
    .parse(input.docType);
  if (input.file.size === 0) throw new UserError("Choose a file to upload.");
  if (input.file.size > MAX_UPLOAD_BYTES) throw new UserError("Files must be 8 MB or smaller.");
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const sniffed = sniffDocumentType(bytes);
  if (!sniffed) throw new UserError("Upload a PDF, JPEG, PNG or WebP file.");

  const key = newDocumentKey(provider.id, sniffed.ext);
  await getStorage().put(key, bytes, sniffed.type);
  const filename = input.file.name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || `document.${sniffed.ext}`;
  await db.query(
    `insert into provider_documents (provider_id, doc_type, storage_key, original_filename, content_type, size_bytes, sha256, uploaded_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [provider.id, docType, key, filename, sniffed.type, bytes.length, sha256(bytes), a.userId],
  );
}

export async function listProviderDocuments(db: Queryable, providerId: string) {
  const { rows } = await db.query<{ id: string; doc_type: string; original_filename: string; size_bytes: number; created_at: Date; content_type: string }>(
    "select id, doc_type, original_filename, size_bytes, created_at, content_type from provider_documents where provider_id = $1 and deleted_at is null order by created_at desc",
    [providerId],
  );
  return rows;
}

/** Mints a short-lived download link after checking the actor may see the document. */
export async function documentDownloadUrl(db: Queryable, actor: Actor | null, documentId: string): Promise<string> {
  const a = requireActor(actor);
  if (!z.string().uuid().safeParse(documentId).success) throw new NotFoundError();
  const { rows } = await db.query<{ storage_key: string; provider_id: string }>(
    "select storage_key, provider_id from provider_documents where id = $1 and deleted_at is null",
    [documentId],
  );
  const doc = rows[0];
  if (!doc) throw new NotFoundError();
  const isOwner = a.providerId === doc.provider_id;
  if (!isOwner && !hasRole(a, "admin")) throw new NotFoundError();
  if (!isOwner) {
    await audit(db, { actorId: a.userId, actorRole: "admin", action: "provider_document.viewed", entityType: "provider_document", entityId: documentId });
  }
  return getStorage().signedUrl(doc.storage_key, 120);
}

export async function submitForReview(db: Queryable, actor: Actor | null) {
  const a = requireActor(actor);
  const provider = await getOwnProvider(db, a);
  if (!provider) throw new UserError("Create your profile first.");
  const docs = await listProviderDocuments(db, provider.id);
  const hasId = docs.some((d) => d.doc_type === "national_id" || d.doc_type === "passport");
  const hasCredential = docs.some((d) => ["tra_license", "guide_certification", "business_registration"].includes(d.doc_type));
  if (!hasId || !hasCredential) {
    throw new UserError("Upload an identity document and at least one licence, certification or business registration before submitting.");
  }
  if (!provider.bio || provider.bio.length < 80) throw new UserError("Add a biography of at least 80 characters before submitting.");
  providerMachine.assert(provider.status, "submitted");
  await db.query("update provider_profiles set status = 'submitted', submitted_at = now(), status_reason = null where id = $1", [provider.id]);
  await audit(db, { actorId: a.userId, actorRole: primaryRole(a.roles), action: "provider.submitted", entityType: "provider", entityId: provider.id });
}

// ───────────────────────────── admin verification ─────────────────────────────

export async function listProvidersForReview(db: Queryable, actor: Actor | null, status?: ProviderStatus) {
  requireAdmin(actor);
  const { rows } = await db.query<{
    id: string;
    display_name: string;
    kind: string;
    status: ProviderStatus;
    submitted_at: Date | null;
    email: string;
    doc_count: number;
    is_demo: boolean;
  }>(
    `select p.id, p.display_name, p.kind, p.status, p.submitted_at, u.email, p.is_demo,
            (select count(*)::int from provider_documents d where d.provider_id = p.id and d.deleted_at is null) as doc_count
       from provider_profiles p join users u on u.id = p.user_id
      where ($1::text is null or p.status = $1)
      order by case p.status when 'submitted' then 0 when 'info_requested' then 1 else 2 end, p.submitted_at nulls last, p.display_name`,
    [status ?? null],
  );
  return rows;
}

export async function getProviderForAdmin(db: Queryable, actor: Actor | null, providerId: string) {
  requireAdmin(actor);
  if (!z.string().uuid().safeParse(providerId).success) throw new NotFoundError();
  const { rows } = await db.query<{
    id: string;
    user_id: string;
    display_name: string;
    kind: string;
    status: ProviderStatus;
    status_reason: string | null;
    bio: string | null;
    headline: string | null;
    languages: string[];
    specialties: string[];
    email: string;
    slug: string;
    is_demo: boolean;
  }>("select p.*, u.email from provider_profiles p join users u on u.id = p.user_id where p.id = $1", [providerId]);
  if (!rows[0]) throw new NotFoundError();
  const [docs, verifications] = await Promise.all([
    listProviderDocuments(db, providerId),
    db.query<{ id: string; verification_type: string; status: string; reference_number: string | null; decision_notes: string | null; expires_at: Date | null; created_at: Date; reviewer: string }>(
      `select v.id, v.verification_type, v.status, v.reference_number, v.decision_notes, v.expires_at, v.created_at, u.display_name as reviewer
         from provider_verifications v join users u on u.id = v.reviewer_id where v.provider_id = $1 order by v.created_at desc`,
      [providerId],
    ),
  ]);
  return { provider: rows[0], documents: docs, verifications: verifications.rows };
}

export const verificationSchema = z.object({
  verificationType: z.enum(["identity", "tourism_license", "guide_certification", "business_registration", "insurance"]),
  status: z.enum(["passed", "failed", "revoked"]),
  documentId: z.string().uuid().nullable(),
  referenceNumber: z.string().trim().max(120).nullable(),
  notes: z.string().trim().min(3, "Record what was checked").max(2000),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export async function recordVerification(db: Queryable, actor: Actor | null, providerId: string, input: z.infer<typeof verificationSchema>) {
  const a = requireAdmin(actor);
  const v = verificationSchema.parse(input);
  if (v.documentId) {
    const { rowCount } = await db.query("select 1 from provider_documents where id = $1 and provider_id = $2", [v.documentId, providerId]);
    if (!rowCount) throw new UserError("That document doesn't belong to this provider.");
  }
  await db.query(
    `insert into provider_verifications (provider_id, verification_type, status, document_id, reference_number, reviewer_id, decision_notes, expires_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [providerId, v.verificationType, v.status, v.documentId, v.referenceNumber, a.userId, v.notes, v.expiresAt ? fromZoned(v.expiresAt, "23:59") : null],
  );
  await audit(db, {
    actorId: a.userId,
    actorRole: "admin",
    action: `provider.verification.${v.status}`,
    entityType: "provider",
    entityId: providerId,
    reason: v.notes,
    details: { type: v.verificationType, reference: v.referenceNumber },
  });
}

export async function decideProvider(
  db: Db,
  actor: Actor | null,
  providerId: string,
  decision: "approved" | "rejected" | "info_requested" | "suspended",
  reason: string,
) {
  const a = requireAdmin(actor);
  if (reason.trim().length < 3) throw new UserError("A documented reason is required.");
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ status: ProviderStatus; user_id: string; display_name: string }>(
      "select status, user_id, display_name from provider_profiles where id = $1 for update",
      [providerId],
    );
    const p = rows[0];
    if (!p) throw new NotFoundError();
    providerMachine.assert(p.status, decision);
    if (decision === "approved") {
      const { rowCount } = await tx.query(
        `select 1 from (select distinct on (verification_type) verification_type, status from provider_verifications
                         where provider_id = $1 order by verification_type, created_at desc) v
          where v.verification_type = 'identity' and v.status = 'passed'`,
        [providerId],
      );
      if (!rowCount) throw new UserError("Record a passed identity verification before approving.");
    }
    await tx.query(
      `update provider_profiles set status = $2, status_reason = $3, approved_at = case when $2 = 'approved' then now() else approved_at end where id = $1`,
      [providerId, decision, reason.trim()],
    );
    await audit(tx, { actorId: a.userId, actorRole: "admin", action: `provider.${decision}`, entityType: "provider", entityId: providerId, reason });
    const messages = {
      approved: "Your provider profile has been approved. You can now publish listings.",
      rejected: `Your provider application was not approved: ${reason}`,
      info_requested: `We need more information to verify your profile: ${reason}`,
      suspended: `Your provider profile has been suspended: ${reason}`,
    };
    await notify(tx, {
      userId: p.user_id,
      type: "provider.status",
      title: `Profile update: ${decision.replace("_", " ")}`,
      body: messages[decision],
      link: "/provider",
      dedupeKey: `provider.status:${providerId}:${decision}:${Date.now()}`,
    });
  });
}

// ───────────────────────────── guide services ─────────────────────────────

export const guideServiceSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(20, "Describe the service in at least 20 characters").max(4000),
  durationMinutes: z.number().int().min(60).max(16 * 60),
  pricingModel: z.enum(["per_person", "per_group"]),
  basePriceMinor: z.number().int().min(100, "Set a price").max(100_000_000),
  maxGroupSize: z.number().int().min(1).max(60),
  bufferMinutes: z.number().int().min(0).max(600),
  minNoticeHours: z.number().int().min(0).max(720),
  cancellationPolicy: z.enum(["flexible", "moderate", "strict"]),
});

async function requireApprovedProvider(db: Queryable, actor: Actor | null) {
  const p = requireProvider(actor);
  const { rows } = await db.query<{ status: ProviderStatus; kind: "guide" | "operator" }>("select status, kind from provider_profiles where id = $1", [p.providerId]);
  return { actor: p, status: rows[0].status, kind: rows[0].kind };
}

export async function saveGuideService(db: Queryable, actor: Actor | null, serviceId: string | null, input: z.infer<typeof guideServiceSchema>) {
  const { actor: p, kind } = await requireApprovedProvider(db, actor);
  if (kind !== "guide") throw new ForbiddenError("Only guides can offer guide services.");
  const v = guideServiceSchema.parse(input);
  if (serviceId) {
    const { rowCount } = await db.query(
      `update guide_services set title=$3, description=$4, duration_minutes=$5, pricing_model=$6, base_price_minor=$7, max_group_size=$8,
              buffer_minutes=$9, min_notice_hours=$10, cancellation_policy=$11
        where id = $1 and provider_id = $2 and status <> 'archived'`,
      [serviceId, p.providerId, v.title, v.description, v.durationMinutes, v.pricingModel, v.basePriceMinor, v.maxGroupSize, v.bufferMinutes, v.minNoticeHours, v.cancellationPolicy],
    );
    if (!rowCount) throw new NotFoundError();
    return { id: serviceId };
  }
  const { rows } = await db.query<{ id: string }>(
    `insert into guide_services (provider_id, title, description, duration_minutes, pricing_model, base_price_minor, max_group_size, buffer_minutes, min_notice_hours, cancellation_policy)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [p.providerId, v.title, v.description, v.durationMinutes, v.pricingModel, v.basePriceMinor, v.maxGroupSize, v.bufferMinutes, v.minNoticeHours, v.cancellationPolicy],
  );
  return { id: rows[0].id };
}

/** Guide services publish immediately once the guide is approved; admins can suspend them. */
export async function setGuideServiceStatus(db: Queryable, actor: Actor | null, serviceId: string, status: "published" | "draft" | "archived") {
  const { actor: p, status: providerStatus } = await requireApprovedProvider(db, actor);
  if (status === "published" && providerStatus !== "approved") throw new UserError("Your profile must be approved before you can publish services.");
  const { rows } = await db.query<{ status: string }>("select status from guide_services where id = $1 and provider_id = $2", [serviceId, p.providerId]);
  if (!rows[0]) throw new NotFoundError();
  if (rows[0].status === "suspended") throw new UserError("This service was suspended by the platform. Contact support.");
  await db.query("update guide_services set status = $2 where id = $1", [serviceId, status]);
}

// ───────────────────────────── experiences ─────────────────────────────

export const experienceSchema = z.object({
  title: z.string().trim().min(3).max(140),
  summary: z.string().trim().min(10).max(300),
  description: z.string().trim().min(40, "Describe the experience in at least 40 characters").max(8000),
  destinationId: z.string().uuid("Choose a destination"),
  categoryId: z.string().uuid("Choose a category"),
  durationMinutes: z.number().int().min(15).max(24 * 60),
  pricingModel: z.enum(["per_person", "per_group"]),
  basePriceMinor: z.number().int().min(100, "Set a price").max(100_000_000),
  childPriceMinor: z.number().int().min(0).max(100_000_000).nullable(),
  maxGroupSize: z.number().int().min(1).max(500),
  minAge: z.number().int().min(0).max(99).nullable(),
  inclusions: z.array(z.string().trim().min(1).max(200)).max(20),
  exclusions: z.array(z.string().trim().min(1).max(200)).max(20),
  meetingPoint: z.string().trim().min(3).max(300),
  meetingLat: z.number().min(-5).max(5.5).nullable(),
  meetingLng: z.number().min(33.5).max(42).nullable(),
  preparationNotes: z.string().trim().max(2000).nullable(),
  accessibilityNotes: z.string().trim().max(2000).nullable(),
  restrictions: z.string().trim().max(2000).nullable(),
  cancellationPolicy: z.enum(["flexible", "moderate", "strict"]),
  minNoticeHours: z.number().int().min(0).max(720),
  travelStyles: z.array(z.string().max(40)).max(8),
});
export type ExperienceInput = z.infer<typeof experienceSchema>;

export async function saveExperience(db: Queryable, actor: Actor | null, experienceId: string | null, input: ExperienceInput) {
  const { actor: p } = await requireApprovedProvider(db, actor);
  const v = experienceSchema.parse(input);
  const values = [
    v.title, v.summary, v.description, v.destinationId, v.categoryId, v.durationMinutes, v.pricingModel, v.basePriceMinor, v.childPriceMinor,
    v.maxGroupSize, v.minAge, v.inclusions, v.exclusions, v.meetingPoint, v.meetingLat, v.meetingLng, v.preparationNotes, v.accessibilityNotes,
    v.restrictions, v.cancellationPolicy, v.minNoticeHours, v.travelStyles,
  ];
  if (experienceId) {
    const { rows } = await db.query<{ status: ListingStatus }>("select status from experiences where id = $1 and provider_id = $2", [experienceId, p.providerId]);
    if (!rows[0]) throw new NotFoundError();
    if (rows[0].status === "archived" || rows[0].status === "suspended") throw new UserError(`This listing is ${rows[0].status} and can't be edited.`);
    // Material edits to a published listing go back to review. Existing bookings keep their snapshots.
    const nextStatus = rows[0].status === "published" ? "pending_review" : rows[0].status;
    await db.query(
      `update experiences set title=$3, summary=$4, description=$5, destination_id=$6, category_id=$7, duration_minutes=$8, pricing_model=$9,
              base_price_minor=$10, child_price_minor=$11, max_group_size=$12, min_age=$13, inclusions=$14, exclusions=$15, meeting_point=$16,
              meeting_lat=$17, meeting_lng=$18, preparation_notes=$19, accessibility_notes=$20, restrictions=$21, cancellation_policy=$22,
              min_notice_hours=$23, travel_styles=$24, status=$25
        where id = $1 and provider_id = $2`,
      [experienceId, p.providerId, ...values, nextStatus],
    );
    return { id: experienceId, status: nextStatus };
  }
  const slug = await uniqueSlug(db, "experiences", v.title);
  const { rows } = await db.query<{ id: string }>(
    `insert into experiences (title, summary, description, destination_id, category_id, duration_minutes, pricing_model, base_price_minor,
                              child_price_minor, max_group_size, min_age, inclusions, exclusions, meeting_point, meeting_lat, meeting_lng,
                              preparation_notes, accessibility_notes, restrictions, cancellation_policy, min_notice_hours, travel_styles, provider_id, slug)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) returning id`,
    [...values, p.providerId, slug],
  );
  return { id: rows[0].id, status: "draft" as const };
}

export async function submitExperienceForReview(db: Queryable, actor: Actor | null, experienceId: string) {
  const { actor: p, status } = await requireApprovedProvider(db, actor);
  if (status !== "approved") throw new UserError("Your profile must be approved before listings can be reviewed.");
  const { rows } = await db.query<{ status: ListingStatus }>("select status from experiences where id = $1 and provider_id = $2", [experienceId, p.providerId]);
  if (!rows[0]) throw new NotFoundError();
  listingMachine.assert(rows[0].status, "pending_review");
  await db.query("update experiences set status = 'pending_review' where id = $1", [experienceId]);
}

export async function archiveExperience(db: Queryable, actor: Actor | null, experienceId: string) {
  const { actor: p } = await requireApprovedProvider(db, actor);
  const { rows } = await db.query<{ status: ListingStatus }>("select status from experiences where id = $1 and provider_id = $2", [experienceId, p.providerId]);
  if (!rows[0]) throw new NotFoundError();
  listingMachine.assert(rows[0].status, "archived");
  await db.query("update experiences set status = 'archived' where id = $1", [experienceId]);
  // Future open slots without reservations are closed; reserved ones stay so bookings are honoured.
  await db.query("update experience_slots set status = 'closed' where experience_id = $1 and reserved = 0 and starts_at > now()", [experienceId]);
}

export async function moderateListing(db: Queryable, actor: Actor | null, experienceId: string, decision: "published" | "rejected" | "suspended", reason: string) {
  const a = requireAdmin(actor);
  if (reason.trim().length < 3) throw new UserError("A documented reason is required.");
  const { rows } = await db.query<{ status: ListingStatus; user_id: string; title: string }>(
    "select e.status, p.user_id, e.title from experiences e join provider_profiles p on p.id = e.provider_id where e.id = $1",
    [experienceId],
  );
  const e = rows[0];
  if (!e) throw new NotFoundError();
  listingMachine.assert(e.status, decision);
  await db.query("update experiences set status = $2, moderation_notes = $3 where id = $1", [experienceId, decision, reason.trim()]);
  await audit(db, { actorId: a.userId, actorRole: "admin", action: `listing.${decision}`, entityType: "experience", entityId: experienceId, reason });
  await notify(db, {
    userId: e.user_id,
    type: "listing.status",
    title: `${e.title}: ${decision}`,
    body: decision === "published" ? "Your listing is now live." : `Reason: ${reason}`,
    link: "/provider/listings",
    dedupeKey: `listing.status:${experienceId}:${decision}:${Date.now()}`,
  });
}

export async function listOwnExperiences(db: Queryable, actor: Actor | null) {
  const p = requireProvider(actor);
  const { rows } = await db.query<{
    id: string;
    slug: string;
    title: string;
    status: ListingStatus;
    base_price_minor: number;
    pricing_model: string;
    moderation_notes: string | null;
    upcoming_slots: number;
    destination_name: string;
  }>(
    `select e.id, e.slug, e.title, e.status, e.base_price_minor, e.pricing_model, e.moderation_notes, d.name as destination_name,
            (select count(*)::int from experience_slots s where s.experience_id = e.id and s.starts_at > now() and s.status = 'open') as upcoming_slots
       from experiences e join destinations d on d.id = e.destination_id
      where e.provider_id = $1 and e.status <> 'archived' order by e.created_at desc`,
    [p.providerId],
  );
  return rows;
}

export async function getOwnExperience(db: Queryable, actor: Actor | null, experienceId: string) {
  const p = requireProvider(actor);
  if (!z.string().uuid().safeParse(experienceId).success) throw new NotFoundError();
  const { rows } = await db.query<Record<string, unknown> & { id: string; status: ListingStatus; timezone: string }>(
    "select e.*, d.timezone from experiences e join destinations d on d.id = e.destination_id where e.id = $1 and e.provider_id = $2",
    [experienceId, p.providerId],
  );
  if (!rows[0]) throw new NotFoundError();
  const { rows: slots } = await db.query<{ id: string; starts_at: Date; ends_at: Date; capacity: number; reserved: number; status: string }>(
    "select id, starts_at, ends_at, capacity, reserved, status from experience_slots where experience_id = $1 and starts_at > now() - interval '1 day' order by starts_at limit 200",
    [experienceId],
  );
  return { experience: rows[0], slots };
}

export const slotBatchSchema = z
  .object({
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Choose at least one weekday"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    capacity: z.number().int().min(1).max(500),
  })
  .refine((v) => v.toDate >= v.fromDate, { message: "End date must be after start date", path: ["toDate"] });

/** Creates recurring slots. Existing slots at the same start time are left untouched. */
export async function createSlots(db: Queryable, actor: Actor | null, experienceId: string, input: z.infer<typeof slotBatchSchema>) {
  const p = requireProvider(actor);
  const v = slotBatchSchema.parse(input);
  const { rows } = await db.query<{ duration_minutes: number; timezone: string }>(
    "select e.duration_minutes, d.timezone from experiences e join destinations d on d.id = e.destination_id where e.id = $1 and e.provider_id = $2 and e.status not in ('archived', 'suspended')",
    [experienceId, p.providerId],
  );
  const e = rows[0];
  if (!e) throw new NotFoundError();
  let created = 0;
  for (let date = v.fromDate, i = 0; date <= v.toDate && i < 370; date = addDays(date, 1), i++) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (!v.weekdays.includes(weekday)) continue;
    const startsAt = fromZoned(date, v.startTime, e.timezone);
    if (startsAt <= new Date()) continue;
    const endsAt = new Date(startsAt.getTime() + e.duration_minutes * 60_000);
    const r = await db.query(
      "insert into experience_slots (experience_id, starts_at, ends_at, capacity) values ($1, $2, $3, $4) on conflict (experience_id, starts_at) do nothing",
      [experienceId, startsAt, endsAt, v.capacity],
    );
    created += r.rowCount;
  }
  return { created };
}

/** Closing a slot stops new bookings; existing reservations are kept and must be cancelled explicitly. */
export async function setSlotStatus(db: Queryable, actor: Actor | null, slotId: string, status: "open" | "closed") {
  const p = requireProvider(actor);
  const { rowCount } = await db.query(
    `update experience_slots s set status = $3 from experiences e
      where s.id = $1 and e.id = s.experience_id and e.provider_id = $2 and s.status <> 'cancelled'`,
    [slotId, p.providerId, status],
  );
  if (!rowCount) throw new NotFoundError();
}

export async function updateSlotCapacity(db: Queryable, actor: Actor | null, slotId: string, capacity: number) {
  const p = requireProvider(actor);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) throw new UserError("Capacity must be between 1 and 500.");
  const { rows } = await db.query<{ reserved: number }>(
    `select s.reserved from experience_slots s join experiences e on e.id = s.experience_id where s.id = $1 and e.provider_id = $2`,
    [slotId, p.providerId],
  );
  if (!rows[0]) throw new NotFoundError();
  if (capacity < rows[0].reserved) throw new UserError(`${rows[0].reserved} places are already reserved; capacity can't go below that.`);
  await db.query("update experience_slots set capacity = $2 where id = $1", [slotId, capacity]);
}

// ───────────────────────────── availability ─────────────────────────────

export const weeklyHoursSchema = z
  .array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    }),
  )
  .max(28)
  .refine((rules) => rules.every((r) => r.endTime > r.startTime), "Each end time must be after its start time");

/** Replaces weekly working hours. Existing reservations are unaffected (they're stored as holds). */
export async function setWeeklyHours(db: Db, actor: Actor | null, rules: z.infer<typeof weeklyHoursSchema>) {
  const p = requireProvider(actor);
  const v = weeklyHoursSchema.parse(rules);
  await db.transaction(async (tx) => {
    await tx.query("delete from availability_rules where provider_id = $1", [p.providerId]);
    for (const r of v) {
      await tx.query("insert into availability_rules (provider_id, weekday, start_time, end_time) values ($1, $2, $3, $4)", [
        p.providerId,
        r.weekday,
        r.startTime,
        r.endTime,
      ]);
    }
  });
}

export const exceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["unavailable", "available"]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  reason: z.string().trim().max(200).nullable(),
});

export async function addAvailabilityException(db: Queryable, actor: Actor | null, input: z.infer<typeof exceptionSchema>) {
  const p = requireProvider(actor);
  const v = exceptionSchema.parse(input);
  if (v.kind === "available" && (!v.startTime || !v.endTime)) throw new UserError("Extra availability needs a start and end time.");
  if ((v.startTime && !v.endTime) || (!v.startTime && v.endTime) || (v.startTime && v.endTime && v.endTime <= v.startTime)) {
    throw new UserError("Enter a valid time range, or leave both times empty to block the whole day.");
  }
  // Warn rather than silently break: blocked time that overlaps confirmed bookings is refused.
  if (v.kind === "unavailable") {
    const { rows } = await db.query<{ timezone: string }>("select timezone from provider_profiles where id = $1", [p.providerId]);
    const tz = rows[0].timezone;
    const start = fromZoned(v.date, v.startTime ?? "00:00", tz);
    const end = v.endTime ? fromZoned(v.date, v.endTime, tz) : fromZoned(addDays(v.date, 1), "00:00", tz);
    const conflicts = await db.query(
      "select 1 from inventory_holds where kind = 'guide' and guide_provider_id = $1 and status in ('held', 'confirmed') and during && tstzrange($2, $3)",
      [p.providerId, start, end],
    );
    if (conflicts.rowCount) {
      throw new UserError("You have bookings during this time. Cancel or reassign them through the booking first; blocking time doesn't cancel bookings.");
    }
  }
  await db.query(
    "insert into availability_exceptions (provider_id, date, kind, start_time, end_time, reason) values ($1,$2,$3,$4,$5,$6)",
    [p.providerId, v.date, v.kind, v.startTime, v.endTime, v.reason],
  );
}

export async function removeAvailabilityException(db: Queryable, actor: Actor | null, id: string) {
  const p = requireProvider(actor);
  await db.query("delete from availability_exceptions where id = $1 and provider_id = $2", [id, p.providerId]);
}

export async function getOwnAvailability(db: Queryable, actor: Actor | null) {
  const p = requireProvider(actor);
  const [rules, exceptions, holds] = await Promise.all([
    db.query<{ id: string; weekday: number; start_time: string; end_time: string }>(
      "select id, weekday, start_time, end_time from availability_rules where provider_id = $1 order by weekday, start_time",
      [p.providerId],
    ),
    db.query<{ id: string; date: string; kind: string; start_time: string | null; end_time: string | null; reason: string | null }>(
      "select id, date, kind, start_time, end_time, reason from availability_exceptions where provider_id = $1 and date >= current_date - 1 order by date",
      [p.providerId],
    ),
    db.query<{ lower: Date; upper: Date; status: string; reference: string; booking_id: string }>(
      `select lower(h.during) as lower, upper(h.during) as upper, h.status, b.reference, b.id as booking_id
         from inventory_holds h join bookings b on b.id = h.booking_id
        where h.kind = 'guide' and h.guide_provider_id = $1 and (h.status = 'confirmed' or (h.status = 'held' and h.expires_at > now()))
          and upper(h.during) > now()
        order by lower(h.during)`,
      [p.providerId],
    ),
  ]);
  return { rules: rules.rows, exceptions: exceptions.rows, reservations: holds.rows };
}

// ───────────────────────────── dashboard ─────────────────────────────

export async function providerOverview(db: Queryable, actor: Actor | null) {
  const p = requireProvider(actor);
  const { rows } = await db.query<{ pending_requests: number; upcoming: number; completed: number; listings: number; services: number; rating_avg: number | null; review_count: number }>(
    `select
       (select count(distinct b.id)::int from bookings b join booking_items bi on bi.booking_id = b.id
          where bi.provider_id = $1 and b.status = 'pending_provider' and bi.provider_status = 'pending') as pending_requests,
       (select count(distinct b.id)::int from bookings b join booking_items bi on bi.booking_id = b.id
          where bi.provider_id = $1 and b.status in ('confirmed', 'in_progress') and bi.ends_at > now() and bi.status = 'active') as upcoming,
       (select count(*)::int from booking_items bi where bi.provider_id = $1 and bi.status = 'completed') as completed,
       (select count(*)::int from experiences where provider_id = $1 and status = 'published') as listings,
       (select count(*)::int from guide_services where provider_id = $1 and status = 'published') as services,
       (select round(avg(rating)::numeric, 2) from reviews where provider_id = $1 and status = 'published') as rating_avg,
       (select count(*)::int from reviews where provider_id = $1 and status = 'published') as review_count`,
    [p.providerId],
  );
  return rows[0];
}

export async function providerEarnings(db: Queryable, actor: Actor | null) {
  const p = requireProvider(actor);
  const [balance, eligible, lines, payouts] = await Promise.all([
    providerBalance(db, p.providerId),
    eligibleForPayout(db, p.providerId),
    db.query<{ id: number; entry_type: string; amount_minor: number; currency: string; created_at: Date; reference: string | null; title: string | null }>(
      `select le.id, le.entry_type, -le.amount_minor as amount_minor, le.currency, le.created_at, b.reference, bi.title
         from ledger_entries le left join bookings b on b.id = le.booking_id left join booking_items bi on bi.id = le.booking_item_id
        where le.account = 'provider_payable' and le.provider_id = $1 order by le.created_at desc limit 100`,
      [p.providerId],
    ),
    db.query<{ id: string; amount_minor: number; currency: string; status: string; method: string; external_reference: string | null; created_at: Date; paid_at: Date | null }>(
      "select id, amount_minor, currency, status, method, external_reference, created_at, paid_at from payouts where provider_id = $1 order by created_at desc",
      [p.providerId],
    ),
  ]);
  return { balance, eligibleMinor: eligible, lines: lines.rows, payouts: payouts.rows };
}

/** Earnings become eligible for payout once the related booking is completed. */
export async function eligibleForPayout(db: Queryable, providerId: string): Promise<number> {
  const { rows } = await db.query<{ eligible: number }>(
    `select coalesce(-sum(le.amount_minor), 0)::bigint as eligible
       from ledger_entries le left join bookings b on b.id = le.booking_id
      where le.account = 'provider_payable' and le.provider_id = $1
        and (le.booking_id is null or b.status in ('completed', 'cancelled'))`,
    [providerId],
  );
  const pending = await db.query<{ amount: number }>(
    "select coalesce(sum(amount_minor), 0)::bigint as amount from payouts where provider_id = $1 and status = 'pending'",
    [providerId],
  );
  return Math.max(0, rows[0].eligible - pending.rows[0].amount);
}

export function localDateNow(tz: string) {
  return toZoned(new Date(), tz).date;
}
