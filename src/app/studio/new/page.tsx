import type { Metadata } from "next";
import { Suspense } from "react";
import { Alert, Card, Container, PageHeader, Skeleton } from "@/components/ui";
import { TripForm } from "@/components/studio/trip-form";
import { createTripAction } from "@/app/actions/studio";
import { getSession, requestDb } from "@/server/auth/session";
import { listAllDestinationsBrief } from "@/server/services/catalogue";
import { getJourney } from "@/content/journeys";
import { addDays, toZoned } from "@/lib/time";

export const metadata: Metadata = { title: "Start a new trip", alternates: { canonical: "/studio/new" } };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export default function NewTripPage({ searchParams }: { searchParams: SP }) {
  return (
    <Container className="max-w-4xl py-12">
      <PageHeader eyebrow="Journey Studio" title="Tell us about your trip" description="A few details help us check availability and suggest experiences. You can change everything later." />
      <Card className="mt-8 p-6 sm:p-8">
        <Suspense fallback={<Skeleton className="h-[520px]" />}>
          <Form searchParams={searchParams} />
        </Suspense>
      </Card>
    </Container>
  );
}

async function Form({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await requestDb();
  const session = await getSession();
  const destinations = await listAllDestinationsBrief(db);
  const today = toZoned(new Date(), "Africa/Nairobi").date;

  const journey = getJourney(one(sp.journey));
  const destSlug = one(sp.destination) || journey?.startDestination;
  const destId = one(sp.primaryDestinationId) || destinations.find((d) => d.slug === destSlug)?.id || null;
  const start = isDate(one(sp.startDate)) ? one(sp.startDate) : isDate(one(sp.date)) ? one(sp.date) : addDays(today, 14);
  const lengthDays = journey?.length ?? 4;
  const end = isDate(one(sp.endDate)) ? one(sp.endDate) : isDate(one(sp.end)) ? one(sp.end) : addDays(start, lengthDays - 1);
  const interests = (Array.isArray(sp.interests) ? sp.interests : sp.interests ? [sp.interests] : []).filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      {!session && (
        <Alert tone="info" title="You can fill this in now">
          We&apos;ll ask you to create a free account when you save, so your itinerary is kept private to you. Your details are carried over.
        </Alert>
      )}
      {journey && <Alert tone="success" title={`Starting from “${journey.title}”`}>Dates are set for {journey.length} days. Add the suggested activities from the catalogue once your trip is created.</Alert>}
      <TripForm
        action={createTripAction}
        destinations={destinations}
        minDate={today}
        submitLabel={session ? "Create trip & open planner" : "Continue"}
        defaults={{
          title: one(sp.title) || (journey ? journey.title : undefined),
          primaryDestinationId: destId,
          startDate: start,
          endDate: end,
          adults: Number(one(sp.adults) || one(sp.party)) || 2,
          children: Number(one(sp.children)) || 0,
          budgetMajor: one(sp.budget) ? Number(one(sp.budget)) : null,
          interests: interests.length ? interests : journey?.bestFor.map((b) => b.toLowerCase()).filter(Boolean),
          pace: one(sp.pace) || journey?.pace,
          tourType: one(sp.tourType) || undefined,
        }}
      />
    </div>
  );
}
