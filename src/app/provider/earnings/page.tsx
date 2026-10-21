import { Suspense } from "react";
import { Alert, Badge, EmptyState, PageHeader, PageSkeleton, Stat, Table, Td, Th } from "@/components/ui";
import { requestDb, requireProviderSession } from "@/server/auth/session";
import { providerEarnings } from "@/server/services/providers";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Earnings" };

const ENTRY: Record<string, string> = { payment_captured: "Booking paid", refund_issued: "Refund", payout_sent: "Payout", adjustment: "Adjustment", unallocated_payment: "Unallocated" };

export default function EarningsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Earnings" description="Your share after commission, from the platform ledger. Earnings become eligible for payout once the related booking is completed." />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const session = await requireProviderSession("/provider/earnings");
  const e = await providerEarnings(await requestDb(), session.actor);
  const owed = e.balance.find((b) => b.currency === "KES")?.owedMinor ?? 0;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total owed to you" value={formatMoney(owed)} hint="Including bookings not yet completed" />
        <Stat label="Eligible for payout" value={formatMoney(e.eligibleMinor)} hint="Completed bookings, less pending payouts" />
        <Stat label="Payouts sent" value={e.payouts.filter((p) => p.status === "paid").length} />
      </div>
      <Alert tone="info">Payouts are currently arranged by our finance team (M-Pesa or bank transfer) and recorded here with a reference.</Alert>
      <section>
        <h2 className="mb-3 text-xl font-bold text-forest">Ledger</h2>
        {e.lines.length ? (
          <Table>
            <thead><tr><Th>Date</Th><Th>Type</Th><Th>Booking</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>
              {e.lines.map((l) => (
                <tr key={l.id}>
                  <Td>{formatDate(l.created_at)}</Td>
                  <Td>{ENTRY[l.entry_type] ?? l.entry_type}{l.title ? <span className="block text-xs text-ink-subtle">{l.title}</span> : null}</Td>
                  <Td className="font-mono text-xs">{l.reference ?? "—"}</Td>
                  <Td className={`text-right font-semibold ${l.amount_minor < 0 ? "text-terracotta-700" : ""}`}>{formatMoney(l.amount_minor, l.currency)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="No earnings yet" description="Earnings appear when travellers pay for bookings that include your services." />}
      </section>
      {e.payouts.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold text-forest">Payouts</h2>
          <Table>
            <thead><tr><Th>Created</Th><Th>Method</Th><Th>Status</Th><Th>Reference</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>
              {e.payouts.map((p) => (
                <tr key={p.id}>
                  <Td>{formatDate(p.created_at)}</Td><Td>{p.method.replace("_", " ")}</Td>
                  <Td><Badge tone={p.status === "paid" ? "success" : p.status === "pending" ? "info" : "danger"}>{p.status}</Badge></Td>
                  <Td className="font-mono text-xs">{p.external_reference ?? "—"}</Td>
                  <Td className="text-right font-semibold">{formatMoney(p.amount_minor, p.currency)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}
    </>
  );
}
