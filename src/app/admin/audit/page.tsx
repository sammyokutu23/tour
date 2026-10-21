import { Suspense } from "react";
import { Button, Input, PageHeader, PageSkeleton, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { listAuditLogs } from "@/server/services/admin";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Audit log" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function AuditPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Append-only record of privileged actions. Sensitive values are redacted." />
      <Suspense fallback={<PageSkeleton />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await requireRole("/admin/audit", ["admin"]);
  const action = typeof sp.action === "string" ? sp.action : "";
  const rows = await listAuditLogs(await requestDb(), session.actor, { action });
  return (
    <>
      <form method="get" className="flex gap-2"><Input name="action" aria-label="Action prefix" placeholder="Action prefix, e.g. booking." defaultValue={action} className="w-72" /><Button type="submit" variant="secondary">Filter</Button></form>
      <Table>
        <thead><tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>Reason</Th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap">{formatDate(r.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Td>
              <Td>{r.actor_name ?? "System"}<span className="block text-xs text-ink-subtle">{r.actor_role}</span></Td>
              <Td className="font-mono text-xs">{r.action}</Td>
              <Td className="text-xs">{r.entity_type}<span className="block max-w-40 truncate font-mono text-ink-subtle">{r.entity_id}</span></Td>
              <Td className="max-w-64 text-xs">{r.reason ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
