import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { getDestinationAdmin } from "@/server/services/admin";
import { destinationAction } from "@/app/actions/admin";
import { NotFoundError } from "@/domain/authz";
import { DestinationForm } from "../form";

export const metadata = { title: "Edit destination" };
type Params = Promise<{ id: string }>;

export default function EditDestinationPage({ params }: { params: Params }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Edit destination" />
      <Card className="p-6"><Suspense fallback={<PageSkeleton />}><Form params={params} /></Suspense></Card>
    </div>
  );
}

async function Form({ params }: { params: Params }) {
  const { id } = await params;
  const session = await requireRole(`/admin/destinations/${id}`, ["admin"]);
  const d = await getDestinationAdmin(await requestDb(), session.actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return <DestinationForm action={destinationAction.bind(null, id)} d={d} />;
}
