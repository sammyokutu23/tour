import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Badge, Button, Input, PageHeader, PageSkeleton, Select, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { listUsers } from "@/server/services/admin";
import { userRoleAction, userStatusAction } from "@/app/actions/admin";
import { ROLES } from "@/domain/authz";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Users" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function UsersPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Suspensions sign the user out everywhere. Every change needs a documented reason." />
      <Suspense fallback={<PageSkeleton />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const session = await requireRole("/admin/users", ["admin"]);
  const users = await listUsers(await requestDb(), session.actor, q);
  return (
    <>
      <form method="get" className="flex gap-2"><Input name="q" aria-label="Search users" placeholder="Search by name or email" defaultValue={q} className="w-72" /><Button type="submit" variant="secondary">Search</Button></form>
      <Table>
        <thead><tr><Th>User</Th><Th>Roles</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <Td><span className="font-semibold">{u.display_name}</span><span className="block text-xs text-ink-subtle">{u.email} · joined {formatDate(u.created_at)}</span></Td>
              <Td><span className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone={r === "admin" ? "dark" : "neutral"}>{r}</Badge>)}</span></Td>
              <Td><Badge tone={u.status === "active" ? "success" : "danger"}>{u.status}</Badge></Td>
              <Td>
                <div className="space-y-2">
                  <ActionForm action={userStatusAction.bind(null, u.id)} className="flex flex-wrap gap-2">
                    <input type="hidden" name="status" value={u.status === "active" ? "suspended" : "active"} />
                    <Input name="reason" aria-label="Reason" placeholder="Reason" required className="h-8 w-40" />
                    <SubmitButton size="sm" variant={u.status === "active" ? "danger" : "secondary"} className="h-8">{u.status === "active" ? "Suspend" : "Reactivate"}</SubmitButton>
                  </ActionForm>
                  <ActionForm action={userRoleAction.bind(null, u.id)} className="flex flex-wrap gap-2">
                    <Select name="grant" aria-label="Grant or revoke" className="h-8 w-24"><option value="grant">Grant</option><option value="revoke">Revoke</option></Select>
                    <Select name="role" aria-label="Role" className="h-8 w-28">{ROLES.map((r) => <option key={r}>{r}</option>)}</Select>
                    <Input name="reason" aria-label="Reason" placeholder="Reason" required className="h-8 w-32" />
                    <SubmitButton size="sm" variant="secondary" className="h-8">Apply</SubmitButton>
                  </ActionForm>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
