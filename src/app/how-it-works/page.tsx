import type { Metadata } from "next";
import { CalendarRange, CheckCircle2, CreditCard, MessageSquare, Search, UserCheck } from "lucide-react";
import { Card, Container, LinkButton, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "How it works", alternates: { canonical: "/how-it-works" } };

const STEPS = [
  { Icon: Search, t: "Explore", d: "Browse destinations, experiences and guides. Filter by dates to see only what's actually available." },
  { Icon: CalendarRange, t: "Plan in Journey Studio", d: "Create a trip and add experiences and guide time to each day. We flag overlaps, tight transfers and availability problems as you go." },
  { Icon: CheckCircle2, t: "Get a confirmed quote", d: "We re-check every slot and guide calendar and calculate the price on our servers, with a full breakdown. Quotes are held briefly." },
  { Icon: UserCheck, t: "Providers accept", d: "Your request goes to each guide and operator. Your places are held while they respond. Nothing is charged yet." },
  { Icon: CreditCard, t: "Pay and confirm", d: "Once everyone accepts, pay securely. Your booking is confirmed only after the payment provider verifies the payment." },
  { Icon: MessageSquare, t: "Travel with support", d: "Message providers, request changes and get help from our team. After your trip, review what you booked." },
];

export default function HowItWorksPage() {
  return (
    <Container className="py-12">
      <PageHeader eyebrow="How it works" title="From idea to itinerary to booked" description="You stay in control of who guides you and what each day looks like. We handle availability, payments and support." />
      <ol className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {STEPS.map(({ Icon, t, d }, i) => (
          <li key={t}>
            <Card className="h-full p-6">
              <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest font-bold text-gold">{i + 1}</span><Icon aria-hidden className="h-5 w-5 text-terracotta-700" /></div>
              <h2 className="mt-4 text-xl font-bold text-forest">{t}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{d}</p>
            </Card>
          </li>
        ))}
      </ol>
      <section className="mt-16 grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-2xl font-bold text-forest">For guides</h2>
          <p className="mt-2 text-ink-muted">Create a profile, upload your credentials for review, set your services, prices and working hours, and accept the requests that suit you. Earnings are tracked in a transparent ledger.</p>
          <LinkButton href="/register?type=guide" className="mt-4">Join as a guide</LinkButton>
        </Card>
        <Card className="p-6">
          <h2 className="text-2xl font-bold text-forest">For experience operators</h2>
          <p className="mt-2 text-ink-muted">List activities with schedules and capacity. Listings are reviewed before going live, and confirmed bookings always keep the terms the traveller agreed to.</p>
          <LinkButton href="/register?type=operator" variant="secondary" className="mt-4">Join as an operator</LinkButton>
        </Card>
      </section>
    </Container>
  );
}
