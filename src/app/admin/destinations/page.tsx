import Link from "next/link";
import { Suspense } from "react";
import { Badge, LinkButton, PageHeader, PageSkeleton, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { listDestinationsAdmin } from "@/server/services/admin";

export const metadata = { title: "Destinations" };

export default function DestinationsAdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Destinations" actions={<LinkButton href="/admin/destinations/new">New destination</LinkButton>} />
      <Suspense fallback={<PageSkeleton />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const session = await requireRole("/admin/destinations", ["admin"]);
  const rows = await listDestinationsAdmin(await requestDb(), session.actor);
  return (
    <Table>
      <thead><tr><Th>Name</Th><Th>Region</Th><Th>Experiences</Th><Th>Visibility</Th></tr></thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.id}>
            <Td><Link href={`/admin/destinations/${d.id}`} className="font-semibold text-forest underline">{d.name}</Link></Td>
            <Td>{d.region}</Td><Td>{d.experiences}</Td>
            <Td><Badge tone={d.is_published ? "success" : "neutral"}>{d.is_published ? "Published" : "Hidden"}</Badge></Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
