import { Suspense } from "react";
import { ExperienceForm } from "@/components/provider/forms";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { requestDb, requireProviderSession } from "@/server/auth/session";
import { listAllDestinationsBrief, listCategories } from "@/server/services/catalogue";
import { saveExperienceAction } from "@/app/actions/provider";

export const metadata = { title: "New experience" };

export default function NewListingPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="New experience" description="Saved as a draft. Add time slots, then submit for review." />
      <Card className="p-6">
        <Suspense fallback={<PageSkeleton />}>
          <Form />
        </Suspense>
      </Card>
    </div>
  );
}

async function Form() {
  await requireProviderSession("/provider/listings/new");
  const db = await requestDb();
  const [destinations, categories] = await Promise.all([listAllDestinationsBrief(db), listCategories(db)]);
  return <ExperienceForm action={saveExperienceAction.bind(null, null)} destinations={destinations} categories={categories} submitLabel="Save draft" />;
}
