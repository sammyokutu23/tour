import Link from "next/link";
import { Suspense } from "react";
import { Alert, Card, PageHeader, PageSkeleton, Stat, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { adminMetrics } from "@/server/services/admin";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Overview" };

export default function AdminHome() {
  return (
    <div className="space-y-6">
      <PageHeader title="Operations overview" description="Live figures from the database. Definitions are listed below each metric." />
      <Suspense fallback={<PageSkeleton />}>
        <Metrics />
      </Suspense>
    </div>
  );
}

async function Metrics() {
  const session = await requireRole("/admin", ["admin", "support"]);
  const m = await adminMetrics(await requestDb(), session.actor);
  const isAdmin = session.actor.roles.includes("admin");
  return (
    <>
      {(m.pending_verifications > 0 || m.pending_listings > 0 || m.manual_refunds > 0 || m.failed_deliveries > 0) && (
        <Alert tone="warning" title="Needs attention">
          <ul className="list-inside list-disc">
            {m.pending_verifications > 0 && <li><Link className="underline" href="/admin/providers?status=submitted">{m.pending_verifications} provider verification(s)</Link></li>}
            {m.pending_listings > 0 && <li><Link className="underline" href="/admin/listings">{m.pending_listings} listing(s) awaiting review</Link></li>}
            {m.manual_refunds > 0 && <li><Link className="underline" href="/admin/refunds">{m.manual_refunds} refund(s) need action</Link></li>}
            {m.failed_deliveries > 0 && <li><Link className="underline" href="/admin/notifications">{m.failed_deliveries} failed notification(s)</Link></li>}
          </ul>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active users" value={m.users} />
        <Stat label="Approved providers" value={m.active_providers} />
        <Stat label="Pending verifications" value={m.pending_verifications} />
        <Stat label="Published experiences" value={m.published_experiences} />
        <Stat label="Awaiting provider" value={m.pending_requests} hint="Bookings in pending_provider" />
        <Stat label="Awaiting payment" value={m.awaiting_payment} />
        <Stat label="Confirmed / in progress" value={m.confirmed} />
        <Stat label="Completed bookings" value={m.completed} />
        {isAdmin && <Stat label="Gross booking value" value={formatMoney(m.gbv_minor)} hint="Totals of bookings ever confirmed" />}
        {isAdmin && <Stat label="Platform revenue" value={formatMoney(m.platform_revenue_minor)} hint="Ledger balance: commission + fees, net of refunds" />}
        {isAdmin && <Stat label="Refund volume" value={formatMoney(m.refund_volume_minor)} hint="Succeeded refunds" />}
        <Stat label="Open support cases" value={m.open_cases} />
      </div>
      <Card className="p-5">
        <h2 className="mb-3 text-lg font-bold text-forest">Product funnel — last 30 days</h2>
        {m.funnel.length ? (
          <Table>
            <thead><tr><Th>Event</Th><Th className="text-right">Count</Th></tr></thead>
            <tbody>{m.funnel.map((f) => <tr key={f.name}><Td>{f.name.replaceAll("_", " ")}</Td><Td className="text-right font-semibold">{f.n}</Td></tr>)}</tbody>
          </Table>
        ) : <p className="text-sm text-ink-muted">No events recorded yet.</p>}
        <p className="mt-2 text-xs text-ink-subtle">First-party events; linked to accounts only with the user&apos;s analytics consent.</p>
      </Card>
    </>
  );
}
