import { Suspense } from "react";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { requireRole } from "@/server/auth/session";
import { destinationAction } from "@/app/actions/admin";
import { DestinationForm } from "../form";

export const metadata = { title: "New destination" };

export default function NewDestinationPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="New destination" description="Describe places accurately and conservatively. Only add photos you have a licence to use." />
      <Card className="p-6"><Suspense fallback={<PageSkeleton />}><Guarded /></Suspense></Card>
    </div>
  );
}

async function Guarded() {
  await requireRole("/admin/destinations/new", ["admin"]);
  return <DestinationForm action={destinationAction.bind(null, null)} />;
}
