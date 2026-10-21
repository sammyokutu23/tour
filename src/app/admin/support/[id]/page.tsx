import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Badge, Card, Checkbox, DefinitionList, Field, PageHeader, PageSkeleton, Select, Textarea } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { getSupportCase } from "@/server/services/community";
import { supportCaseAction } from "@/app/actions/admin";
import { NotFoundError } from "@/domain/authz";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Support case" };
type Params = Promise<{ id: string }>;

export default function SupportCaseAdminPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Params }) {
  const { id } = await params;
  const session = await requireRole(`/admin/support/${id}`, ["admin", "support"]);
  const c = await getSupportCase(await requestDb(), session.actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <div className="space-y-6">
      <PageHeader title={c.subject} description={<span className="flex gap-1.5"><Badge className="capitalize">{c.kind}</Badge><Badge tone={c.priority === "urgent" ? "danger" : "neutral"}>{c.priority}</Badge><Badge tone="info" className="capitalize">{c.status.replace("_", " ")}</Badge></span>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="p-5">
            <DefinitionList items={[
              { term: "Reference", detail: <span className="font-mono">{c.reference}</span> },
              { term: "Opened by", detail: c.opener_name ?? c.contact_email ?? "Anonymous" },
              { term: "Booking", detail: c.booking_id ? <Link className="font-mono underline" href={`/admin/bookings/${c.booking_id}`}>{c.booking_reference}</Link> : "—" },
              { term: "Opened", detail: formatDate(c.created_at, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
            ]} />
            <p className="mt-4 whitespace-pre-line text-sm">{c.description}</p>
          </Card>
          {c.events.map((e, i) => (
            <Card key={i} className="p-4 text-sm">
              <p className="text-xs text-ink-subtle">{e.actor ?? "System"} · {e.action} · {formatDate(e.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              <p className="mt-1 whitespace-pre-line">{e.note}</p>
            </Card>
          ))}
        </div>
        <Card className="h-fit p-5">
          <h2 className="mb-3 text-lg font-bold text-forest">Update case</h2>
          <ActionForm action={supportCaseAction.bind(null, id)} resetOnSuccess>
            <Field label="Status" htmlFor="status"><Select id="status" name="status" defaultValue={c.status}><option value="open">Open</option><option value="in_progress">In progress</option><option value="escalated">Escalated</option><option value="resolved">Resolved</option><option value="closed">Closed</option></Select></Field>
            <Field label="Note" htmlFor="note"><Textarea id="note" name="note" required /></Field>
            <Checkbox name="reply" label="Send this note to the requester as a reply" />
            <Checkbox name="assignToSelf" label="Assign to me" />
            <SubmitButton size="sm">Save</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
