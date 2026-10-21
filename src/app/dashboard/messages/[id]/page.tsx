import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ConversationView } from "@/components/messages/messages";
import { PageSkeleton } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { getConversation } from "@/server/services/community";
import { NotFoundError } from "@/domain/authz";

export const metadata = { title: "Conversation" };
type Params = Promise<{ id: string }>;

export default function ConversationPage({ params }: { params: Params }) {
  return (
    <div className="space-y-4">
      <Link href="/dashboard/messages" className="text-sm font-semibold text-forest underline">← All messages</Link>
      <Suspense fallback={<PageSkeleton />}>
        <Conversation params={params} />
      </Suspense>
    </div>
  );
}

async function Conversation({ params }: { params: Params }) {
  const { id } = await params;
  const session = await requireSession(`/dashboard/messages/${id}`);
  const conv = await getConversation(await requestDb(), session.actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return <ConversationView conversation={conv} bookingHref={conv.booking_id ? `/dashboard/bookings/${conv.booking_id}` : null} />;
}
