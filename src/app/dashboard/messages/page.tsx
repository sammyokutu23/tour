import { Suspense } from "react";
import { ConversationList } from "@/components/messages/messages";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { listConversations } from "@/server/services/community";

export const metadata = { title: "Messages" };

export default function MessagesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Messages" description="Conversations with your guides and providers." />
      <Suspense fallback={<PageSkeleton />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const session = await requireSession("/dashboard/messages");
  return <ConversationList conversations={await listConversations(await requestDb(), session.actor)} base="/dashboard/messages" />;
}
