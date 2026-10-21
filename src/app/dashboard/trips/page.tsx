import Link from "next/link";
import { Suspense } from "react";
import { Map } from "lucide-react";
import { DestinationArt } from "@/components/art/destination-art";
import { Badge, EmptyState, LinkButton, PageHeader, PageSkeleton } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { listTripsForOwner } from "@/server/services/trips";
import { TRIP_STATUS_LABEL } from "@/domain/states";
import { formatDate, toZoned } from "@/lib/time";

export const metadata = { title: "Trips" };

export default function TripsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Trips" description="Drafts, booked trips and past journeys." actions={<LinkButton href="/studio/new">New trip</LinkButton>} />
      <Suspense fallback={<PageSkeleton />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const session = await requireSession("/dashboard/trips");
  const trips = await listTripsForOwner(await requestDb(), session.actor);
  if (!trips.length) {
    return <EmptyState icon={<Map className="h-6 w-6" />} title="No trips yet" description="Create a trip to start planning day by day." action={<LinkButton href="/studio/new">Plan a trip</LinkButton>} />;
  }
  const today = toZoned(new Date(), "Africa/Nairobi").date;
  const groups = [
    { title: "Drafts", items: trips.filter((t) => t.status === "draft" || t.status === "quoted") },
    { title: "Upcoming", items: trips.filter((t) => ["pending_booking", "confirmed", "in_progress"].includes(t.status) && t.end_date >= today) },
    { title: "Past & cancelled", items: trips.filter((t) => t.status === "completed" || t.status === "cancelled" || (t.end_date < today && !["draft", "quoted"].includes(t.status))) },
  ];
  return (
    <div className="space-y-8">
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.title}>
          <h2 className="mb-3 text-lg font-bold text-forest">{g.title}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {g.items.map((t) => (
              <Link key={t.id} href={`/studio/${t.id}`} className="flex gap-4 rounded-2xl border border-sand-300/70 bg-white p-3 transition-shadow hover:shadow-[var(--shadow-card)]">
                <div className="h-24 w-28 shrink-0 overflow-hidden rounded-xl"><DestinationArt variant={t.art_variant ?? "savanna"} seed={t.id} /></div>
                <div className="min-w-0 py-1">
                  <Badge tone={t.status === "confirmed" ? "success" : t.status === "draft" ? "neutral" : "gold"}>{TRIP_STATUS_LABEL[t.status]}</Badge>
                  <p className="mt-1 truncate font-semibold text-forest">{t.title}</p>
                  <p className="text-sm text-ink-muted">{formatDate(t.start_date)} – {formatDate(t.end_date)}</p>
                  <p className="text-xs text-ink-subtle">{t.destination_name ?? "Destination not set"} · {t.item_count} planned · {t.adults + t.children} travellers</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
