import Link from "next/link";
import { Suspense } from "react";
import { Badge, DemoBadge, EmptyState, PageHeader, PageSkeleton, TabNav, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { listProvidersForReview } from "@/server/services/providers";
import { formatDate } from "@/lib/time";
import type { ProviderStatus } from "@/domain/states";

export const metadata = { title: "Provider verification" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function ProvidersPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Provider verification" description="Review documents, record what was checked, then approve, reject or request information." />
      <Suspense fallback={<PageSkeleton />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? (sp.status as ProviderStatus) : undefined;
  const session = await requireRole("/admin/providers", ["admin"]);
  const rows = await listProvidersForReview(await requestDb(), session.actor, status);
  return (
    <>
      <TabNav current={status ?? "all"} tabs={[["all", "All"], ["submitted", "Submitted"], ["info_requested", "Info requested"], ["approved", "Approved"], ["rejected", "Rejected"], ["suspended", "Suspended"], ["draft", "Draft"]].map(([k, l]) => ({ key: k, label: l, href: k === "all" ? "/admin/providers" : `/admin/providers?status=${k}` }))} />
      {rows.length ? (
        <Table>
          <thead><tr><Th>Provider</Th><Th>Type</Th><Th>Status</Th><Th>Documents</Th><Th>Submitted</Th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <Td><Link href={`/admin/providers/${p.id}`} className="font-semibold text-forest underline">{p.display_name}</Link> {p.is_demo && <DemoBadge />}<span className="block text-xs text-ink-subtle">{p.email}</span></Td>
                <Td className="capitalize">{p.kind}</Td>
                <Td><Badge className="capitalize" tone={p.status === "approved" ? "success" : p.status === "submitted" ? "gold" : "neutral"}>{p.status.replace("_", " ")}</Badge></Td>
                <Td>{p.doc_count}</Td>
                <Td>{p.submitted_at ? formatDate(p.submitted_at) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : <EmptyState title="No providers in this state" />}
    </>
  );
}
