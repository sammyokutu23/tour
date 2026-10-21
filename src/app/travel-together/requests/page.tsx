import Link from "next/link";
import { Suspense } from "react";
import { Inbox } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { GuideAvatar } from "@/components/catalogue/cards";
import { Badge, Card, Container, EmptyState, Input, PageHeader, PageSkeleton } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { listRequestsAndInvites } from "@/server/services/travel-groups";
import { respondInvitationAction, reviewRequestAction } from "@/app/actions/travel";
import { INTEREST_LABEL } from "@/domain/travel-groups";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Requests & invitations" };

export default function RequestsPage() {
  return (
    <Container className="py-10">
      <PageHeader title="Requests & invitations" description="Approve travellers for your groups and respond to invitations." />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </Container>
  );
}

async function Content() {
  const session = await requireSession("/travel-together/requests");
  const { incoming, mine, invitations } = await listRequestsAndInvites(await requestDb(), session.actor);
  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section>
        <h2 className="mb-3 text-xl text-forest">Requests to join your groups</h2>
        {incoming.length === 0 ? (
          <EmptyState icon={<Inbox className="h-6 w-6" />} title="No pending requests" description="When someone asks to join one of your groups, it appears here." />
        ) : (
          <ul className="space-y-4">
            {incoming.map((r) => (
              <li key={r.id}>
                <Card className="p-4">
                  <div className="flex items-start gap-3">
                    <GuideAvatar name={r.requester.visible ? r.requester.name : "?"} photoUrl={r.requester.photoUrl} className="h-11 w-11 text-sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-forest">{r.requester.name} <span className="font-normal text-ink-muted">wants to join</span> <Link href={`/travel-together/${r.group_id}`} className="underline">{r.group_name}</Link></p>
                      <p className="text-xs text-ink-subtle">{formatDate(r.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {r.places_left} place{r.places_left === 1 ? "" : "s"} left</p>
                      {r.message && <p className="mt-2 rounded-xl bg-sand px-3 py-2 text-sm">“{r.message}”</p>}
                      {r.requester.visible ? (
                        <>
                          {r.requester.bio && <p className="mt-2 text-sm text-ink-muted">{r.requester.bio}</p>}
                          {r.requester.interests.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{r.requester.interests.map((i) => <Badge key={i} tone="forest">{INTEREST_LABEL[i] ?? i}</Badge>)}</div>}
                        </>
                      ) : <p className="mt-2 text-xs text-ink-subtle">This traveller keeps their profile private.</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-sand-200 pt-3">
                    <ActionForm action={reviewRequestAction.bind(null, r.id, "approve")} className="flex items-end gap-2">
                      <SubmitButton size="sm" disabled={r.places_left <= 0} pendingLabel="Approving…">Approve</SubmitButton>
                    </ActionForm>
                    <ActionForm action={reviewRequestAction.bind(null, r.id, "decline")} className="flex flex-wrap items-end gap-2">
                      <Input name="note" aria-label="Optional note to the traveller" placeholder="Optional note" maxLength={500} className="h-9 w-56" />
                      <SubmitButton size="sm" variant="secondary" className="h-9" pendingLabel="Declining…">Decline</SubmitButton>
                    </ActionForm>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-xl text-forest">Invitations for you</h2>
          {invitations.length === 0 ? <p className="text-sm text-ink-muted">No invitations right now.</p> : (
            <ul className="space-y-3">
              {invitations.map((i) => (
                <li key={i.id}>
                  <Card className="p-4">
                    <p className="font-semibold text-forest"><Link href={`/travel-together/${i.group_id}`} className="underline">{i.group_name}</Link></p>
                    <p className="text-xs text-ink-subtle">From {i.inviter} · {formatDate(i.start_date)} – {formatDate(i.end_date)} · expires {formatDate(i.expires_at)}</p>
                    <div className="mt-3 flex gap-2">
                      <ActionButton action={respondInvitationAction.bind(null, i.id, "accept")} variant="primary">Accept</ActionButton>
                      <ActionButton action={respondInvitationAction.bind(null, i.id, "decline")} variant="ghost">Decline</ActionButton>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="mb-3 text-xl text-forest">Your requests</h2>
          {mine.length === 0 ? <p className="text-sm text-ink-muted">You haven&apos;t asked to join any groups yet.</p> : (
            <ul className="space-y-2">
              {mine.map((r, n) => (
                <li key={n} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm">
                  <Link href={`/travel-together/${r.group_id}`} className="font-medium underline">{r.group_name}</Link>
                  <Badge tone={r.status === "approved" ? "success" : r.status === "pending" ? "info" : "neutral"} className="capitalize">{r.status}</Badge>
                  {r.decision_note && <p className="w-full text-xs text-ink-subtle">“{r.decision_note}”</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
