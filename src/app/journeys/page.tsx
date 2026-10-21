import type { Metadata } from "next";
import Link from "next/link";
import { DestinationArt } from "@/components/art/destination-art";
import { Badge, Container, PageHeader } from "@/components/ui";
import { journeys } from "@/content/journeys";

export const metadata: Metadata = {
  title: "Curated journeys in Kenya",
  description: "Day-by-day route ideas across Kenya — safari, coast, highlands and city — that you can open and adapt in Journey Studio.",
  alternates: { canonical: "/journeys" },
};

export default function JourneysPage() {
  return (
    <Container className="py-12">
      <PageHeader eyebrow="Curated journeys" title="Routes to start from" description="These are editorial suggestions, not fixed packages. Open one in Journey Studio and every activity is checked against live availability and priced on our servers before you book." />
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {journeys.map((j) => (
          <Link key={j.slug} href={`/journeys/${j.slug}`} className="group overflow-hidden rounded-[var(--radius-card)] border border-sand-300/70 bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
            <div className="aspect-[16/8]"><DestinationArt variant={j.art} seed={j.slug} /></div>
            <div className="p-6">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-terracotta-700">{j.length} days · {j.pace} pace</p>
              <h2 className="mt-2 text-2xl font-bold text-forest">{j.title}</h2>
              <p className="mt-2 text-ink-muted">{j.summary}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">{j.bestFor.map((b) => <Badge key={b} tone="forest">{b}</Badge>)}</div>
            </div>
          </Link>
        ))}
      </div>
    </Container>
  );
}
