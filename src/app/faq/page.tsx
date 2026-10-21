import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "FAQs", alternates: { canonical: "/faq" } };

const FAQS = [
  { q: "Is adding something to my itinerary a booking?", a: "No. Drafts and quotes reserve nothing. A booking request holds places while providers respond, and a booking is confirmed only after payment is verified." },
  { q: "When am I charged?", a: "Only after every provider in your request accepts, and only when you choose to pay. If a provider declines, nothing is charged and your itinerary returns to draft." },
  { q: "How are prices calculated?", a: "On our servers, from the provider's current catalogue price, your group size and any group discounts they offer, plus a service fee shown in the breakdown. The quote is locked for a short time." },
  { q: "Which payment methods are available?", a: "M-Pesa is supported where configured. In test environments a clearly labelled sandbox is used and no real money moves." },
  { q: "Can I cancel?", a: "Yes. Each experience and guide service has a cancellation policy (flexible, moderate or strict) shown before you book, and your booking page tells you exactly what you'd get back before you confirm. If a provider cancels, you're refunded in full for their part." },
  { q: "Are travel times between activities accurate?", a: "Where no routing service is configured, travel times are estimates from straight-line distance and are labelled as estimates. Always allow extra time, especially on long road transfers." },
  { q: "How do I know a guide is genuine?", a: "Look for the Verified badge and the list of checks on their profile. See our Safety & trust page for exactly what those checks cover." },
  { q: "What are “Demo” listings?", a: "Fictional sample data used while the marketplace is in development. They're clearly labelled and any bookings use the sandbox payment provider." },
];

export default function FaqPage() {
  const jsonLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <Container className="max-w-3xl py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <PageHeader eyebrow="Help" title="Frequently asked questions" />
      <div className="mt-8 divide-y divide-sand-300 rounded-[var(--radius-card)] border border-sand-300/70 bg-white">
        {FAQS.map((f) => (
          <details key={f.q} className="group p-5">
            <summary className="cursor-pointer list-none font-semibold text-forest [&::-webkit-details-marker]:hidden">{f.q}</summary>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.a}</p>
          </details>
        ))}
      </div>
      <p className="mt-6 text-sm text-ink-muted">Still stuck? <Link href="/contact" className="font-semibold text-forest underline">Contact us</Link>.</p>
    </Container>
  );
}
