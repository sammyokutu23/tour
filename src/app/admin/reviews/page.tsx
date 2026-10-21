import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Badge, Card, EmptyState, Input, PageHeader, PageSkeleton, Select } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { listReviewsAdmin } from "@/server/services/admin";
import { reviewModerationAction } from "@/app/actions/admin";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Reviews" };

export default function ReviewsAdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reviews" description="Hide reviews only for guideline violations, with a documented reason. Reported reviews are listed first." />
      <Suspense fallback={<PageSkeleton />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const session = await requireRole("/admin/reviews", ["admin"]);
  const rows = await listReviewsAdmin(await requestDb(), session.actor);
  if (!rows.length) return <EmptyState title="No reviews yet" description="Reviews appear after travellers complete bookings." />;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <p><span className="text-gold">{"★".repeat(r.rating)}</span> <span className="font-semibold">{r.provider_name}</span> <span className="text-xs text-ink-subtle">by {r.reviewer} · {formatDate(r.created_at)}</span></p>
            <span className="flex gap-1.5">{r.reported > 0 && <Badge tone="danger">{r.reported} report(s)</Badge>}<Badge tone={r.status === "published" ? "success" : "neutral"}>{r.status}</Badge></span>
          </div>
          <p className="mt-2 text-sm">{r.body}</p>
          <ActionForm action={reviewModerationAction.bind(null, r.id)} className="mt-3 flex flex-wrap gap-2">
            <Select name="status" aria-label="Visibility" defaultValue={r.status === "published" ? "hidden" : "published"} className="h-8 w-32"><option value="hidden">Hide</option><option value="published">Publish</option></Select>
            <Input name="reason" aria-label="Reason" placeholder="Reason" required className="h-8 w-56" />
            <SubmitButton size="sm" variant="secondary" className="h-8">Apply</SubmitButton>
          </ActionForm>
        </Card>
      ))}
    </div>
  );
}
