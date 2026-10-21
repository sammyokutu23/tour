import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Badge, Card, PageSkeleton } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { getSupportCase } from "@/server/services/community";
import { NotFoundError } from "@/domain/authz";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Support request" };
type Params = Promise<{ id: string }>;

export default function SupportCasePage({ params }: { params: Params }) {
  return (
    <div className="space-y-4">
      <Link href="/dashboard/support" className="text-sm font-semibold text-forest underline">← All requests</Link>
      <Suspense fallback={<PageSkeleton />}>
        <CaseView params={params} />
      </Suspense>
    </div>
  );
}

async function CaseView({ params }: { params: Params }) {
  const { id } = await params;
  const session = await requireSession(`/dashboard/support/${id}`);
  const c = await getSupportCase(await requestDb(), session.actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <Card className="space-y-4 p-6">
      <div>
        <p className="font-mono text-xs text-ink-subtle">{c.reference}</p>
        <h1 className="text-2xl font-bold text-forest">{c.subject}</h1>
        <div className="mt-2 flex gap-1.5"><Badge className="capitalize">{c.kind}</Badge><Badge tone="info" className="capitalize">{c.status.replace("_", " ")}</Badge></div>
      </div>
      <p className="whitespace-pre-line text-sm">{c.description}</p>
      {c.events.map((e, i) => (
        <div key={i} className="rounded-xl bg-sand p-3 text-sm">
          <p className="text-xs text-ink-subtle">Support team · {formatDate(e.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
          <p className="mt-1 whitespace-pre-line">{e.note}</p>
        </div>
      ))}
      {c.resolution && <p className="rounded-xl bg-[#eef8f1] p-3 text-sm"><strong>Resolution:</strong> {c.resolution}</p>}
    </Card>
  );
}
