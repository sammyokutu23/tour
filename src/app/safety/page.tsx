import type { Metadata } from "next";
import { Alert, Card, Container, LinkButton, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Safety & trust", alternates: { canonical: "/safety" } };

const SECTIONS = [
  { t: "What “Verified” means", d: "A provider shows the Verified badge only after our team has recorded a passed identity check and a passed check of at least one professional credential (such as a tourism licence, a guiding certification or a business registration). Each check records who reviewed it, when, and when it expires. Profiles without completed checks are labelled “Not yet verified”." },
  { t: "What verification doesn't mean", d: "Verification confirms documents at a point in time. It is not a guarantee of service quality or safety, and it is not a substitute for your own judgement, travel insurance or official travel advice." },
  { t: "Payments", d: "You pay only after providers accept. A booking is confirmed only when the payment provider confirms the payment to us directly — never because a browser says so. We never see or store your card details." },
  { t: "Reviews", d: "Only travellers who completed a booking can review it, once per booked experience. We don't create or edit reviews, and we moderate only for clear guideline violations, with documented reasons." },
  { t: "Your information", d: "Guides see your first name, party size and the requirements you choose to share. Your email and phone stay private; you communicate through platform messages." },
  { t: "If something goes wrong", d: "Report a safety concern from your booking or the contact page. Safety reports are marked urgent for our team. In an emergency, contact local emergency services first." },
];

export default function SafetyPage() {
  return (
    <Container className="max-w-4xl py-12">
      <PageHeader eyebrow="Safety & trust" title="How we keep trips safe and honest" />
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {SECTIONS.map((s) => <Card key={s.t} className="p-6"><h2 className="text-xl font-bold text-forest">{s.t}</h2><p className="mt-2 text-sm leading-relaxed text-ink-muted">{s.d}</p></Card>)}
      </div>
      <Alert tone="info" className="mt-8">Always check current government travel advisories, park regulations and health guidance for your destinations.</Alert>
      <LinkButton href="/contact?kind=safety" variant="danger" className="mt-6">Report a safety concern</LinkButton>
    </Container>
  );
}
