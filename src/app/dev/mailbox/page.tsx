import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Alert, Card, Container, PageHeader, PageSkeleton } from "@/components/ui";
import { requestDb } from "@/server/auth/session";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Dev mailbox", robots: { index: false } };

/** Local development only: shows emails captured by the dev email adapter (e.g. password resets). */
export default function MailboxPage() {
  return (
    <Container className="py-12">
      <PageHeader title="Development mailbox" description="Emails captured by the development email adapter. Nothing here was actually sent." />
      <Alert tone="warning" className="mt-6">Only available when NODE_ENV is not production and EMAIL_PROVIDER is “dev”.</Alert>
      <Suspense fallback={<PageSkeleton />}><List /></Suspense>
    </Container>
  );
}

async function List() {
  const db = await requestDb();
  if (process.env.NODE_ENV === "production" || (process.env.EMAIL_PROVIDER ?? "dev") !== "dev") notFound();
  const { rows } = await db.query<{ id: string; to_address: string; subject: string; text_body: string | null; created_at: Date }>(
    "select id, to_address, subject, text_body, created_at from email_messages where provider = 'dev' order by created_at desc limit 50",
  );
  return (
    <div className="mt-6 space-y-3">
      {rows.length === 0 && <p className="text-sm text-ink-muted">No emails yet.</p>}
      {rows.map((m) => (
        <Card key={m.id} className="p-4">
          <p className="text-xs text-ink-subtle">To {m.to_address} · {formatDate(m.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
          <p className="font-semibold text-forest">{m.subject}</p>
          <pre data-testid="mail-body" className="mt-2 whitespace-pre-wrap break-all font-sans text-sm">{m.text_body}</pre>
        </Card>
      ))}
    </div>
  );
}
