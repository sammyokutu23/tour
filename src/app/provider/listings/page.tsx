import Link from "next/link";
import { Suspense } from "react";
import { ListChecks } from "lucide-react";
import { Badge, EmptyState, LinkButton, PageHeader, PageSkeleton, Table, Td, Th } from "@/components/ui";
import { requestDb, requireProviderSession } from "@/server/auth/session";
import { listOwnExperiences } from "@/server/services/providers";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Experiences" };

export default function ListingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Experiences" description="Listings are reviewed before they go live. Changes to a live listing send it back for review; existing bookings keep their agreed terms." actions={<LinkButton href="/provider/listings/new">New experience</LinkButton>} />
      <Suspense fallback={<PageSkeleton />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const session = await requireProviderSession("/provider/listings");
  const rows = await listOwnExperiences(await requestDb(), session.actor);
  if (!rows.length) return <EmptyState icon={<ListChecks className="h-6 w-6" />} title="No experiences yet" action={<LinkButton href="/provider/listings/new">Create your first experience</LinkButton>} />;
  return (
    <Table>
      <thead><tr><Th>Experience</Th><Th>Status</Th><Th>Price</Th><Th>Upcoming slots</Th></tr></thead>
      <tbody>
        {rows.map((e) => (
          <tr key={e.id}>
            <Td><Link href={`/provider/listings/${e.id}`} className="font-semibold text-forest underline">{e.title}</Link><span className="block text-xs text-ink-subtle">{e.destination_name}</span></Td>
            <Td><Badge tone={e.status === "published" ? "success" : e.status === "rejected" || e.status === "suspended" ? "danger" : "info"} className="capitalize">{e.status.replace("_", " ")}</Badge>{e.moderation_notes && e.status !== "published" && <span className="mt-1 block text-xs text-ink-subtle">{e.moderation_notes}</span>}</Td>
            <Td>{formatMoney(e.base_price_minor)} <span className="text-xs text-ink-subtle">{e.pricing_model === "per_group" ? "/group" : "/person"}</span></Td>
            <Td>{e.upcoming_slots}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
