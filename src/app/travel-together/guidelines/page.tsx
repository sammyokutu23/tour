import type { Metadata } from "next";
import { Alert, Card, Container, LinkButton, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Community guidelines & safety", alternates: { canonical: "/travel-together/guidelines" } };

const RULES = [
  { t: "Be respectful", d: "No harassment, hate, threats or unwanted advances. Treat people as you would a friend of a friend." },
  { t: "Be honest", d: "Use your real first name and describe your plans accurately. Don't impersonate anyone." },
  { t: "No money between travellers", d: "Never ask for, or send, money, M-Pesa PINs or card details to other travellers. Book and pay through the platform; nobody pays on your behalf unless you explicitly agree." },
  { t: "Fair group rules", d: "Organizers may set pace, activity level and expectations, but not exclude people for who they are or ask for sensitive personal information." },
  { t: "Protect privacy", d: "Don't share other members' details, photos or plans outside the group without their consent." },
  { t: "Adults only", d: "Travel Together is for travellers aged 18 and over. Families travelling with children should plan through Journey Studio." },
];

export default function GuidelinesPage() {
  return (
    <Container className="max-w-4xl py-10">
      <PageHeader eyebrow="Travel Together" title="Community guidelines & safety" description="Small-group travel works because people look out for each other. These rules apply to every group, chat and profile." />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {RULES.map((r) => <Card key={r.t} className="p-5"><h2 className="text-lg font-bold text-forest">{r.t}</h2><p className="mt-1 text-sm text-ink-muted">{r.d}</p></Card>)}
      </div>
      <section className="mt-10 space-y-4">
        <h2 className="text-2xl text-forest">Staying safe</h2>
        <ul className="list-inside list-disc space-y-2 text-sm text-ink-muted">
          <li>Members are fellow travellers. We don&apos;t background-check them, and joining a group doesn&apos;t mean we vouch for anyone.</li>
          <li>Meet in public places first, keep your own accommodation and transport details private until you&apos;re comfortable, and tell someone you trust about your plans.</li>
          <li>Keep conversations on the platform so we can help if something goes wrong.</li>
          <li>You can leave a group at any time. Bookings you made yourself stay yours to keep or cancel under their policy.</li>
          <li>We don&apos;t track your location. If you share it with others, that&apos;s your choice.</li>
        </ul>
        <h2 className="pt-4 text-2xl text-forest">Reporting & blocking</h2>
        <p className="text-sm text-ink-muted">Report a group, member or message from the “Report” links throughout Travel Together. Reports are private: only our safety team sees them, and the other person is never told who reported them. You can block anyone from their profile card or the members list.</p>
        <Alert tone="warning" title="Emergencies">If you&apos;re in immediate danger in Kenya, call 999 or 112, or contact the nearest police station. Then let us know so we can help.</Alert>
        <h2 className="pt-4 text-2xl text-forest">What happens to your data</h2>
        <p className="text-sm text-ink-muted">If you leave a group, you lose access to its chat and plan; your past messages remain visible to members under your first name. If you delete your account, your memberships end, any group you organise must first be handed over or cancelled, and your messages are shown as from “Former member”.</p>
        <div className="flex gap-3 pt-2">
          <LinkButton href="/contact?kind=safety" variant="danger">Report a safety concern</LinkButton>
          <LinkButton href="/travel-together" variant="secondary">Back to Travel Together</LinkButton>
        </div>
      </section>
    </Container>
  );
}
