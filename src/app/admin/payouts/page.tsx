import { Suspense } from "react";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Badge, EmptyState, Input, PageHeader, PageSkeleton, Select, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { listPayoutCandidates } from "@/server/services/admin";
import { createPayoutAction, payoutCancelAction, payoutPaidAction } from "@/app/actions/admin";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Payouts" };

export default function PayoutsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Payouts" description="Only earnings from completed bookings are eligible. Create a payout, send the money through your bank or M-Pesa B2C, then record the transfer reference — that posts the ledger entry." />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const session = await requireRole("/admin/payouts", ["admin"]);
  const { candidates, payouts } = await listPayoutCandidates(await requestDb(), session.actor);
  return (
    <>
      <section>
        <h2 className="mb-3 text-lg font-bold text-forest">Eligible balances</h2>
        {candidates.length ? (
          <Table>
            <thead><tr><Th>Provider</Th><Th>Eligible</Th><Th>Create payout</Th></tr></thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id}>
                  <Td className="font-semibold">{c.display_name}<span className="block text-xs capitalize text-ink-subtle">{c.kind}</span></Td>
                  <Td>{formatMoney(c.eligibleMinor)}</Td>
                  <Td>
                    {c.eligibleMinor > 0 ? (
                      <ActionForm action={createPayoutAction.bind(null, c.id)} className="flex flex-wrap gap-2">
                        <Input name="amount" type="number" aria-label="Amount (KES)" defaultValue={c.eligibleMinor / 100} max={c.eligibleMinor / 100} className="h-8 w-28" />
                        <Select name="method" aria-label="Method" className="h-8 w-36"><option value="mpesa_b2c">M-Pesa B2C</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></Select>
                        <SubmitButton size="sm" className="h-8">Create</SubmitButton>
                      </ActionForm>
                    ) : <span className="text-xs text-ink-subtle">Nothing eligible</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="No provider earnings yet" />}
      </section>
      <section>
        <h2 className="mb-3 text-lg font-bold text-forest">Payout history</h2>
        {payouts.length ? (
          <Table>
            <thead><tr><Th>Created</Th><Th>Provider</Th><Th>Amount</Th><Th>Status</Th><Th>Action</Th></tr></thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <Td>{formatDate(p.created_at)}</Td><Td>{p.provider_name}</Td><Td>{formatMoney(p.amount_minor, p.currency)}</Td>
                  <Td><Badge tone={p.status === "paid" ? "success" : p.status === "pending" ? "gold" : "neutral"}>{p.status}</Badge>{p.external_reference && <span className="block font-mono text-xs">{p.external_reference}</span>}</Td>
                  <Td>
                    {p.status === "pending" && (
                      <div className="flex flex-wrap gap-2">
                        <ActionForm action={payoutPaidAction.bind(null, p.id)} className="flex gap-2">
                          <Input name="reference" aria-label="Transfer reference" placeholder="Transfer ref" required className="h-8 w-32" />
                          <SubmitButton size="sm" className="h-8">Mark paid</SubmitButton>
                        </ActionForm>
                        <ActionButton action={payoutCancelAction.bind(null, p.id)} variant="ghost" className="h-8" confirm="Cancel payout?">Cancel</ActionButton>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <p className="text-sm text-ink-muted">No payouts yet.</p>}
      </section>
    </>
  );
}
