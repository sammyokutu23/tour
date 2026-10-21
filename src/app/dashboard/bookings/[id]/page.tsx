import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MessageSquare, ShieldCheck } from "lucide-react";
import { BookingItems, BookingStatusBadges, PaymentsList, PriceBreakdown, StatusTimeline } from "@/components/bookings/booking-parts";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Alert, Card, Field, Input, LinkButton, PageSkeleton, Select, Textarea } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { getBookingView } from "@/server/services/bookings";
import { availableProviders } from "@/server/payments";
import { cancelBookingAction, changeRequestAction, checkoutAction, reviewAction } from "@/app/actions/bookings";
import { planRefund } from "@/domain/cancellation";
import { NotFoundError } from "@/domain/authz";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Booking" };
type Params = Promise<{ id: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function BookingPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Booking params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Booking({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireSession(`/dashboard/bookings/${id}`);
  const db = await requestDb();
  const view = await getBookingView(db, session.actor, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  if (view.access !== "traveller") {
    // Providers and staff have their own views of the same booking.
    if (view.access === "provider") return <Alert tone="info">This booking is in your <Link className="underline" href={`/provider/bookings/${id}`}>provider dashboard</Link>.</Alert>;
    return <Alert tone="info">Open this booking from the <Link className="underline" href={`/admin/bookings/${id}`}>admin dashboard</Link>.</Alert>;
  }

  const providers = availableProviders(db).map((p) => ({ id: p.id, label: p.label, isSandbox: p.isSandbox }));
  const canPay = view.status === "awaiting_payment" || view.status === "payment_pending";
  const canCancel = ["pending_provider", "awaiting_payment", "confirmed"].includes(view.status);
  const canChange = ["pending_provider", "awaiting_payment", "confirmed", "in_progress"].includes(view.status) && !view.changeRequests.some((c) => c.status === "open");
  const preview = view.paymentStatus === "paid"
    ? planRefund(
        view.items.map((i) => ({ id: i.id, policy: i.cancellation_policy, startsAt: i.starts_at, lineTotalMinor: i.lineTotalMinor ?? 0, commissionMinor: 0, status: i.status })),
        { serviceFeeMinor: view.serviceFeeMinor, taxMinor: view.taxMinor },
        new Date(),
        "traveller",
      )
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-ink-subtle">{view.reference}</p>
          <h1 className="text-3xl font-bold text-forest">{view.tripTitle}</h1>
          <div className="mt-2"><BookingStatusBadges status={view.status} paymentStatus={view.paymentStatus} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {view.conversationId && <LinkButton href={`/dashboard/messages/${view.conversationId}`} variant="secondary"><MessageSquare aria-hidden className="h-4 w-4" />Message providers</LinkButton>}
          <LinkButton href={`/studio/${view.tripId}`} variant="ghost">View itinerary</LinkButton>
        </div>
      </div>

      {sp.requested && <Alert tone="success" title="Request sent">Your providers have been asked to confirm. We&apos;ll notify you when you can pay. Nothing has been charged.</Alert>}
      {sp.payment === "succeeded" && view.status === "confirmed" && <Alert tone="success" title="Payment verified — you're booked!">Your trip is confirmed. Details are below and in your itinerary.</Alert>}
      {sp.payment === "failed" && <Alert tone="error" title="Payment didn't go through">No money was taken. You can try again below.</Alert>}
      {view.status === "pending_provider" && view.holdExpiresAt && <Alert tone="info">Waiting for providers to respond (by {formatDate(view.holdExpiresAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}). Your places are held until then.</Alert>}
      {view.status === "provider_declined" && <Alert tone="warning" title="A provider couldn't accept">Your itinerary is back in draft. <Link href={`/studio/${view.tripId}`} className="font-semibold underline">Choose an alternative</Link> and request a new quote.</Alert>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-xl font-bold text-forest">What&apos;s booked</h2>
            <BookingItems view={view} />
          </section>

          {view.status === "completed" && view.items.some((i) => i.status === "completed" && !i.reviewed) && (
            <section>
              <h2 className="mb-3 text-xl font-bold text-forest">Leave a review</h2>
              <div className="space-y-4">
                {view.items.filter((i) => i.status === "completed" && !i.reviewed).map((i) => (
                  <Card key={i.id} className="p-5">
                    <p className="mb-3 font-semibold">{i.title}</p>
                    <ActionForm action={reviewAction.bind(null, i.id)}>
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,140px)_minmax(0,1fr)]">
                        <Field label="Rating" htmlFor={`rating-${i.id}`}>
                          <Select id={`rating-${i.id}`} name="rating" defaultValue="5">
                            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}
                          </Select>
                        </Field>
                        <Field label="Title (optional)" htmlFor={`title-${i.id}`}><Input id={`title-${i.id}`} name="title" maxLength={140} /></Field>
                      </div>
                      <Field label="Your review" htmlFor={`body-${i.id}`}><Textarea id={`body-${i.id}`} name="body" required minLength={10} maxLength={4000} /></Field>
                      <SubmitButton size="sm" pendingLabel="Publishing…">Publish review</SubmitButton>
                    </ActionForm>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-xl font-bold text-forest">Changes</h2>
            {view.changeRequests.length > 0 && (
              <ul className="mb-4 space-y-2">
                {view.changeRequests.map((c) => (
                  <li key={c.id} className="rounded-xl border border-sand-300 bg-white p-3 text-sm">
                    <p><span className="font-semibold capitalize">{c.status}</span> · {formatDate(c.createdAt)}</p>
                    <p className="mt-1">{c.message}</p>
                    {c.response && <p className="mt-2 rounded-lg bg-sand px-3 py-2">Response: {c.response}</p>}
                  </li>
                ))}
              </ul>
            )}
            {canChange ? (
              <Card className="p-5">
                <ActionForm action={changeRequestAction.bind(null, view.id)} resetOnSuccess>
                  <Field label="Request a change" htmlFor="message" hint="Describe what you'd like to change. Providers will reply here; confirmed bookings are never changed silently.">
                    <Textarea id="message" name="message" required minLength={5} maxLength={4000} />
                  </Field>
                  <SubmitButton size="sm" variant="secondary" pendingLabel="Sending…">Send request</SubmitButton>
                </ActionForm>
              </Card>
            ) : (
              !view.changeRequests.length && <p className="text-sm text-ink-muted">Changes can be requested while the booking is active.</p>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {canPay && (
            <Card className="border-gold p-5 ring-2 ring-gold/40">
              <h2 className="text-lg font-bold text-forest">Pay to confirm</h2>
              <p className="mt-1 font-display text-3xl font-bold text-forest">{formatMoney(view.totalMinor, view.currency)}</p>
              {view.holdExpiresAt && <p className="text-xs text-ink-subtle">Pay by {formatDate(view.holdExpiresAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} to keep your places.</p>}
              {providers.length ? (
                <ActionForm action={checkoutAction.bind(null, view.id, randomUUID())} className="mt-4 space-y-3">
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-semibold">Payment method</legend>
                    {providers.map((p, i) => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-sand-300 px-3 py-2.5 text-sm has-[:checked]:border-forest has-[:checked]:bg-forest-50">
                        <input type="radio" name="provider" value={p.id} defaultChecked={i === 0} className="accent-forest" />
                        <span className="font-medium">{p.label}</span>
                      </label>
                    ))}
                  </fieldset>
                  {providers.some((p) => p.id === "mpesa") && (
                    <Field label="M-Pesa phone number" htmlFor="phone" hint="Only needed for M-Pesa, e.g. 07XX XXX XXX">
                      <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" />
                    </Field>
                  )}
                  {providers.every((p) => p.isSandbox) && <Alert tone="warning">Test mode: payments use the sandbox provider. No real money is charged.</Alert>}
                  <SubmitButton className="w-full" variant="gold" size="lg" pendingLabel="Starting payment…">Continue to payment</SubmitButton>
                </ActionForm>
              ) : (
                <Alert tone="error" className="mt-4">Online payment isn&apos;t configured in this environment. Please contact support.</Alert>
              )}
              <p className="mt-3 flex items-start gap-2 text-xs text-ink-subtle"><ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />We confirm your booking only after the payment provider verifies the payment. We never see or store card details.</p>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-3 text-lg font-bold text-forest">Price</h2>
            <PriceBreakdown view={view} />
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-lg font-bold text-forest">Payments &amp; receipts</h2>
            <PaymentsList view={view} />
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-lg font-bold text-forest">History</h2>
            <StatusTimeline view={view} />
          </Card>

          {canCancel && (
            <Card className="p-5">
              <h2 className="text-lg font-bold text-forest">Cancel booking</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {preview
                  ? preview.totalRefundMinor > 0
                    ? `If you cancel now, ${formatMoney(preview.totalRefundMinor, view.currency)} would be refunded under the cancellation policies.`
                    : "Under the cancellation policies, cancelling now would not be refunded."
                  : "You haven't paid, so cancelling has no charge."}
              </p>
              <ActionForm action={cancelBookingAction.bind(null, view.id)} className="mt-3 space-y-3" confirm="I understand this cancels the whole booking and can't be undone.">
                <Field label="Reason" htmlFor="reason"><Input id="reason" name="reason" required minLength={3} maxLength={500} /></Field>
                <SubmitButton variant="danger" size="sm" pendingLabel="Cancelling…">Cancel booking</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <p className="text-xs text-ink-subtle">Problem with this booking? <Link href={`/contact?booking=${view.id}`} className="font-semibold underline">Contact support</Link> or <Link href={`/contact?booking=${view.id}&kind=safety`} className="font-semibold underline">report a safety concern</Link>.</p>
        </div>
      </div>
    </div>
  );
}
