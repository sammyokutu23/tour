import Link from "next/link";
import { Suspense } from "react";
import { Badge, PageHeader, PageSkeleton, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { listPaymentsAdmin } from "@/server/services/admin";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Payments" };

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Payment attempts and raw provider events (deduplicated, signature-checked, re-verified)." />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const session = await requireRole("/admin/payments", ["admin"]);
  const { attempts, events } = await listPaymentsAdmin(await requestDb(), session.actor);
  const d = (x: Date) => formatDate(x, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <>
      <section>
        <h2 className="mb-3 text-lg font-bold text-forest">Attempts</h2>
        <Table>
          <thead><tr><Th>When</Th><Th>Booking</Th><Th>Provider</Th><Th>Status</Th><Th>Reference</Th><Th className="text-right">Amount</Th></tr></thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.id}>
                <Td>{d(a.created_at)}</Td>
                <Td><Link href={`/admin/bookings/${a.booking_id}`} className="font-mono underline">{a.reference}</Link></Td>
                <Td>{a.provider}</Td>
                <Td><Badge tone={a.status === "succeeded" ? "success" : a.status === "failed" ? "danger" : "info"}>{a.status}</Badge>{a.failure_reason && <span className="block text-xs text-ink-subtle">{a.failure_reason}</span>}</Td>
                <Td className="max-w-48 truncate font-mono text-xs">{a.provider_reference ?? "—"}</Td>
                <Td className="text-right">{formatMoney(a.amount_minor, a.currency)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-bold text-forest">Provider events</h2>
        <Table>
          <thead><tr><Th>Received</Th><Th>Provider</Th><Th>Type</Th><Th>Signature</Th><Th>Result</Th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <Td>{d(e.received_at)}</Td><Td>{e.provider}</Td><Td>{e.event_type}</Td>
                <Td><Badge tone={e.signature_valid ? "success" : "danger"}>{e.signature_valid ? "valid" : "invalid"}</Badge></Td>
                <Td>{e.processing_result ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </>
  );
}
