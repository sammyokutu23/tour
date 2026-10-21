import { Suspense } from "react";
import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { Alert, Card, Container, PageSkeleton } from "@/components/ui";
import { requestDb, requireSession, safeNext } from "@/server/auth/session";
import { sandboxDecisionAction } from "@/app/actions/bookings";
import { sandboxEnabled } from "@/server/payments/sandbox";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Sandbox checkout", robots: { index: false } };
type Params = Promise<{ reference: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

/** Development stand-in for a hosted payment page. Clearly labelled; never available in production unless explicitly enabled. */
export default function SandboxCheckoutPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Container className="max-w-xl py-16">
      <Suspense fallback={<PageSkeleton />}>
        <Checkout params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Checkout({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { reference: raw } = await params;
  const reference = decodeURIComponent(raw);
  const sp = await searchParams;
  const session = await requireSession(`/checkout/sandbox/${raw}`);
  if (!sandboxEnabled()) notFound();
  const db = await requestDb();
  const { rows } = await db.query<{ amount_minor: number; currency: string; status: string; booking_ref: string; booking_id: string }>(
    `select st.amount_minor, st.currency, st.status, b.reference as booking_ref, b.id as booking_id
       from sandbox_transactions st
       join payment_attempts pa on pa.provider = 'sandbox' and pa.provider_reference = st.reference
       join bookings b on b.id = pa.booking_id
      where st.reference = $1 and b.traveller_id = $2`,
    [reference, session.actor.userId],
  );
  const tx = rows[0];
  if (!tx) notFound();
  const returnTo = safeNext(typeof sp.return === "string" ? sp.return : null, `/dashboard/bookings/${tx.booking_id}`);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 bg-gold px-6 py-4 text-forest-950">
        <FlaskConical aria-hidden className="h-6 w-6" />
        <div>
          <p className="font-bold">Sandbox payment provider</p>
          <p className="text-sm">Test mode — no real money is moved.</p>
        </div>
      </div>
      <div className="space-y-5 p-6">
        <div>
          <p className="text-sm text-ink-subtle">Booking {tx.booking_ref}</p>
          <p className="font-display text-4xl font-bold text-forest">{formatMoney(tx.amount_minor, tx.currency)}</p>
        </div>
        {tx.status !== "pending" ? (
          <Alert tone="info">This test payment has already been {tx.status}.</Alert>
        ) : (
          <>
            <p className="text-sm text-ink-muted">Choose an outcome to simulate. The platform will receive a signed callback and verify the result with this sandbox before updating your booking — the same steps a real provider triggers.</p>
            <div className="flex flex-wrap gap-3">
              <ActionButton action={sandboxDecisionAction.bind(null, reference, returnTo, "succeeded")} variant="primary" size="lg" pendingLabel="Processing…">Approve test payment</ActionButton>
              <ActionButton action={sandboxDecisionAction.bind(null, reference, returnTo, "failed")} variant="secondary" size="lg" pendingLabel="Processing…">Decline</ActionButton>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
