import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Badge, Card, EmptyState, Textarea, cn } from "@/components/ui";
import { sendMessageAction } from "@/app/actions/bookings";
import { formatDate } from "@/lib/time";

export function ConversationList({ conversations, base }: { conversations: { id: string; subject: string; last_body: string | null; last_at: Date | null; unread: number }[]; base: string }) {
  if (!conversations.length) {
    return <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="No messages yet" description="Conversations start when you contact a guide or make a booking." />;
  }
  return (
    <ul className="divide-y divide-sand-200 overflow-hidden rounded-2xl border border-sand-300/70 bg-white">
      {conversations.map((c) => (
        <li key={c.id}>
          <Link href={`${base}/${c.id}`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-sand/50">
            <div className="min-w-0">
              <p className={cn("truncate text-forest", c.unread ? "font-bold" : "font-semibold")}>{c.subject}</p>
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

export function ConversationView({
  conversation,
  bookingHref,
}: {
  conversation: {
    id: string;
    subject: string;
    viewerId: string;
    messages: { id: string; body: string; created_at: Date; sender_id: string; sender_name: string }[];
    participants: { user_id: string; name: string; role: string }[];
  };
  bookingHref: string | null;
}) {
  return (
    <Card className="flex flex-col">
      <header className="border-b border-sand-200 p-4">
        <h1 className="text-xl font-bold text-forest">{conversation.subject}</h1>
        <p className="text-sm text-ink-muted">
          With {conversation.participants.filter((p) => p.user_id !== conversation.viewerId).map((p) => p.name).join(", ")}
          {bookingHref && <> · <Link href={bookingHref} className="font-semibold underline">View booking</Link></>}
        </p>
      </header>
      <ol className="flex-1 space-y-3 p-4" aria-live="polite">
        {conversation.messages.length === 0 && <li className="text-sm text-ink-muted">No messages yet — say hello.</li>}
        {conversation.messages.map((m) => {
          const mine = m.sender_id === conversation.viewerId;
          return (
            <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] rounded-2xl px-4 py-2.5 text-sm", mine ? "bg-forest text-sand" : "bg-sand")}>
                {!mine && <p className="mb-0.5 text-xs font-semibold text-terracotta-700">{m.sender_name}</p>}
                <p className="whitespace-pre-line">{m.body}</p>
                <p className={cn("mt-1 text-[11px]", mine ? "text-sand/70" : "text-ink-subtle")}>{formatDate(m.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <footer className="border-t border-sand-200 p-4">
        <ActionForm action={sendMessageAction.bind(null, conversation.id)} resetOnSuccess className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label htmlFor="body" className="sr-only">Message</label>
          <Textarea id="body" name="body" required maxLength={4000} placeholder="Write a message…" className="min-h-14 flex-1" />
          <SubmitButton pendingLabel="Sending…">Send</SubmitButton>
        </ActionForm>
        <p className="mt-2 text-xs text-ink-subtle">Keep payments on the platform. Never share card numbers, PINs or passwords in messages.</p>
      </footer>
    </Card>
  );
}
