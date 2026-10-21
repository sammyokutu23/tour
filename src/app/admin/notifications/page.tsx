import { Suspense } from "react";
import { ActionButton } from "@/components/forms/action-button";
import { Badge, PageHeader, PageSkeleton, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { listDeliveries } from "@/server/services/admin";
import { retryDeliveryAction } from "@/app/actions/admin";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Notifications" };

export default function DeliveriesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Notification delivery" description={`Email delivery via the ${process.env.EMAIL_PROVIDER ?? "dev"} adapter, retried with backoff up to 5 times by the background job.`} />
      <Suspense fallback={<PageSkeleton />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const session = await requireRole("/admin/notifications", ["admin"]);
  const rows = await listDeliveries(await requestDb(), session.actor);
  return (
    <Table>
      <thead><tr><Th>Created</Th><Th>Notification</Th><Th>Status</Th><Th>Attempts</Th><Th></Th></tr></thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.id}>
            <Td className="whitespace-nowrap">{formatDate(d.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Td>
            <Td>{d.title}<span className="block text-xs text-ink-subtle">{d.type} · {d.channel}</span></Td>
            <Td><Badge tone={d.status === "sent" ? "success" : d.status === "failed" ? "danger" : "neutral"}>{d.status}</Badge>{d.last_error && <span className="block text-xs text-ink-subtle">{d.last_error}</span>}</Td>
            <Td>{d.attempts}</Td>
            <Td>{d.status === "failed" && <ActionButton action={retryDeliveryAction.bind(null, d.id)}>Retry</ActionButton>}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
