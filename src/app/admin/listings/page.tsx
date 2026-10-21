import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Badge, DemoBadge, EmptyState, Input, PageHeader, PageSkeleton, Select, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { listListingsForModeration } from "@/server/services/admin";
import { listingDecisionAction } from "@/app/actions/admin";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Listings" };

export default function ListingsAdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Listing moderation" description="Publish, reject or suspend experiences. Every decision needs a reason and is audited." />
      <Suspense fallback={<PageSkeleton />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const session = await requireRole("/admin/listings", ["admin"]);
  const rows = await listListingsForModeration(await requestDb(), session.actor);
  if (!rows.length) return <EmptyState title="No listings" />;
  return (
    <Table>
      <thead><tr><Th>Experience</Th><Th>Status</Th><Th>Updated</Th><Th>Decision</Th></tr></thead>
      <tbody>
        {rows.map((e) => (
          <tr key={e.id}>
            <Td><Link href={`/experiences/${e.slug}`} className="font-semibold text-forest underline">{e.title}</Link> {e.is_demo && <DemoBadge />}<span className="block text-xs text-ink-subtle">{e.provider_name} · {e.destination_name}</span></Td>
            <Td><Badge className="capitalize" tone={e.status === "published" ? "success" : e.status === "pending_review" ? "gold" : "neutral"}>{e.status.replace("_", " ")}</Badge></Td>
            <Td>{formatDate(e.updated_at)}</Td>
            <Td>
              <ActionForm action={listingDecisionAction.bind(null, e.id)} className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`d-${e.id}`}>Decision</label>
                <Select id={`d-${e.id}`} name="decision" className="h-9 w-32"><option value="published">Publish</option><option value="rejected">Reject</option><option value="suspended">Suspend</option></Select>
                <label className="sr-only" htmlFor={`r-${e.id}`}>Reason</label>
                <Input id={`r-${e.id}`} name="reason" placeholder="Reason" className="h-9 w-44" required />
                <SubmitButton size="sm" className="h-9">Apply</SubmitButton>
              </ActionForm>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
