import { Suspense } from "react";
import { UsersRound } from "lucide-react";
import { GroupCardView } from "@/components/travel/group-card";
import { Alert, CardGridSkeleton, Container, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { myGroups } from "@/server/services/travel-groups";

export const metadata = { title: "My groups" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function MyGroupsPage({ searchParams }: { searchParams: SP }) {
  return (
    <Container className="py-10">
      <PageHeader title="My groups" description="Groups you organise, have joined, or are drafting." actions={<LinkButton href="/travel-together/create">Create a group</LinkButton>} />
      <Suspense fallback={<CardGridSkeleton className="mt-8" />}>
        <Groups searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Groups({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await requireSession("/travel-together/my-groups");
  const g = await myGroups(await requestDb(), session.actor);
  const sections = [
    { title: "Organising", items: g.organizing },
    { title: "Going", items: g.joined },
    { title: "Drafts", items: g.drafts },
    { title: "Past trips", items: g.past },
  ].filter((s) => s.items.length);
  return (
    <div className="mt-8 space-y-10">
      {sp.left && <Alert tone="success">You left the group. You no longer have access to its chat or plan.</Alert>}
      {sections.length === 0 && (
        <EmptyState icon={<UsersRound className="h-6 w-6" />} title="You're not in any groups yet" description="Find a group heading where you're going, or start your own and invite others." action={<div className="flex gap-2"><LinkButton href="/travel-together">Find a group</LinkButton><LinkButton href="/travel-together/create" variant="secondary">Create one</LinkButton></div>} />
      )}
      {sections.map((s) => (
        <section key={s.title}>
          <h2 className="mb-4 text-2xl text-forest">{s.title}</h2>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{s.items.map((x) => <GroupCardView key={x.id} g={x} />)}</div>
        </section>
      ))}
    </div>
  );
}
