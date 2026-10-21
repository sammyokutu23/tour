import { Suspense } from "react";
import { Star } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Badge, Card, EmptyState, PageHeader, PageSkeleton, Textarea } from "@/components/ui";
import { requestDb, requireProviderSession } from "@/server/auth/session";
import { listProviderReviews } from "@/server/services/community";
import { respondReviewAction } from "@/app/actions/bookings";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Reviews" };

export default function ProviderReviewsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reviews" description="Reviews come only from travellers with completed bookings. You can reply once, publicly." />
      <Suspense fallback={<PageSkeleton />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const session = await requireProviderSession("/provider/reviews");
  const reviews = await listProviderReviews(await requestDb(), session.actor);
  if (!reviews.length) return <EmptyState icon={<Star className="h-6 w-6" />} title="No reviews yet" description="After a completed booking, travellers can review your service." />;
  return (
    <div className="space-y-4">
      {reviews.map((r) => (
        <Card key={r.id} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-gold" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}<span className="text-sand-300">{"★".repeat(5 - r.rating)}</span></p>
            {r.status === "hidden" && <Badge tone="danger">Hidden by moderators</Badge>}
          </div>
          {r.title && <p className="mt-1 font-semibold">{r.title}</p>}
          <p className="mt-1 text-sm">{r.body}</p>
          <p className="mt-2 text-xs text-ink-subtle">{r.reviewer} · {r.item_title} · {formatDate(r.created_at)}</p>
          {r.provider_response ? (
            <p className="mt-3 rounded-xl bg-sand p-3 text-sm"><strong>Your response:</strong> {r.provider_response}</p>
          ) : (
            <ActionForm action={respondReviewAction.bind(null, r.id)} className="mt-3 space-y-2">
              <Textarea name="response" aria-label="Your public response" maxLength={2000} required className="min-h-16" />
              <SubmitButton size="sm" variant="secondary">Publish response</SubmitButton>
            </ActionForm>
          )}
        </Card>
      ))}
      <p className="text-xs text-ink-subtle">If a review breaks our guidelines, report it via Contact &amp; help with the review details.</p>
    </div>
  );
}
