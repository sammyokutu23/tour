import type { Metadata } from "next";
import { Container, LinkButton, PageHeader } from "@/components/ui";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "About", alternates: { canonical: "/about" } };

export default function AboutPage() {
  return (
    <Container className="max-w-3xl py-12">
      <PageHeader eyebrow="About" title={brand.tagline} />
      <div className="mt-8 space-y-5 text-lg leading-relaxed">
        <p>{brand.name} is a Kenya-first travel marketplace built around one idea: travellers should be able to choose the people who guide them and shape every day of their visit, without giving up the safety of booking through a platform.</p>
        <p>Instead of fixed packages, you plan day by day. Instead of an anonymous driver assigned at the last minute, you compare local guides by the regions they know, the languages they speak and what they love to show. And instead of opaque pricing, you see how each price is made up before you book.</p>
        <p>For guides and local operators, we offer the tools to run a professional business: profiles that showcase real expertise, availability that prevents double bookings, clear payment records and support when something goes wrong.</p>
        <p className="text-base text-ink-muted">We&apos;re at an early stage. Some listings on the site are clearly marked demonstration data while we onboard providers.</p>
      </div>
      <div className="mt-10 flex gap-3"><LinkButton href="/studio">Start planning</LinkButton><LinkButton href="/contact" variant="secondary">Get in touch</LinkButton></div>
    </Container>
  );
}
