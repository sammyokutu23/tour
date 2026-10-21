import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Card, Container, PageHeader, PageSkeleton } from "@/components/ui";
import { GroupForm } from "@/components/travel/group-form";
import { requestDb, requireSession } from "@/server/auth/session";
import { getGroupForEdit } from "@/server/services/travel-groups";
import { listAllDestinationsBrief } from "@/server/services/catalogue";
import { saveGroupAction } from "@/app/actions/travel";
import { NotFoundError, ForbiddenError } from "@/domain/authz";
import { toZoned } from "@/lib/time";

export const metadata = { title: "Edit group" };
type Params = Promise<{ groupId: string }>;

export default function EditGroupPage({ params }: { params: Params }) {
  return (
    <Container className="max-w-4xl py-10">
      <PageHeader eyebrow="Travel Together" title="Edit group" description="Changes are visible to members straight away. Agreed activities stay in the plan." />
      <Card className="mt-8 p-6 sm:p-8">
        <Suspense fallback={<PageSkeleton />}>
          <Form params={params} />
        </Suspense>
      </Card>
    </Container>
  );
}

async function Form({ params }: { params: Params }) {
  const { groupId } = await params;
  const session = await requireSession(`/travel-together/${groupId}/edit`);
  const db = await requestDb();
  const group = await getGroupForEdit(db, session.actor, groupId).catch((e) => {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  });
  const [destinations, interests] = await Promise.all([listAllDestinationsBrief(db), db.query<{ slug: string; name: string }>("select slug, name from travel_interests order by sort_order")]);
  return (
    <GroupForm
      action={saveGroupAction.bind(null, groupId)}
      destinations={destinations}
      interests={interests.rows}
      minDate={toZoned(new Date(), "Africa/Nairobi").date}
      defaults={group}
      isEdit
    />
  );
}
