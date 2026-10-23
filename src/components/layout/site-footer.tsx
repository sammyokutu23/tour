import Link from "next/link";
import { Logo } from "./logo";
import { Container } from "@/components/ui";
import { brand } from "@/config/brand";

const COLUMNS = [
  {
    title: "Explore",
    links: [
      { href: "/destinations", label: "Destinations" },
      { href: "/experiences", label: "Experiences" },
      { href: "/guides", label: "Find a guide" },
      { href: "/journeys", label: "Curated journeys" },
      { href: "/travel-together", label: "Travel Together" },
      { href: "/studio", label: "Journey Studio" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/safety", label: "Safety & trust" },
      { href: "/register?type=guide", label: "Become a guide" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/faq", label: "FAQs" },
      { href: "/contact", label: "Contact & help" },
      { href: "/legal/cancellation", label: "Cancellations & refunds" },
      { href: "/legal/terms", label: "Terms" },
      { href: "/legal/privacy", label: "Privacy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t-2 border-forest bg-white">
      <Container className="grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-sm space-y-4">
          <Logo />
          <p className="font-display text-2xl font-extrabold leading-[1.05] tracking-[-0.05em] text-forest">{brand.tagline}</p>
          <p className="text-sm leading-relaxed text-ink-muted">{brand.description}</p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <p className="pill-label mb-5 text-forest">{c.title}</p>
            <ul className="space-y-2.5">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm font-semibold text-ink-muted underline-offset-4 hover:text-forest hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <div className="border-t border-forest/15">
        <Container className="flex flex-col gap-2 py-6 text-xs text-ink-subtle sm:flex-row sm:justify-between">
          <p>Built for travellers in Kenya. © {brand.name}. Listings marked “Demo” are fictional and for demonstration only.</p>
          <p>Prices in Kenyan shillings (KES). Payments shown in test mode are not real charges.</p>
        </Container>
      </div>
    </footer>
  );
}
