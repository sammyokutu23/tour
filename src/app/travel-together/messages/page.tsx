import Link from "next/link";
import { Suspense } from "react";
import { MessagesSquare } from "lucide-react";
import { Badge, Container, EmptyState, LinkButton, PageHeader, PageSkeleton } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { listGroupConversations } from "@/server/services/travel-groups";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Group chats" };

export default function GroupMessagesPage() {
  return (
    <Container className="max-w-3xl py-10">
      <PageHeader title="Group chats" description="Conversations for the groups you're currently in." />
      <Suspense fallback={<PageSkeleton />}>
        <List />
      </Suspense>
    </Container>
  );
}

async function List() {
  const session = await requireSession("/travel-together/messages");
  const chats = await listGroupConversations(await requestDb(), session.actor);
  if (!chats.length) return <EmptyState className="mt-8" icon={<MessagesSquare className="h-6 w-6" />} title="No group chats yet" description="Join or create a group to start chatting with fellow travellers." action={<LinkButton href="/travel-together">Find a group</LinkButton>} />;
  return (
    <ul className="mt-8 divide-y divide-sand-200 overflow-hidden rounded-2xl border border-sand-300/70 bg-white">
      {chats.map((c) => (
        <li key={c.group_id}>
          <Link href={`/travel-together/${c.group_id}/chat`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-sand/50">
            <div className="min-w-0">
              <p className={c.unread ? "font-bold text-forest" : "font-semibold text-forest"}>{c.name}</p>
              <p className="truncate text-sm text-ink-muted">{c.last_body ?? "No messages yet"}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-ink-subtle">
              {c.last_at && formatDate(c.last_at, { day: "numeric", month: "short" })}
              {c.unread > 0 && <Badge tone="terracotta">{c.unread} new</Badge>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
