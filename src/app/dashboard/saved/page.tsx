import Link from "next/link";
import { Suspense } from "react";
import { Heart } from "lucide-react";
import { Badge, Card, EmptyState, LinkButton, PageHeader, PageSkeleton } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { listFavourites } from "@/server/services/community";

export const metadata = { title: "Saved" };

export default function SavedPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Saved" description="Destinations, experiences and guides you've saved for later." />
      <Suspense fallback={<PageSkeleton />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const session = await requireSession("/dashboard/saved");
  const items = await listFavourites(await requestDb(), session.actor);
  if (!items.length) return <EmptyState icon={<Heart className="h-6 w-6" />} title="Nothing saved yet" description="Use the Save button on any destination, experience or guide." action={<LinkButton href="/experiences" variant="secondary">Browse experiences</LinkButton>} />;
  const path = { guide: "guides", destination: "destinations", experience: "experiences" } as Record<string, string>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((f) => (
        <Link key={f.target_id} href={`/${path[f.target_type]}/${f.slug}`}>
          <Card className="h-full p-4 transition-shadow hover:shadow-[var(--shadow-lift)]">
            <Badge tone="forest" className="capitalize">{f.target_type}</Badge>
            <p className="mt-2 font-semibold text-forest">{f.name}</p>
            {f.subtitle && <p className="line-clamp-2 text-sm text-ink-muted">{f.subtitle}</p>}
          </Card>
        </Link>
      ))}
    </div>
  );
}
