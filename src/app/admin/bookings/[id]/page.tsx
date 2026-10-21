import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BookingItems, BookingStatusBadges, PaymentsList, PriceBreakdown, StatusTimeline } from "@/components/bookings/booking-parts";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Alert, Card, Field, Input, PageHeader, PageSkeleton, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { getBookingView } from "@/server/services/bookings";
import { getBookingLedger } from "@/server/services/admin";
import { adminCancelAction, adminCompleteAction } from "@/app/actions/admin";
import { NotFoundError } from "@/domain/authz";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Booking" };
type Params = Promise<{ id: string }>;

export default function AdminBookingPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Params }) {
  const { id } = await params;
  const session = await requireRole(`/admin/bookings/${id}`, ["admin", "support"]);
  const db = await requestDb();
  const view = await getBookingView(db, session.actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const isAdmin = view.access === "admin";
  const ledger = isAdmin ? await getBookingLedger(db, session.actor, id) : [];
  return (
    <div className="space-y-6">
      <PageHeader title={view.reference} description={<BookingStatusBadges status={view.status} paymentStatus={view.paymentStatus} />} />
      {!isAdmin && <Alert tone="info">Support view: payment details and personal notes are hidden. Escalate to an administrator for financial actions.</Alert>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <BookingItems view={view} />
          {isAdmin && (
            <Card className="p-5">
              <h2 className="mb-3 text-lg font-bold text-forest">Ledger</h2>
              {ledger.length ? (
                <Table>
                  <thead><tr><Th>Type</Th><Th>Account</Th><Th className="text-right">Amount</Th></tr></thead>
                  <tbody>{ledger.map((l) => <tr key={l.id}><Td>{l.entry_type.replace("_", " ")}</Td><Td>{l.account}{l.provider_name ? ` · ${l.provider_name}` : ""}</Td><Td className="text-right font-mono">{formatMoney(l.amount_minor, l.currency)}</Td></tr>)}</tbody>
                </Table>
              ) : <p className="text-sm text-ink-muted">No ledger entries (unpaid booking).</p>}
              <p className="mt-2 text-xs text-ink-subtle">Debits positive, credits negative. Each transaction balances to zero; entries are append-only.</p>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          {isAdmin && <Card className="p-5"><h2 className="mb-3 text-lg font-bold text-forest">Price</h2><PriceBreakdown view={view} /></Card>}
          {isAdmin && <Card className="p-5"><h2 className="mb-3 text-lg font-bold text-forest">Payments</h2><PaymentsList view={view} /></Card>}
          <Card className="p-5"><h2 className="mb-3 text-lg font-bold text-forest">History</h2><StatusTimeline view={view} /></Card>
          {isAdmin && ["pending_provider", "awaiting_payment", "confirmed", "in_progress", "cancellation_requested"].includes(view.status) && (
            <Card className="p-5">
              <h2 className="text-lg font-bold text-forest">Platform cancellation</h2>
              <p className="mt-1 text-sm text-ink-muted">Cancels all active items with a full refund to the traveller.</p>
              <ActionForm action={adminCancelAction.bind(null, view.id)} className="mt-3 space-y-3" confirm="Cancel this booking and refund in full?">
                <Field label="Documented reason" htmlFor="reason"><Input id="reason" name="reason" required /></Field>
                <SubmitButton size="sm" variant="danger">Cancel booking</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {isAdmin && ["confirmed", "in_progress"].includes(view.status) && (
            <Card className="p-5">
              <h2 className="text-lg font-bold text-forest">Mark completed</h2>
              <p className="mt-1 text-sm text-ink-muted">Normally automatic after the last activity ends.</p>
              <ActionForm action={adminCompleteAction.bind(null, view.id)} className="mt-3 space-y-3">
                <Field label="Documented reason" htmlFor="reason2"><Input id="reason2" name="reason" required /></Field>
                <SubmitButton size="sm" variant="secondary">Mark completed</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
