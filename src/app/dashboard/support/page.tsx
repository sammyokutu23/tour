import Link from "next/link";
import { Suspense } from "react";
import { LifeBuoy } from "lucide-react";
import { Badge, EmptyState, LinkButton, PageHeader, PageSkeleton } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { listOwnSupportCases } from "@/server/services/community";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Support" };

export default function SupportPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Support" description="Questions, disputes and safety reports you've raised." actions={<LinkButton href="/contact">New request</LinkButton>} />
      <Suspense fallback={<PageSkeleton />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const session = await requireSession("/dashboard/support");
  const cases = await listOwnSupportCases(await requestDb(), session.actor);
  if (!cases.length) return <EmptyState icon={<LifeBuoy className="h-6 w-6" />} title="No support requests" description="If something goes wrong with a booking, contact us and we'll help." action={<LinkButton href="/contact" variant="secondary">Contact support</LinkButton>} />;
  return (
    <ul className="space-y-3">
      {cases.map((c) => (
        <li key={c.id}>
          <Link href={`/dashboard/support/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-forest bg-white p-4 hover:shadow-[var(--shadow-card)]">
            <div>
              <p className="font-mono text-xs text-ink-subtle">{c.reference}</p>
              <p className="font-semibold text-forest">{c.subject}</p>
              <p className="text-xs text-ink-subtle">{formatDate(c.created_at)}</p>
            </div>
            <div className="flex gap-1.5">
              <Badge className="capitalize">{c.kind}</Badge>
              <Badge tone={c.status === "resolved" || c.status === "closed" ? "success" : "info"} className="capitalize">{c.status.replace("_", " ")}</Badge>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
