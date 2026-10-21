import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { BookingItems, BookingStatusBadges, StatusTimeline } from "@/components/bookings/booking-parts";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Alert, Card, DefinitionList, Field, Input, LinkButton, PageSkeleton, Textarea } from "@/components/ui";
import { requestDb, requireProviderSession } from "@/server/auth/session";
import { getBookingView } from "@/server/services/bookings";
import { cancelBookingAction, respondAction, respondChangeAction } from "@/app/actions/bookings";
import { NotFoundError } from "@/domain/authz";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Booking" };
type Params = Promise<{ id: string }>;

export default function ProviderBookingPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Params }) {
  const { id } = await params;
  const session = await requireProviderSession(`/provider/bookings/${id}`);
  const view = await getBookingView(await requestDb(), session.actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (view.access !== "provider") notFound();
  const pending = view.status === "pending_provider" && view.items.some((i) => i.provider_status === "pending");
  const earnings = view.items.filter((i) => i.status !== "cancelled").reduce((s, i) => s + (i.providerEarningsMinor ?? 0), 0);
  const canCancel = ["awaiting_payment", "confirmed"].includes(view.status) && view.items.some((i) => i.status === "active");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-ink-subtle">{view.reference}</p>
          <h1 className="text-3xl font-bold text-forest">Booking for {view.traveller.name}</h1>
          <div className="mt-2"><BookingStatusBadges status={view.status} paymentStatus={view.paymentStatus} /></div>
        </div>
        {view.conversationId && <LinkButton href={`/provider/messages/${view.conversationId}`} variant="secondary"><MessageSquare aria-hidden className="h-4 w-4" />Message traveller</LinkButton>}
      </div>
      {view.status === "pending_provider" && !pending && <Alert tone="success">You&apos;ve accepted. Waiting for the other providers on this booking to respond.</Alert>}
      {view.status === "awaiting_payment" && <Alert tone="info">You&apos;ve accepted. The booking is confirmed once the traveller&apos;s payment is verified.</Alert>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <BookingItems view={view} />
          {view.changeRequests.length > 0 && (
            <section>
              <h2 className="mb-3 text-xl font-bold text-forest">Change requests</h2>
              <div className="space-y-3">
                {view.changeRequests.map((c) => (
                  <Card key={c.id} className="p-4">
                    <p className="text-sm"><strong className="capitalize">{c.status}</strong> · {formatDate(c.createdAt)}</p>
                    <p className="mt-1 text-sm">{c.message}</p>
                    {c.response && <p className="mt-2 rounded-lg bg-sand px-3 py-2 text-sm">Response: {c.response}</p>}
                    {c.status === "open" && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <ActionForm action={respondChangeAction.bind(null, c.id, "accepted")} className="space-y-2">
                          <Textarea name="response" aria-label="Reply" placeholder="Yes — here's what we'll change…" required className="min-h-16" />
                          <SubmitButton size="sm">Agree</SubmitButton>
                        </ActionForm>
                        <ActionForm action={respondChangeAction.bind(null, c.id, "declined")} className="space-y-2">
                          <Textarea name="response" aria-label="Reason" placeholder="Sorry, we can't because…" required className="min-h-16" />
                          <SubmitButton size="sm" variant="secondary">Decline</SubmitButton>
                        </ActionForm>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-subtle">Agreeing records your response. Time or price changes are made by cancelling and rebooking affected items, never by editing a confirmed booking.</p>
            </section>
          )}
        </div>
        <div className="space-y-6">
          {pending && (
            <Card className="border-gold p-5 ring-2 ring-gold/40">
              <h2 className="text-lg font-bold text-forest">Respond to request</h2>
              {view.holdExpiresAt && <p className="text-sm text-ink-muted">Please respond by {formatDate(view.holdExpiresAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.</p>}
              <div className="mt-4 space-y-4">
                <ActionForm action={respondAction.bind(null, view.id, "accept")} className="space-y-2">
                  <Field label="Note to traveller (optional)" htmlFor="note-accept"><Input id="note-accept" name="note" maxLength={1000} /></Field>
                  <SubmitButton className="w-full" pendingLabel="Accepting…">Accept booking</SubmitButton>
                </ActionForm>
                <ActionForm action={respondAction.bind(null, view.id, "decline")} className="space-y-2" confirm="Declining releases the whole request back to the traveller.">
                  <Field label="Reason for declining" htmlFor="note-decline"><Input id="note-decline" name="note" maxLength={1000} /></Field>
                  <SubmitButton className="w-full" variant="secondary" pendingLabel="Declining…">Decline</SubmitButton>
                </ActionForm>
              </div>
            </Card>
          )}
          <Card className="p-5">
            <h2 className="mb-2 text-lg font-bold text-forest">Traveller</h2>
            <DefinitionList items={[
              { term: "Name", detail: view.traveller.name },
              { term: "Party", detail: view.traveller.party },
              { term: "Dietary", detail: view.dietaryNotes || "None given" },
              { term: "Accessibility", detail: view.accessibilityNotes || "None given" },
              { term: "Your earnings", detail: formatMoney(earnings, view.currency) },
            ]} />
            <p className="mt-2 text-xs text-ink-subtle">Contact details stay private; use platform messages.</p>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-lg font-bold text-forest">History</h2>
            <StatusTimeline view={view} />
          </Card>
          {canCancel && (
            <Card className="p-5">
              <h2 className="text-lg font-bold text-forest">Cancel your services</h2>
              <p className="mt-1 text-sm text-ink-muted">Cancels only your items. The traveller gets a full refund for them, and cancellations affect your reliability ranking.</p>
              <ActionForm action={cancelBookingAction.bind(null, view.id)} className="mt-3 space-y-3" confirm="I understand the traveller will be refunded and notified.">
                <Field label="Reason" htmlFor="reason"><Input id="reason" name="reason" required minLength={3} /></Field>
                <SubmitButton size="sm" variant="danger" pendingLabel="Cancelling…">Cancel my services</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
