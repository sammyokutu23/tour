import Link from "next/link";
import { Suspense } from "react";
import { ActionButton } from "@/components/forms/action-button";
import { Alert, Card, Container, LinkButton, PageSkeleton } from "@/components/ui";
import { getSession, requestDb } from "@/server/auth/session";
import { getTravelProfile, previewInviteLink } from "@/server/services/travel-groups";
import { acceptInviteLinkAction } from "@/app/actions/travel";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Group invitation", robots: { index: false }, referrer: "no-referrer" };
type Params = Promise<{ token: string }>;

export default function InvitePage({ params }: { params: Params }) {
  return (
    <Container className="max-w-xl py-16">
      <Suspense fallback={<PageSkeleton />}>
        <Invite params={params} />
      </Suspense>
    </Container>
  );
}

async function Invite({ params }: { params: Params }) {
  const { token } = await params;
  const db = await requestDb();
  const preview = await previewInviteLink(db, token).catch(() => null);
  if (!preview) return <Alert tone="error" title="Invitation not found">This link is invalid. Ask the organizer for a new one.</Alert>;
  const session = await getSession();
  const profile = session ? await getTravelProfile(db, session.actor) : null;
  return (
    <Card className="p-6">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta-700">You&apos;re invited</p>
      <h1 className="mt-2 text-3xl text-forest">{preview.name}</h1>
      <p className="mt-1 text-ink-muted">{preview.destination} · {formatDate(preview.startDate)} – {formatDate(preview.endDate)}</p>
      <div className="mt-6">
        {!preview.valid ? (
          <Alert tone="warning">This invitation has expired, been revoked or already been used.</Alert>
        ) : !session ? (
          <div className="flex gap-2"><LinkButton href={`/login?next=/travel-together/invite/${token}`}>Sign in to accept</LinkButton><LinkButton href={`/register?next=/travel-together/invite/${token}`} variant="secondary">Create an account</LinkButton></div>
        ) : !profile?.adultConfirmed || !profile.guidelinesAccepted ? (
          <Alert tone="info">Please <Link href={`/travel-together/profile?next=/travel-together/invite/${token}`} className="font-semibold underline">confirm you&apos;re 18+ and accept the guidelines</Link> first.</Alert>
        ) : (
          <ActionButton action={acceptInviteLinkAction.bind(null, token)} variant="primary" size="lg" pendingLabel="Joining…">Join the group</ActionButton>
        )}
      </div>
    </Card>
  );
}
