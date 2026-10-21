import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DestinationArt } from "@/components/art/destination-art";
import { Alert, Badge, Container, LinkButton, PageSkeleton } from "@/components/ui";
import { getJourney, journeys } from "@/content/journeys";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return journeys.map((j) => ({ slug: j.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const j = getJourney((await params).slug);
  return j ? { title: j.title, description: j.summary, alternates: { canonical: `/journeys/${j.slug}` } } : { title: "Journey not found" };
}

export default function JourneyPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Container className="py-16"><PageSkeleton /></Container>}>
      <Journey params={params} />
    </Suspense>
  );
}

async function Journey({ params }: { params: Params }) {
  const j = getJourney((await params).slug);
  if (!j) notFound();
  return (
    <>
      <section className="relative isolate overflow-hidden bg-forest-950">
        <div className="absolute inset-0 -z-10 opacity-80"><DestinationArt variant={j.art} seed={j.slug} /></div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-forest-950/95 to-forest-950/30" />
        <Container className="pb-12 pt-32">
          <p className="text-sm font-semibold text-gold">{j.length} days · {j.pace} pace</p>
          <h1 className="mt-2 max-w-3xl text-balance text-4xl text-sand sm:text-6xl">{j.title}</h1>
          <p className="mt-4 max-w-2xl text-lg text-sand/85">{j.summary}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton href={`/studio/new?journey=${j.slug}`} variant="gold" size="lg">Plan this journey</LinkButton>
          </div>
        </Container>
      </section>
      <Container className="max-w-4xl py-14">
        <ol className="relative space-y-6 border-l-2 border-dashed border-sand-300 pl-8">
          {j.days.map((d, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[45px] flex h-8 w-8 items-center justify-center rounded-full bg-forest text-sm font-bold text-gold">{i + 1}</span>
              <h2 className="text-xl font-bold text-forest">{d.title}</h2>
              <p className="mt-1 text-sm font-semibold text-terracotta-700"><Link href={`/destinations/${d.destination}`} className="hover:underline">{d.destination.replace(/-/g, " ")}</Link></p>
              <p className="mt-2 text-ink-muted">{d.description}</p>
              {d.experienceCategory && <Link href={`/experiences?destination=${d.destination}&category=${d.experienceCategory}`} className="mt-2 inline-block text-sm font-semibold text-forest underline">See matching experiences</Link>}
            </li>
          ))}
        </ol>
        <Alert tone="info" className="mt-10" title="Good to know">{j.travelNotes}</Alert>
        <div className="mt-6 flex flex-wrap gap-1.5">{j.bestFor.map((b) => <Badge key={b} tone="forest">{b}</Badge>)}</div>
      </Container>
    </>
  );
}
