import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHeader } from "@/components/ui";
import { FAQS } from "@/content/faqs";

export const metadata: Metadata = { title: "FAQs", alternates: { canonical: "/faq" } };

export default function FaqPage() {
  const jsonLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <Container className="max-w-3xl py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <PageHeader eyebrow="Help" title="Frequently asked questions" />
      <div className="mt-8 divide-y divide-forest/15 rounded-[var(--radius-card)] border-2 border-forest bg-white shadow-[var(--shadow-card)]">
        {FAQS.map((f) => (
          <details key={f.q} className="group p-5">
            <summary className="cursor-pointer list-none font-bold text-forest [&::-webkit-details-marker]:hidden">{f.q}</summary>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.a}</p>
          </details>
        ))}
      </div>
      <p className="mt-6 text-sm text-ink-muted">Still stuck? <Link href="/contact" className="font-semibold text-forest underline">Contact us</Link>.</p>
    </Container>
  );
}
