import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { InviteLinkForm } from "@/components/travel/invite-link-form";
import { ReportForm } from "@/components/travel/report-form";
import { GuideAvatar } from "@/components/catalogue/cards";
import { Badge, Card, Checkbox, Container, Field, Input, PageHeader, PageSkeleton, Table, Td, Th } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { getGroup, listInvitations, listMembersForManagement } from "@/server/services/travel-groups";
import { blockAction, inviteEmailAction, memberRoleAction, removeMemberAction, revokeInvitationAction, transferAction } from "@/app/actions/travel";
import { NotFoundError } from "@/domain/authz";
import { INTEREST_LABEL } from "@/domain/travel-groups";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Members" };
type Params = Promise<{ groupId: string }>;

export default function MembersPage({ params }: { params: Params }) {
  return (
    <Container className="py-10">
      <Suspense fallback={<PageSkeleton />}>
        <Members params={params} />
      </Suspense>
    </Container>
  );
}

async function Members({ params }: { params: Params }) {
  const { groupId } = await params;
  const session = await requireSession(`/travel-together/${groupId}/members`);
  const db = await requestDb();
  const [group, data] = await Promise.all([getGroup(db, session.actor, groupId), listMembersForManagement(db, session.actor, groupId)]).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const isOrganizer = data.viewerRole !== "member";
  const isOwner = data.viewerRole === "organizer";
  const invitations = isOrganizer ? await listInvitations(db, session.actor, groupId) : [];
  const active = data.members.filter((m) => m.status === "active");
  const former = data.members.filter((m) => m.status !== "active");

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/travel-together/${groupId}`} className="text-sm font-semibold text-forest underline">← {group.name}</Link>
        <PageHeader className="mt-2" title="Members" description={`${active.length} of ${group.maxMembers} places taken${group.placesLeft ? ` · ${group.placesLeft} open` : " · group is full"}.`} />
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        {active.map((m) => {
          const me = m.user_id === session.actor.userId;
          return (
            <Card key={m.user_id} className="p-4">
              <div className="flex items-start gap-3">
                <GuideAvatar name={m.profile.visible ? m.profile.name : "?"} photoUrl={m.profile.photoUrl} className="h-12 w-12 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-forest">{m.profile.name}{me ? " (you)" : ""}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    <Badge tone={m.role === "member" ? "neutral" : "dark"} className="capitalize">{m.role.replace("_", "-")}</Badge>
                    {m.joined_at && <span className="text-xs text-ink-subtle">joined {formatDate(m.joined_at)}</span>}
                    {m.blockedByViewer && <Badge tone="danger">Blocked by you</Badge>}
                  </div>
                  {m.profile.visible ? (
                    <>
                      {m.profile.bio && <p className="mt-2 text-sm text-ink-muted">{m.profile.bio}</p>}
                      {m.profile.languages.length > 0 && <p className="mt-1 text-xs text-ink-subtle">Speaks {m.profile.languages.join(", ")}</p>}
                      {m.profile.interests.length > 0 && <p className="text-xs text-ink-subtle">Into {m.profile.interests.map((i) => INTEREST_LABEL[i] ?? i).join(", ")}</p>}
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-ink-subtle">This traveller keeps their profile private.</p>
                  )}
                </div>
              </div>
              {!me && (
                <div className="mt-3 flex flex-wrap items-start gap-3 border-t border-sand-200 pt-3">
                  {isOwner && m.role === "member" && <ActionButton action={memberRoleAction.bind(null, groupId, m.user_id, "co_organizer")}>Make co-organizer</ActionButton>}
                  {isOwner && m.role === "co_organizer" && <ActionButton action={memberRoleAction.bind(null, groupId, m.user_id, "member")}>Remove co-organizer</ActionButton>}
                  {isOwner && m.role !== "organizer" && (
                    <ActionButton action={transferAction.bind(null, groupId, m.user_id)} confirm={`Make ${m.profile.name} the organizer? You'll become a co-organizer.`} showSuccess>Transfer organizer role</ActionButton>
                  )}
                  {isOrganizer && m.role !== "organizer" && (isOwner || m.role === "member") && (
                    <details>
                      <summary className="cursor-pointer text-xs font-semibold text-terracotta-700">Remove…</summary>
                      <ActionForm action={removeMemberAction.bind(null, groupId, m.user_id)} className="mt-2 w-72 space-y-2 rounded-xl bg-sand p-3" confirm="I want to remove this member.">
                        <Field label="Reason (recorded, not shown to them)" htmlFor={`reason-${m.user_id}`}><Input id={`reason-${m.user_id}`} name="reason" required minLength={3} /></Field>
                        <Checkbox name="ban" label="Also prevent them from rejoining" />
                        <SubmitButton size="sm" variant="danger">Remove member</SubmitButton>
                      </ActionForm>
                    </details>
                  )}
                  <ActionButton action={blockAction.bind(null, m.user_id, !m.blockedByViewer)} variant="ghost" className="h-auto px-0 text-xs text-ink-muted" showSuccess>{m.blockedByViewer ? "Unblock" : "Block"}</ActionButton>
                  <ReportForm groupId={groupId} reportedUserId={m.user_id} label="Report" compact />
                </div>
              )}
            </Card>
          );
        })}
      </section>

      {isOrganizer && (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="p-5">
            <h2 className="text-lg font-bold text-forest">Invite by email</h2>
            <p className="mt-1 text-sm text-ink-muted">They must already have an account. For privacy we don&apos;t confirm whether an email is registered.</p>
            <ActionForm action={inviteEmailAction.bind(null, groupId)} resetOnSuccess className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label="Email" htmlFor="invite-email" className="flex-1"><Input id="invite-email" name="email" type="email" required /></Field>
              <SubmitButton pendingLabel="Sending…">Send invitation</SubmitButton>
            </ActionForm>
          </Card>
          <Card className="p-5">
            <h2 className="text-lg font-bold text-forest">Invitation link</h2>
            <p className="mt-1 text-sm text-ink-muted">Share privately. Links expire and stop working after the set number of uses; you can revoke them any time.</p>
            <InviteLinkForm groupId={groupId} />
          </Card>
        </section>
      )}

      {isOrganizer && invitations.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl text-forest">Invitations</h2>
          <Table>
            <thead><tr><Th>Type</Th><Th>For</Th><Th>Status</Th><Th>Uses</Th><Th>Expires</Th><Th></Th></tr></thead>
            <tbody>
              {invitations.map((i) => (
                <tr key={i.id}>
                  <Td className="capitalize">{i.kind}</Td>
                  <Td>{i.invitee ?? "Anyone with the link"}</Td>
                  <Td><Badge tone={i.status === "pending" ? "info" : i.status === "accepted" ? "success" : "neutral"}>{i.status}</Badge></Td>
                  <Td>{i.use_count}/{i.max_uses}</Td>
                  <Td>{formatDate(i.expires_at)}</Td>
                  <Td>{i.status === "pending" && <ActionButton action={revokeInvitationAction.bind(null, i.id)} variant="ghost" className="h-8">Revoke</ActionButton>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}

      {isOrganizer && former.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl text-forest">Former members</h2>
          <ul className="space-y-2 text-sm">
            {former.map((m) => (
              <li key={m.user_id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2">
                <span className="font-medium">{m.profile.name}</span>
                <Badge tone={m.status === "banned" ? "danger" : "neutral"} className="capitalize">{m.status}</Badge>
                {m.left_at && <span className="text-xs text-ink-subtle">{formatDate(m.left_at)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
