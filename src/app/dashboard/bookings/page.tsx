import Link from "next/link";
import { Suspense } from "react";
import { CalendarCheck } from "lucide-react";
import { BookingStatusBadges } from "@/components/bookings/booking-parts";
import { EmptyState, LinkButton, PageHeader, PageSkeleton, TabNav } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { listTravellerBookings } from "@/server/services/bookings";
import { formatMoney } from "@/lib/money";
import { formatDate, toZoned } from "@/lib/time";

export const metadata = { title: "Bookings" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function BookingsPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Bookings" description="Requests, confirmed trips and past bookings, with payment status." />
      <Suspense fallback={<PageSkeleton />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await requireSession("/dashboard/bookings");
  const all = await listTravellerBookings(await requestDb(), session.actor);
  const today = toZoned(new Date(), "Africa/Nairobi").date;
  const tab = (typeof sp.tab === "string" ? sp.tab : "upcoming") as "upcoming" | "past" | "all";
  const isPast = (b: (typeof all)[number]) => b.end_date < today || ["completed", "cancelled", "expired", "provider_declined"].includes(b.status);
  const rows = tab === "all" ? all : all.filter((b) => (tab === "past" ? isPast(b) : !isPast(b)));

  return (
    <>
      <TabNav current={tab} tabs={[
        { key: "upcoming", label: "Active & upcoming", href: "/dashboard/bookings" },
        { key: "past", label: "Past & cancelled", href: "/dashboard/bookings?tab=past" },
        { key: "all", label: "All", href: "/dashboard/bookings?tab=all" },
      ]} />
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((b) => (
            <li key={b.id}>
              <Link href={`/dashboard/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sand-300/70 bg-white p-4 transition-shadow hover:shadow-[var(--shadow-card)]">
                <div>
                  <p className="font-mono text-xs text-ink-subtle">{b.reference}</p>
                  <p className="font-semibold text-forest">{b.trip_title}</p>
                  <p className="text-sm text-ink-muted">{formatDate(b.start_date)} – {formatDate(b.end_date)}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <BookingStatusBadges status={b.status} paymentStatus={b.payment_status} />
                  <span className="font-semibold">{formatMoney(b.total_minor, b.currency)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<CalendarCheck className="h-6 w-6" />} title="No bookings here" description="When you request a booking from Journey Studio, it appears here." action={<LinkButton href="/studio">Open Journey Studio</LinkButton>} />
      )}
    </>
  );
}
