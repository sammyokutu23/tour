import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Badge, DemoBadge, Input, PageHeader, PageSkeleton, TabNav, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { adminListGroups } from "@/server/services/travel-groups";
import { adminGroupStatusAction } from "@/app/actions/travel";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Travel groups" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function AdminGroupsPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Travel groups" description="Suspending a group closes joining and chat until restored. Every action needs a reason and is audited." />
      <Suspense fallback={<PageSkeleton />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const filter = (["active", "suspended", "cancelled", "all"].includes(String(sp.f)) ? sp.f : "active") as "active";
  await requireRole("/admin/travel-together/groups", ["admin"]);
  const rows = await adminListGroups(await requestDb(), filter);
  return (
    <>
      <TabNav current={filter} tabs={["active", "suspended", "cancelled", "all"].map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), href: `/admin/travel-together/groups?f=${k}` }))} />
      <Table>
        <thead><tr><Th>Group</Th><Th>Dates</Th><Th>Members</Th><Th>Reports</Th><Th>Action</Th></tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id}>
              <Td><Link href={`/travel-together/${g.id}`} className="font-semibold text-forest underline">{g.name}</Link> {g.is_demo && <DemoBadge />}<span className="block text-xs text-ink-subtle">by {g.organizer} · {g.visibility} · <span className="capitalize">{g.status}</span></span></Td>
              <Td>{formatDate(g.start_date)} – {formatDate(g.end_date)}</Td>
              <Td>{g.members}/{g.max_members}</Td>
              <Td>{g.reports > 0 ? <Badge tone="danger">{g.reports} open</Badge> : "—"}</Td>
              <Td>
                {(g.status === "published" || g.status === "suspended") && (
                  <ActionForm action={adminGroupStatusAction.bind(null, g.id, g.status === "published" ? "suspended" : "published")} className="flex gap-2">
                    <Input name="reason" aria-label="Reason" placeholder="Reason" required className="h-8 w-40" />
                    <SubmitButton size="sm" variant={g.status === "published" ? "danger" : "secondary"} className="h-8">{g.status === "published" ? "Suspend" : "Restore"}</SubmitButton>
                  </ActionForm>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
