import { Suspense } from "react";
import { ActionButton } from "@/components/forms/action-button";
import { GuideServiceForm } from "@/components/provider/forms";
import { Alert, Badge, Card, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { requestDb, requireProviderSession } from "@/server/auth/session";
import { listGuideServices } from "@/server/services/catalogue";
import { getOwnProvider } from "@/server/services/providers";
import { saveServiceAction, serviceStatusAction } from "@/app/actions/provider";
import { formatMoney } from "@/lib/money";
import { formatDuration } from "@/lib/time";

export const metadata = { title: "Guide services" };

export default function ServicesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Guide services" description="What travellers can book you for. Prices and terms are snapshotted into each booking, so editing never changes confirmed bookings." />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const session = await requireProviderSession("/provider/services");
  const db = await requestDb();
  const profile = await getOwnProvider(db, session.actor);
  if (profile!.kind !== "guide") return <Alert tone="info">Guide services are for individual guides. Operators publish experiences instead.</Alert>;
  const services = await listGuideServices(db, profile!.id);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        {profile!.status !== "approved" && <Alert tone="warning">You can prepare services now; they can be published once your profile is approved.</Alert>}
        {!services.length && <EmptyState title="No services yet" description="Add your first service using the form." />}
        {services.map((s) => (
          <Card key={s.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Badge tone={s.status === "published" ? "success" : s.status === "suspended" ? "danger" : "neutral"} className="capitalize">{s.status}</Badge>
                <h2 className="mt-1 text-lg font-bold text-forest">{s.title}</h2>
                <p className="text-sm text-ink-muted">{formatDuration(s.durationMinutes)} · up to {s.maxGroupSize} · {formatMoney(s.basePriceMinor)} {s.pricingModel === "per_group" ? "per group" : "per person"} · {s.cancellationPolicy}</p>
              </div>
              <div className="flex gap-2">
                {s.status !== "published" && s.status !== "suspended" && <ActionButton action={serviceStatusAction.bind(null, s.id, "published")} variant="primary" disabled={profile!.status !== "approved"}>Publish</ActionButton>}
                {s.status === "published" && <ActionButton action={serviceStatusAction.bind(null, s.id, "draft")}>Unpublish</ActionButton>}
                <ActionButton action={serviceStatusAction.bind(null, s.id, "archived")} variant="ghost" confirm="Archive this service?">Archive</ActionButton>
              </div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-forest">Edit</summary>
              <div className="mt-3"><GuideServiceForm action={saveServiceAction.bind(null, s.id)} defaults={s} submitLabel="Save changes" /></div>
            </details>
          </Card>
        ))}
      </div>
      <Card className="h-fit p-6">
        <h2 className="mb-4 text-lg font-bold text-forest">Add a service</h2>
        <GuideServiceForm action={saveServiceAction.bind(null, null)} submitLabel="Add service" />
      </Card>
    </div>
  );
}
