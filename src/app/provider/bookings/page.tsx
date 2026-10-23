import Link from "next/link";
import { Suspense } from "react";
import { BookingStatusBadges } from "@/components/bookings/booking-parts";
import { EmptyState, PageHeader, PageSkeleton, TabNav } from "@/components/ui";
import { requestDb, requireProviderSession } from "@/server/auth/session";
import { listProviderBookings } from "@/server/services/bookings";
import { formatMoney } from "@/lib/money";
import { formatDate, formatTime } from "@/lib/time";

export const metadata = { title: "Bookings" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function ProviderBookingsPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Bookings" description="Only bookings that include your services are shown." />
      <Suspense fallback={<PageSkeleton />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = (["requests", "upcoming", "past", "all"].includes(String(sp.tab)) ? sp.tab : "upcoming") as "requests" | "upcoming" | "past" | "all";
  const session = await requireProviderSession("/provider/bookings");
  const rows = await listProviderBookings(await requestDb(), session.actor, tab);
  return (
    <>
      <TabNav current={tab} tabs={["requests", "upcoming", "past", "all"].map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), href: `/provider/bookings?tab=${k}` }))} />
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((b) => (
            <li key={b.id}>
              <Link href={`/provider/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-forest bg-white p-4 hover:shadow-[var(--shadow-card)]">
                <div>
                  <p className="font-mono text-xs text-ink-subtle">{b.reference}</p>
                  <p className="font-semibold text-forest">{b.item_titles.join(" · ")}</p>
                  <p className="text-sm text-ink-muted">{formatDate(b.first_start, { weekday: "short", day: "numeric", month: "short" })} {formatTime(b.first_start)} · {b.traveller_first_name}, {b.party} guest{b.party === 1 ? "" : "s"}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <BookingStatusBadges status={b.status} paymentStatus={b.payment_status} />
                  <span className="text-sm font-semibold">Your earnings {formatMoney(b.earnings_minor)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : <EmptyState title="Nothing here" description="Bookings that include your services appear in these tabs." />}
    </>
  );
}
