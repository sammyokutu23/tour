import Link from "next/link";
import { Suspense } from "react";
import { Bell } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { EmptyState, PageHeader, PageSkeleton, cn } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { listNotifications } from "@/server/services/community";
import { markAllReadAction } from "@/app/actions/bookings";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Booking updates, payments, messages and reminders." actions={<ActionButton action={markAllReadAction}>Mark all as read</ActionButton>} />
      <Suspense fallback={<PageSkeleton />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const session = await requireSession("/dashboard/notifications");
  const items = await listNotifications(await requestDb(), session.actor);
  if (!items.length) return <EmptyState icon={<Bell className="h-6 w-6" />} title="You're all caught up" description="Updates about your trips and bookings will appear here." />;
  return (
    <ul className="divide-y divide-sand-200 overflow-hidden rounded-2xl border border-sand-300/70 bg-white">
      {items.map((n) => (
        <li key={n.id} className={cn("px-4 py-3", !n.read_at && "bg-gold-100/40")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={cn("text-forest", n.read_at ? "font-semibold" : "font-bold")}>{!n.read_at && <span className="sr-only">Unread: </span>}{n.title}</p>
              <p className="text-sm text-ink-muted">{n.body}</p>
              {n.link && <Link href={n.link} className="mt-1 inline-block text-sm font-semibold text-forest underline">View</Link>}
            </div>
            <span className="shrink-0 text-xs text-ink-subtle">{formatDate(n.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
