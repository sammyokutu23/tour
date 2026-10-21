import { Suspense } from "react";
import { ConversationList } from "@/components/messages/messages";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { requestDb, requireProviderSession } from "@/server/auth/session";
import { listConversations } from "@/server/services/community";

export const metadata = { title: "Messages" };

export default function ProviderMessagesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Messages" description="Enquiries and booking conversations with travellers." />
      <Suspense fallback={<PageSkeleton />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const session = await requireProviderSession("/provider/messages");
  return <ConversationList conversations={await listConversations(await requestDb(), session.actor)} base="/provider/messages" />;
}
