import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { BookingStatusBadges } from "@/components/bookings/booking-parts";
import { Alert, Card, EmptyState, LinkButton, PageHeader, PageSkeleton, Stat } from "@/components/ui";
import { requestDb, requireProviderSession } from "@/server/auth/session";
import { listProviderBookings } from "@/server/services/bookings";
import { getOwnProvider, listProviderDocuments, providerOverview } from "@/server/services/providers";
import { formatMoney } from "@/lib/money";
import { formatDate, formatTime } from "@/lib/time";

export const metadata = { title: "Overview" };

export default function ProviderHome() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview />
    </Suspense>
  );
}

const STATUS_COPY: Record<string, { tone: "info" | "warning" | "success" | "error"; text: string }> = {
  draft: { tone: "info", text: "Complete your profile and upload documents, then submit for review." },
  submitted: { tone: "info", text: "Your profile is under review. You'll be notified when it's checked." },
  info_requested: { tone: "warning", text: "We need more information before approving your profile." },
  approved: { tone: "success", text: "Your profile is approved and visible to travellers." },
  rejected: { tone: "error", text: "Your application wasn't approved. You can update it and resubmit." },
  suspended: { tone: "error", text: "Your profile is suspended. Contact support." },
};

async function Overview() {
  const session = await requireProviderSession("/provider");
  const db = await requestDb();
  const [stats, requests, upcoming, profile, docs] = await Promise.all([
    providerOverview(db, session.actor),
    listProviderBookings(db, session.actor, "requests"),
    listProviderBookings(db, session.actor, "upcoming"),
    getOwnProvider(db, session.actor),
    listProviderDocuments(db, session.actor.providerId),
  ]);
  const status = STATUS_COPY[profile!.status];
  const completion = [profile!.bio && profile!.bio.length >= 80, profile!.languages.length > 0, profile!.region_ids.length > 0, docs.length >= 2, !!profile!.headline].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${profile!.display_name}`} description="Your requests, schedule and listings at a glance." />
      <Alert tone={status.tone} title={`Profile status: ${profile!.status.replace("_", " ")}`}>
        {status.text}
        {profile!.status_reason && profile!.status !== "approved" && <> Note from our team: “{profile!.status_reason}”</>}
        {profile!.status !== "approved" && <> <Link href="/provider/profile" className="font-semibold underline">Go to profile</Link></>}
      </Alert>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Requests to answer" value={stats.pending_requests} />
        <Stat label="Upcoming bookings" value={stats.upcoming} />
        <Stat label="Completed services" value={stats.completed} />
        <Stat label="Profile completion" value={`${completion * 20}%`} hint={stats.review_count ? `${stats.rating_avg?.toFixed(1)}★ from ${stats.review_count} reviews` : "No reviews yet"} />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold text-forest">Booking requests</h2>
          <Link href="/provider/bookings?tab=requests" className="text-sm font-semibold text-forest underline">All requests</Link>
        </div>
        {requests.length ? (
          <ul className="space-y-3">
            {requests.slice(0, 5).map((b) => (
              <li key={b.id}>
                <Link href={`/provider/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-forest bg-white p-4 hover:shadow-[var(--shadow-card)]">
                  <div>
                    <p className="font-semibold text-forest">{b.item_titles.join(" · ")}</p>
                    <p className="text-sm text-ink-muted">{formatDate(b.first_start, { weekday: "short", day: "numeric", month: "short" })} at {formatTime(b.first_start)} · {b.traveller_first_name}, party of {b.party}</p>
                    {b.hold_expires_at && <p className="text-xs text-terracotta-700">Respond by {formatDate(b.hold_expires_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-forest">Review <ArrowRight aria-hidden className="h-4 w-4" /></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No requests waiting" description="New booking requests appear here and by email." />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold text-forest">Coming up</h2>
        {upcoming.length ? (
          <Card className="divide-y divide-sand-200">
            {upcoming.slice(0, 8).map((b) => (
              <Link key={b.id} href={`/provider/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-sand/50">
                <div>
                  <p className="font-semibold">{formatDate(b.first_start, { weekday: "short", day: "numeric", month: "short" })} · {formatTime(b.first_start)}</p>
                  <p className="text-sm text-ink-muted">{b.item_titles.join(" · ")} — {b.traveller_first_name} ({b.party})</p>
                </div>
                <div className="flex items-center gap-3">
                  <BookingStatusBadges status={b.status} paymentStatus={b.payment_status} />
                  <span className="text-sm font-semibold">{formatMoney(b.earnings_minor)}</span>
                </div>
              </Link>
            ))}
          </Card>
        ) : (
          <EmptyState title="Nothing scheduled" description="Accepted and confirmed bookings will appear here." action={<LinkButton href="/provider/availability" variant="secondary">Check your availability</LinkButton>} />
        )}
      </section>
    </div>
  );
}
