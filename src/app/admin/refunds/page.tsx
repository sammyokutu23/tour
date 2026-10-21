import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Badge, EmptyState, Input, PageHeader, PageSkeleton, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { listRefundsAdmin } from "@/server/services/admin";
import { refundAdminAction } from "@/app/actions/admin";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Refunds" };

export default function RefundsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Refunds" description="Automatic refunds run through the payment provider. M-Pesa reversals are processed manually by finance and recorded here with the external reference." />
      <Suspense fallback={<PageSkeleton />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const session = await requireRole("/admin/refunds", ["admin"]);
  const rows = await listRefundsAdmin(await requestDb(), session.actor);
  if (!rows.length) return <EmptyState title="No refunds" />;
  return (
    <Table>
      <thead><tr><Th>Booking</Th><Th>Amount</Th><Th>Status</Th><Th>Reason</Th><Th>Action</Th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td><Link href={`/admin/bookings/${r.booking_id}`} className="font-mono underline">{r.reference}</Link><span className="block text-xs text-ink-subtle">{formatDate(r.created_at)} · {r.provider}</span></Td>
            <Td className="font-semibold">{formatMoney(r.amount_minor, r.currency)}</Td>
            <Td><Badge tone={r.status === "succeeded" ? "success" : r.status === "failed" ? "danger" : "gold"}>{r.status.replace("_", " ")}</Badge></Td>
            <Td className="max-w-56 text-xs">{r.reason}</Td>
            <Td>
              {["manual_required", "requested", "failed", "processing"].includes(r.status) && (
                <div className="space-y-2">
                  {["requested", "failed"].includes(r.status) && (
                    <ActionForm action={refundAdminAction.bind(null, r.id, "retry")} className="flex gap-2">
                      <Input name="reason" aria-label="Reason" placeholder="Reason" required className="h-8 w-32" />
                      <SubmitButton size="sm" className="h-8">Send to provider</SubmitButton>
                    </ActionForm>
                  )}
                  <ActionForm action={refundAdminAction.bind(null, r.id, "mark_completed")} className="flex flex-wrap gap-2">
                    <Input name="externalReference" aria-label="External reference" placeholder="Transfer ref" required className="h-8 w-28" />
                    <Input name="reason" aria-label="Reason" placeholder="Reason" required className="h-8 w-28" />
                    <SubmitButton size="sm" variant="secondary" className="h-8">Mark refunded</SubmitButton>
                  </ActionForm>
                </div>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
