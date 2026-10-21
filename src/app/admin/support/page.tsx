import Link from "next/link";
import { Suspense } from "react";
import { Badge, EmptyState, PageHeader, PageSkeleton, TabNav, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { listSupportQueue } from "@/server/services/community";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Support & disputes" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function SupportQueuePage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Support & disputes" description="Safety reports are marked urgent. Support agents can escalate; administrators resolve disputes." />
      <Suspense fallback={<PageSkeleton />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const view = sp.view === "all" ? "all" : "open";
  const session = await requireRole("/admin/support", ["admin", "support"]);
  const rows = await listSupportQueue(await requestDb(), session.actor, view);
  return (
    <>
      <TabNav current={view} tabs={[{ key: "open", label: "Open", href: "/admin/support" }, { key: "all", label: "All", href: "/admin/support?view=all" }]} />
      {rows.length ? (
        <Table>
          <thead><tr><Th>Case</Th><Th>Kind</Th><Th>Priority</Th><Th>Status</Th><Th>Assigned</Th><Th>Opened</Th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <Td><Link href={`/admin/support/${c.id}`} className="font-semibold text-forest underline">{c.subject}</Link><span className="block font-mono text-xs text-ink-subtle">{c.reference}{c.booking_reference ? ` · ${c.booking_reference}` : ""}</span></Td>
                <Td className="capitalize">{c.kind}</Td>
                <Td><Badge tone={c.priority === "urgent" ? "danger" : c.priority === "high" ? "terracotta" : "neutral"}>{c.priority}</Badge></Td>
                <Td className="capitalize">{c.status.replace("_", " ")}</Td>
                <Td>{c.assigned_name ?? "—"}</Td>
                <Td>{formatDate(c.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : <EmptyState title="Queue is clear" />}
    </>
  );
}
