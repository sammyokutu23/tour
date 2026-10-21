import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Card, Container, Field, Input, PageHeader, Select, Skeleton, Textarea } from "@/components/ui";
import { getSession } from "@/server/auth/session";
import { contactAction } from "@/app/actions/catalogue";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Contact & help", alternates: { canonical: "/contact" } };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function ContactPage({ searchParams }: { searchParams: SP }) {
  return (
    <Container className="max-w-3xl py-12">
      <PageHeader eyebrow="Help" title="Contact us" description={`Questions, problems with a booking or a safety concern — we'll respond by email or in your account. You can also email ${brand.supportEmail}.`} />
      <Card className="mt-8 p-6">
        <Suspense fallback={<Skeleton className="h-80" />}>
          <Form searchParams={searchParams} />
        </Suspense>
      </Card>
      <p className="mt-4 text-xs text-ink-subtle">In an emergency, contact local emergency services first.</p>
    </Container>
  );
}

async function Form({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await getSession();
  const kind = typeof sp.kind === "string" && ["support", "dispute", "safety", "report"].includes(sp.kind) ? sp.kind : "support";
  const bookingId = typeof sp.booking === "string" ? sp.booking : "";
  return (
    <ActionForm action={contactAction} resetOnSuccess>
      <input type="hidden" name="bookingId" value={session ? bookingId : ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What's this about?" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue={kind}>
            <option value="support">A question or problem</option>
            <option value="dispute">A dispute about a booking or payment</option>
            <option value="safety">A safety concern</option>
            <option value="report">Reporting content or a review</option>
          </Select>
        </Field>
        {!session && <Field label="Your email" htmlFor="email" required><Input id="email" name="email" type="email" autoComplete="email" required /></Field>}
      </div>
      <Field label="Subject" htmlFor="subject" required><Input id="subject" name="subject" required maxLength={200} /></Field>
      <Field label="Details" htmlFor="description" hint={bookingId && session ? "This request will be linked to your booking." : undefined} required><Textarea id="description" name="description" required className="min-h-36" /></Field>
      <SubmitButton pendingLabel="Sending…">Send</SubmitButton>
    </ActionForm>
  );
}
