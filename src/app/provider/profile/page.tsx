import { Suspense } from "react";
import { FileText, ShieldCheck } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { ActionButton } from "@/components/forms/action-button";
import { Alert, Badge, Card, Checkbox, Field, Input, PageHeader, PageSkeleton, Select, Textarea } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { getOwnProvider, listProviderDocuments } from "@/server/services/providers";
import { listAllDestinationsBrief } from "@/server/services/catalogue";
import { saveProfileAction, submitProfileAction, uploadDocumentAction } from "@/app/actions/provider";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Profile & verification" };

const DOC_TYPES = [
  ["national_id", "National ID"],
  ["passport", "Passport"],
  ["tra_license", "Tourism Regulatory Authority licence"],
  ["guide_certification", "Guiding certification (e.g. KPSGA)"],
  ["business_registration", "Business registration"],
  ["insurance", "Insurance certificate"],
  ["other", "Other supporting document"],
] as const;

export default function ProviderProfilePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Profile & verification" description="This is what travellers see. Verified badges appear only after our team checks your documents." />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const session = await requireRole("/provider/profile", ["guide", "operator"]);
  const db = await requestDb();
  const [profile, destinations] = await Promise.all([getOwnProvider(db, session.actor), listAllDestinationsBrief(db)]);
  const docs = profile ? await listProviderDocuments(db, profile.id) : [];
  const { rows: verifications } = profile
    ? await db.query<{ verification_type: string; status: string; created_at: Date; expires_at: Date | null }>(
        "select distinct on (verification_type) verification_type, status, created_at, expires_at from provider_verifications where provider_id = $1 order by verification_type, created_at desc",
        [profile.id],
      )
    : { rows: [] };
  const canSubmit = profile && ["draft", "info_requested", "rejected"].includes(profile.status);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-bold text-forest">{profile ? "Public profile" : "Create your provider profile"}</h2>
        <ActionForm action={saveProfileAction}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={session.providerKind === "operator" || session.actor.roles.includes("operator") ? "Business name" : "Public name"} htmlFor="displayName" required>
              <Input id="displayName" name="displayName" defaultValue={profile?.display_name ?? session.displayName} required />
            </Field>
            <Field label="Headline" htmlFor="headline" hint="One line, e.g. “Birding specialist on the Rift Valley lakes”">
              <Input id="headline" name="headline" defaultValue={profile?.headline ?? ""} maxLength={160} />
            </Field>
            <Field label="About you" htmlFor="bio" hint="At least 80 characters. Describe your experience, style and what travellers can expect." className="sm:col-span-2">
              <Textarea id="bio" name="bio" defaultValue={profile?.bio ?? ""} className="min-h-36" maxLength={4000} />
            </Field>
            <Field label="Languages" htmlFor="languages" hint="Comma separated" required>
              <Input id="languages" name="languages" defaultValue={profile?.languages.join(", ") ?? "English, Swahili"} />
            </Field>
            <Field label="Specialties" htmlFor="specialties" hint="Comma separated, e.g. wildlife, birding, culture">
              <Input id="specialties" name="specialties" defaultValue={profile?.specialties.join(", ") ?? ""} />
            </Field>
            <Field label="Years of experience" htmlFor="yearsExperience">
              <Input id="yearsExperience" name="yearsExperience" type="number" min={0} max={70} defaultValue={profile?.years_experience ?? ""} />
            </Field>
            <Field label="Home base" htmlFor="baseDestinationId">
              <Select id="baseDestinationId" name="baseDestinationId" defaultValue={profile?.base_destination_id ?? ""}>
                <option value="">Select</option>
                {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Profile photo URL (https)" htmlFor="photoUrl" hint="Use a photo you own or have permission to use.">
              <Input id="photoUrl" name="photoUrl" type="url" defaultValue={profile?.photo_url ?? ""} />
            </Field>
            <Field label="Introduction video URL (https)" htmlFor="introVideoUrl">
              <Input id="introVideoUrl" name="introVideoUrl" type="url" defaultValue={profile?.intro_video_url ?? ""} />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Regions you work in</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {destinations.map((d) => <Checkbox key={d.id} name="regionIds" value={d.id} defaultChecked={profile?.region_ids.includes(d.id)} label={d.name} />)}
            </div>
          </fieldset>
          <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
        </ActionForm>
      </Card>

      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-forest"><ShieldCheck aria-hidden className="h-5 w-5" />Verification</h2>
          {profile ? (
            <>
              <p className="mt-2 text-sm">Status: <Badge tone={profile.status === "approved" ? "success" : profile.status === "rejected" || profile.status === "suspended" ? "danger" : "info"} className="capitalize">{profile.status.replace("_", " ")}</Badge></p>
              {profile.status_reason && <p className="mt-2 rounded-xl bg-sand p-3 text-sm">Note from our team: {profile.status_reason}</p>}
              {verifications.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {verifications.map((v) => (
                    <li key={v.verification_type} className="flex justify-between gap-2"><span className="capitalize">{v.verification_type.replace("_", " ")}</span><Badge tone={v.status === "passed" ? "success" : "danger"}>{v.status}{v.expires_at ? ` · to ${formatDate(v.expires_at)}` : ""}</Badge></li>
                  ))}
                </ul>
              )}
              <Alert tone="info" className="mt-4">
                Before launch, licensing requirements for each type of guiding and activity in Kenya must be confirmed. Upload what applies to you; our team records exactly what was checked.
              </Alert>
              {canSubmit && <div className="mt-4"><ActionButton action={submitProfileAction} variant="primary" size="md" showSuccess pendingLabel="Submitting…">Submit for review</ActionButton></div>}
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">Save your profile first, then upload documents.</p>
          )}
        </Card>

        {profile && (
          <Card className="p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-forest"><FileText aria-hidden className="h-5 w-5" />Documents</h2>
            <p className="mt-1 text-xs text-ink-subtle">Stored privately. Only you and authorised reviewers can open them, through links that expire after two minutes. PDF, JPEG, PNG or WebP up to 8 MB.</p>
            <ActionForm action={uploadDocumentAction} resetOnSuccess className="mt-4 space-y-3">
              <Field label="Document type" htmlFor="docType">
                <Select id="docType" name="docType">{DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
              </Field>
              <Field label="File" htmlFor="file">
                <Input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="py-2" required />
              </Field>
              <SubmitButton size="sm" variant="secondary" pendingLabel="Uploading…">Upload</SubmitButton>
            </ActionForm>
            {docs.length > 0 && (
              <ul className="mt-4 divide-y divide-sand-200 text-sm">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{d.original_filename}</span>
                      <span className="text-xs text-ink-subtle">{DOC_TYPES.find(([v]) => v === d.doc_type)?.[1]} · {formatDate(d.created_at)}</span>
                    </span>
                    <a href={`/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-forest underline">View</a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
