import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Alert, Badge, Card, Checkbox, DefinitionList, Field, PageHeader, PageSkeleton, Select, Textarea } from "@/components/ui";
import { getActor, requestDb, requireRole } from "@/server/auth/session";
import { adminGetReport } from "@/server/services/travel-groups";
import { adminHideMessageAction, adminReportAction } from "@/app/actions/travel";
import { NotFoundError, requireAdmin } from "@/domain/authz";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Report" };
type Params = Promise<{ id: string }>;

export default function ReportPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: { params: Params }) {
  const { id } = await params;
  await requireRole(`/admin/travel-together/reports/${id}`, ["admin"]);
  const actor = requireAdmin(await getActor());
  const r = await adminGetReport(await requestDb(), actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <div className="space-y-6">
      <Link href="/admin/travel-together" className="text-sm font-semibold text-forest underline">← Travel Together</Link>
      <PageHeader title={`Report: ${r.category}`} description={<span className="flex gap-1.5"><Badge tone={r.priority === "urgent" ? "danger" : "neutral"}>{r.priority}</Badge><Badge tone="info" className="capitalize">{r.status}</Badge></span>} />
      <Alert tone="info">Restricted information. The reporter&apos;s identity must not be shared with the reported person. Viewing a reported message is recorded in the audit log.</Alert>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="p-5">
            <DefinitionList items={[
              { term: "Received", detail: formatDate(r.created_at, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
              { term: "Reporter", detail: r.reporter_name },
              { term: "Reported user", detail: r.reported_name ? `${r.reported_name} (account ${r.reported_status})` : "—" },
              { term: "Group", detail: r.group_id ? <Link href={`/travel-together/${r.group_id}`} className="underline">{r.group_name} ({r.group_status})</Link> : "—" },
            ]} />
            <p className="mt-4 whitespace-pre-line rounded-xl bg-sand p-4 text-sm">{r.details}</p>
          </Card>
          {r.message_id && (
            <Card className="p-5">
              <h2 className="font-bold text-forest">Reported message</h2>
              <p className="mt-2 whitespace-pre-line rounded-xl border border-sand-300 p-4 text-sm">{r.message_body}</p>
              {r.message_hidden ? <Badge tone="neutral" className="mt-2">Already hidden</Badge> : <div className="mt-3"><ActionButton action={adminHideMessageAction.bind(null, r.message_id)} variant="danger" showSuccess confirm="Remove this message from the group chat?">Remove message</ActionButton></div>}
            </Card>
          )}
          {r.history.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-2 font-bold text-forest">Recent group history</h2>
              <ul className="space-y-1 text-sm">{r.history.map((h, n) => <li key={n} className="text-ink-muted">{formatDate(h.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {h.actor ?? "System"} · {h.category}/{h.action.replaceAll("_", " ")}</li>)}</ul>
            </Card>
          )}
        </div>
        <Card className="h-fit p-5">
          <h2 className="mb-3 font-bold text-forest">Investigation</h2>
          {r.outcome && <p className="mb-3 rounded-xl bg-[#eef8f1] p-3 text-sm"><strong>Outcome:</strong> {r.outcome}</p>}
          {r.admin_notes && <p className="mb-3 rounded-xl bg-sand p-3 text-sm"><strong>Notes:</strong> {r.admin_notes}</p>}
          <ActionForm action={adminReportAction.bind(null, r.id)}>
            <input type="hidden" name="groupId" value={r.group_id ?? ""} />
            <input type="hidden" name="reportedUserId" value={r.reported_user_id ?? ""} />
            <Field label="Status" htmlFor="status"><Select id="status" name="status" defaultValue={r.status === "open" ? "investigating" : r.status}><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></Select></Field>
            <Field label="Outcome (recorded)" htmlFor="outcome"><Textarea id="outcome" name="outcome" className="min-h-16" /></Field>
            <Field label="Internal notes (staff only)" htmlFor="adminNotes"><Textarea id="adminNotes" name="adminNotes" className="min-h-16" /></Field>
            {r.group_id && r.group_status === "published" && <Checkbox name="suspendGroup" label="Suspend the group" />}
            {r.reported_user_id && r.reported_status === "active" && <Checkbox name="restrictUser" label="Restrict (suspend) the reported account" />}
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
