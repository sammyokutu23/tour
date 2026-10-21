import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Megaphone } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { ReportForm } from "@/components/travel/report-form";
import { Card, Checkbox, Container, PageSkeleton, Textarea, cn } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { getGroupChat } from "@/server/services/travel-groups";
import { groupMessageAction, hideMessageAction } from "@/app/actions/travel";
import { NotFoundError } from "@/domain/authz";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Group chat" };
type Params = Promise<{ groupId: string }>;

export default function GroupChatPage({ params }: { params: Params }) {
  return (
    <Container className="max-w-3xl py-10">
      <Suspense fallback={<PageSkeleton />}>
        <Chat params={params} />
      </Suspense>
    </Container>
  );
}

async function Chat({ params }: { params: Params }) {
  const { groupId } = await params;
  const session = await requireSession(`/travel-together/${groupId}/chat`);
  const chat = await getGroupChat(await requestDb(), session.actor, groupId).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const isOrganizer = chat.viewerRole !== "member";
  return (
    <div className="space-y-4">
      <Link href={`/travel-together/${groupId}`} className="text-sm font-semibold text-forest underline">← {chat.groupName}</Link>
      <Card className="flex flex-col">
        <header className="border-b border-sand-200 p-4">
          <h1 className="text-2xl text-forest">Group chat</h1>
          <p className="text-sm text-ink-muted">Only current members can read this. People who leave lose access. Messages from people you&apos;ve blocked are hidden.</p>
        </header>
        <ol className="space-y-3 p-4" aria-live="polite">
          {chat.messages.length === 0 && <li className="text-sm text-ink-muted">No messages yet — introduce yourself!</li>}
          {chat.messages.map((m) => {
            const mine = m.sender_id === chat.viewerId;
            const announcement = m.kind === "announcement";
            return (
              <li key={m.id} className={cn("flex", mine && !announcement ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", announcement ? "w-full max-w-none border border-gold bg-gold-100" : mine ? "bg-forest text-sand" : "bg-sand")}>
                  {announcement && <p className="mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#6b4e0b]"><Megaphone aria-hidden className="h-3.5 w-3.5" />Announcement</p>}
                  {!mine && <p className="mb-0.5 text-xs font-semibold text-terracotta-700">{m.sender_name}</p>}
                  {m.hidden ? <p className="italic text-ink-subtle">This message was removed by a moderator.</p> : <p className="whitespace-pre-line">{m.body}</p>}
                  <div className={cn("mt-1 flex flex-wrap items-center gap-3 text-[11px]", mine && !announcement ? "text-sand/70" : "text-ink-subtle")}>
                    <span>{formatDate(m.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    {!mine && !m.hidden && <ReportForm groupId={groupId} reportedUserId={m.sender_id} messageId={m.id} label="Report" compact />}
                    {isOrganizer && !m.hidden && !mine && <ActionButton action={hideMessageAction.bind(null, m.id)} variant="ghost" className="h-auto px-0 text-[11px]" confirm="Hide this message from everyone?">Hide</ActionButton>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <footer className="border-t border-sand-200 p-4">
          <ActionForm action={groupMessageAction.bind(null, groupId)} resetOnSuccess className="space-y-2">
            <label htmlFor="body" className="sr-only">Message</label>
            <Textarea id="body" name="body" required maxLength={4000} placeholder="Write to the group…" className="min-h-16" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              {isOrganizer ? <Checkbox name="announcement" label="Post as an announcement (notifies everyone)" /> : <span />}
              <SubmitButton pendingLabel="Sending…">Send</SubmitButton>
            </div>
          </ActionForm>
          <p className="mt-2 text-xs text-ink-subtle">Never share PINs, passwords or payment details. Phone numbers and emails stay private unless you choose to share them.</p>
        </footer>
      </Card>
    </div>
  );
}
