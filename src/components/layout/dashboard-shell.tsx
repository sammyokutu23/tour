import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Container } from "@/components/ui";

export interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

/** Sidebar layout shared by the traveller, provider and admin areas. Links are static; pages enforce access. */
export function DashboardShell({ title, nav, children, tone = "light" }: { title: string; nav: NavItem[]; children: ReactNode; tone?: "light" | "dark" }) {
  return (
    <div className={tone === "dark" ? "bg-forest-950" : "bg-sand"}>
      <Container className="grid gap-8 py-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label={`${title} navigation`} className="lg:sticky lg:top-24 lg:h-fit">
          <p className={`mb-3 hidden text-xs font-bold uppercase tracking-[0.18em] lg:block ${tone === "dark" ? "text-gold" : "text-terracotta-700"}`}>{title}</p>
          <ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {nav.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${tone === "dark" ? "text-sand/80 hover:bg-sand/10 hover:text-sand" : "text-ink-muted hover:bg-white hover:text-forest"}`}
                >
                  <Icon aria-hidden className="h-4 w-4" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </Container>
    </div>
  );
}
