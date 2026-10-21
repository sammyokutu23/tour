import Link from "next/link";
import { Suspense } from "react";
import { Alert, Badge, PageHeader, PageSkeleton, Stat, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { adminListReports, adminTravelOverview } from "@/server/services/travel-groups";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Travel Together" };

export default function AdminTravelPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Travel Together" description="Group activity, safety reports and moderation." actions={<Link href="/admin/travel-together/groups" className="text-sm font-semibold text-forest underline">All groups →</Link>} />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  await requireRole("/admin/travel-together", ["admin"]);
  const db = await requestDb();
  const [m, reports, funnel] = await Promise.all([
    adminTravelOverview(db),
    adminListReports(db, "open"),
    db.query<{ name: string; n: number }>("select name, count(*)::int as n from analytics_events where name like 'group_%' or name = 'travel_together_viewed' group by name order by name"),
  ]);
  const decided = m.requests_approved + m.requests_declined;
  return (
    <>
      {m.urgent_reports > 0 && <Alert tone="error" title={`${m.urgent_reports} urgent safety report(s)`}>Review these first.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active groups" value={m.active_groups} hint={`${m.upcoming_groups} not started yet`} />
        <Stat label="Full groups" value={m.full_groups} />
        <Stat label="Active memberships" value={m.active_memberships} />
        <Stat label="Join approval rate" value={decided ? `${Math.round((m.requests_approved / decided) * 100)}%` : "—"} hint={`${decided} decided requests`} />
        <Stat label="Open reports" value={m.open_reports} />
        <Stat label="Suspended groups" value={m.suspended_groups} />
        <Stat label="Cancelled groups" value={m.cancelled_groups} />
        <Stat label="Completed groups" value={m.completed_groups} />
      </div>
      <section>
        <h2 className="mb-3 text-xl text-forest">Open reports</h2>
        {reports.length ? (
          <Table>
            <thead><tr><Th>Reported</Th><Th>Category</Th><Th>Priority</Th><Th>Status</Th><Th>Received</Th></tr></thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <Td><Link href={`/admin/travel-together/reports/${r.id}`} className="font-semibold text-forest underline">{r.reported_name ?? r.group_name ?? "Message"}</Link>{r.group_name && <span className="block text-xs text-ink-subtle">in {r.group_name}{r.has_message ? " · message" : ""}</span>}</Td>
                  <Td className="capitalize">{r.category}</Td>
                  <Td><Badge tone={r.priority === "urgent" ? "danger" : r.priority === "high" ? "terracotta" : "neutral"}>{r.priority}</Badge></Td>
                  <Td className="capitalize">{r.status}</Td>
                  <Td>{formatDate(r.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <p className="text-sm text-ink-muted">No open reports.</p>}
      </section>
      <section>
        <h2 className="mb-3 text-xl text-forest">Funnel events (all time)</h2>
        {funnel.rows.length ? (
          <Table><thead><tr><Th>Event</Th><Th className="text-right">Count</Th></tr></thead><tbody>{funnel.rows.map((f) => <tr key={f.name}><Td>{f.name.replaceAll("_", " ")}</Td><Td className="text-right font-semibold">{f.n}</Td></tr>)}</tbody></Table>
        ) : <p className="text-sm text-ink-muted">No events yet.</p>}
        <p className="mt-2 text-xs text-ink-subtle">First-party events; linked to accounts only with analytics consent. Conversion rates = later step ÷ earlier step.</p>
      </section>
    </>
  );
}
