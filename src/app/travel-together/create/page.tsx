import { Suspense } from "react";
import Link from "next/link";
import { Alert, Card, Container, PageHeader, PageSkeleton } from "@/components/ui";
import { GroupForm } from "@/components/travel/group-form";
import { requestDb, requireSession } from "@/server/auth/session";
import { getTravelProfile } from "@/server/services/travel-groups";
import { listAllDestinationsBrief } from "@/server/services/catalogue";
import { saveGroupAction } from "@/app/actions/travel";
import { toZoned } from "@/lib/time";

export const metadata = { title: "Create a travel group" };

export default function CreateGroupPage() {
  return (
    <Container className="max-w-4xl py-10">
      <PageHeader eyebrow="Travel Together" title="Create a travel group" description="Set the dates, destination and vibe. You can save a draft and publish when you're ready." />
      <Card className="mt-8 p-6 sm:p-8">
        <Suspense fallback={<PageSkeleton />}>
          <Form />
        </Suspense>
      </Card>
    </Container>
  );
}

async function Form() {
  const session = await requireSession("/travel-together/create");
  const db = await requestDb();
  const profile = await getTravelProfile(db, session.actor);
  if (!profile.adultConfirmed || !profile.guidelinesAccepted) {
    return (
      <Alert tone="info" title="One quick step first">
        Travel Together is for adults. Please <Link href="/travel-together/profile?next=/travel-together/create" className="font-semibold underline">confirm you&apos;re 18 or over and accept the community guidelines</Link> in your travel profile.
      </Alert>
    );
  }
  const [destinations, interests] = await Promise.all([
    listAllDestinationsBrief(db),
    db.query<{ slug: string; name: string }>("select slug, name from travel_interests order by sort_order"),
  ]);
  return (
    <GroupForm
      action={saveGroupAction.bind(null, null)}
      destinations={destinations}
      interests={interests.rows}
      minDate={toZoned(new Date(), "Africa/Nairobi").date}
      defaults={{ interests: profile.interests, travel_pace: profile.pace ?? undefined, language: profile.languages[0] ?? "English" }}
    />
  );
}
