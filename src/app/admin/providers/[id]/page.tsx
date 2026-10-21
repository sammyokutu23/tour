import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Alert, Badge, Card, DefinitionList, Field, Input, PageHeader, PageSkeleton, Select, Textarea } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { getProviderForAdmin } from "@/server/services/providers";
import { providerDecisionAction, verificationAction } from "@/app/actions/admin";
import { NotFoundError } from "@/domain/authz";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Review provider" };
type Params = Promise<{ id: string }>;

export default function ProviderReviewPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Params }) {
  const { id } = await params;
  const session = await requireRole(`/admin/providers/${id}`, ["admin"]);
  const data = await getProviderForAdmin(await requestDb(), session.actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const p = data.provider;
  return (
    <div className="space-y-6">
      <PageHeader title={p.display_name} description={<span className="flex flex-wrap items-center gap-2"><Badge className="capitalize">{p.kind}</Badge><Badge tone="info" className="capitalize">{p.status.replace("_", " ")}</Badge>{p.is_demo && <Badge tone="gold">Demo</Badge>}</span>} />
      {p.status_reason && <Alert tone="info">Last decision note: {p.status_reason}</Alert>}
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-2 text-lg font-bold text-forest">Profile</h2>
            <DefinitionList items={[
              { term: "Email", detail: p.email },
              { term: "Headline", detail: p.headline ?? "—" },
              { term: "Languages", detail: p.languages.join(", ") || "—" },
              { term: "Specialties", detail: p.specialties.join(", ") || "—" },
              { term: "Bio", detail: <span className="whitespace-pre-line">{p.bio ?? "—"}</span> },
            ]} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 text-lg font-bold text-forest">Documents</h2>
            {data.documents.length ? (
              <ul className="divide-y divide-sand-200 text-sm">
                {data.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-2">
                    <span><span className="font-medium">{d.original_filename}</span><span className="block text-xs text-ink-subtle">{d.doc_type.replace("_", " ")} · {formatDate(d.created_at)}</span></span>
                    <a href={`/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-forest underline">Open (audited)</a>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-muted">No documents uploaded.</p>}
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 text-lg font-bold text-forest">Verification history</h2>
            {data.verifications.length ? (
              <ul className="space-y-2 text-sm">
                {data.verifications.map((v) => (
                  <li key={v.id} className="rounded-xl bg-sand p-3">
                    <p><Badge tone={v.status === "passed" ? "success" : "danger"}>{v.status}</Badge> <span className="font-semibold capitalize">{v.verification_type.replace("_", " ")}</span>{v.reference_number ? ` · Ref ${v.reference_number}` : ""}</p>
                    <p className="mt-1">{v.decision_notes}</p>
                    <p className="text-xs text-ink-subtle">{v.reviewer} · {formatDate(v.created_at)}{v.expires_at ? ` · expires ${formatDate(v.expires_at)}` : ""}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-muted">Nothing recorded yet.</p>}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 text-lg font-bold text-forest">Record a check</h2>
            <ActionForm action={verificationAction.bind(null, id)} resetOnSuccess>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Check" htmlFor="verificationType"><Select id="verificationType" name="verificationType"><option value="identity">Identity</option><option value="tourism_license">Tourism licence</option><option value="guide_certification">Guide certification</option><option value="business_registration">Business registration</option><option value="insurance">Insurance</option></Select></Field>
                <Field label="Result" htmlFor="status"><Select id="status" name="status"><option value="passed">Passed</option><option value="failed">Failed</option><option value="revoked">Revoked</option></Select></Field>
                <Field label="Document checked" htmlFor="documentId"><Select id="documentId" name="documentId"><option value="">—</option>{data.documents.map((d) => <option key={d.id} value={d.id}>{d.original_filename}</option>)}</Select></Field>
                <Field label="Licence / reference no." htmlFor="referenceNumber"><Input id="referenceNumber" name="referenceNumber" /></Field>
                <Field label="Expires" htmlFor="expiresAt"><Input id="expiresAt" name="expiresAt" type="date" /></Field>
              </div>
              <Field label="What was checked and how" htmlFor="notes"><Textarea id="notes" name="notes" required /></Field>
              <SubmitButton size="sm">Record</SubmitButton>
            </ActionForm>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-lg font-bold text-forest">Decision</h2>
            <ActionForm action={providerDecisionAction.bind(null, id)}>
              <Field label="Decision" htmlFor="decision"><Select id="decision" name="decision"><option value="approved">Approve</option><option value="info_requested">Request more information</option><option value="rejected">Reject</option><option value="suspended">Suspend</option></Select></Field>
              <Field label="Documented reason (shared with provider)" htmlFor="reason"><Textarea id="reason" name="reason" required /></Field>
              <SubmitButton size="sm">Save decision</SubmitButton>
            </ActionForm>
            <p className="mt-2 text-xs text-ink-subtle">Approval requires a passed identity check. The public “Verified” badge additionally requires a passed licence, certification or business registration.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
