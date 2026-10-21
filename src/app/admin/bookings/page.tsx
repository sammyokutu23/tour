import Link from "next/link";
import { Suspense } from "react";
import { BookingStatusBadges } from "@/components/bookings/booking-parts";
import { Button, EmptyState, Input, PageHeader, PageSkeleton, Select, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { listBookingsAdmin } from "@/server/services/admin";
import { BOOKING_STATUSES, BOOKING_STATUS_LABEL } from "@/domain/states";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Bookings" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function AdminBookingsPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Bookings" />
      <Suspense fallback={<PageSkeleton />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await requireRole("/admin/bookings", ["admin", "support"]);
  const status = typeof sp.status === "string" ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q : "";
  const rows = await listBookingsAdmin(await requestDb(), session.actor, { status, q });
  const isAdmin = session.actor.roles.includes("admin");
  return (
    <>
      <form method="get" className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="q">Reference</label>
        <Input id="q" name="q" placeholder="Reference e.g. BTD-…" defaultValue={q} className="w-56" />
        <label className="sr-only" htmlFor="status">Status</label>
        <Select id="status" name="status" defaultValue={status} className="w-56"><option value="">All statuses</option>{BOOKING_STATUSES.map((s) => <option key={s} value={s}>{BOOKING_STATUS_LABEL[s]}</option>)}</Select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      {rows.length ? (
        <Table>
          <thead><tr><Th>Reference</Th><Th>Traveller</Th><Th>Trip start</Th><Th>Status</Th>{isAdmin && <Th className="text-right">Total</Th>}</tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <Td><Link href={`/admin/bookings/${b.id}`} className="font-mono font-semibold text-forest underline">{b.reference}</Link></Td>
                <Td>{isAdmin ? b.traveller : b.traveller.split(" ")[0]}</Td>
                <Td>{formatDate(b.start_date)}</Td>
                <Td><BookingStatusBadges status={b.status as never} paymentStatus={b.payment_status as never} /></Td>
                {isAdmin && <Td className="text-right">{formatMoney(b.total_minor, b.currency)}</Td>}
              </tr>
            ))}
          </tbody>
        </Table>
      ) : <EmptyState title="No bookings match" />}
    </>
  );
}
