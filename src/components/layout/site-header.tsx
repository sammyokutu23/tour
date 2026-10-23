import Link from "next/link";
import { Suspense } from "react";
import { Bell, Menu, UserRound } from "lucide-react";
import { Logo } from "./logo";
import { NavLinks } from "./nav-links";
import { buttonClass, Container } from "@/components/ui";
import { getSession, requestDb } from "@/server/auth/session";
import { unreadNotificationCount } from "@/server/services/community";
import { logoutAction } from "@/app/actions/auth";

const NAV = [
  { href: "/destinations", label: "Destinations" },
  { href: "/experiences", label: "Experiences" },
  { href: "/guides", label: "Guides" },
  { href: "/travel-together", label: "Travel Together" },
  { href: "/journeys", label: "Journeys" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 pt-3">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-forest focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <Container className="flex items-center justify-between gap-3">
        <div className="rounded-full border-2 border-forest bg-white py-1 pl-1 pr-4 shadow-[0_4px_0_0_#111]">
          <Logo />
        </div>
        <div className="flex items-center gap-1 rounded-full border-2 border-forest bg-white p-1 shadow-[0_4px_0_0_#111]">
          <nav aria-label="Main" className="hidden items-center lg:flex">
            <NavLinks items={NAV} />
          </nav>
          <Suspense fallback={<div className="h-9 w-20 rounded-full skeleton" aria-hidden />}>
            <UserMenu />
          </Suspense>
          <Link href="/studio" className={buttonClass("primary", "sm", "hidden h-10 shadow-none sm:inline-flex")}>
            Plan a trip
          </Link>
          <details className="group relative lg:hidden">
            <summary className={buttonClass("ghost", "icon", "list-none [&::-webkit-details-marker]:hidden")} aria-label="Open menu">
              <Menu aria-hidden className="h-5 w-5" />
            </summary>
            <nav aria-label="Mobile" className="absolute right-0 mt-3 w-60 rounded-2xl border-2 border-forest bg-white p-2 shadow-[var(--shadow-lift)]">
              {[...NAV, { href: "/studio", label: "Journey Studio" }].map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-xl px-3 py-2.5 text-sm font-bold text-charcoal hover:bg-gold">
                  {n.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </Container>
    </header>
  );
}

async function UserMenu() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="flex items-center gap-1">
        <Link href="/login" className="rounded-full px-4 py-2.5 text-[0.8rem] font-bold text-ink-muted hover:bg-forest-50 hover:text-forest">
          Log in
        </Link>
        <span className="hidden md:block">
          <Link href="/register" className="rounded-full px-4 py-2.5 text-[0.8rem] font-bold text-ink-muted hover:bg-forest-50 hover:text-forest">
            Join
          </Link>
        </span>
      </div>
    );
  }
  const db = await requestDb();
  const unread = await unreadNotificationCount(db, session.actor);
  const roles = session.actor.roles;
  const links = [
    { href: "/dashboard", label: "My trips" },
    { href: "/dashboard/bookings", label: "Bookings" },
    { href: "/dashboard/messages", label: "Messages" },
    { href: "/dashboard/saved", label: "Saved" },
    { href: "/dashboard/settings", label: "Settings" },
    ...(roles.includes("guide") || roles.includes("operator") ? [{ href: "/provider", label: "Provider dashboard" }] : []),
    ...(roles.includes("admin") || roles.includes("support") ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <div className="flex items-center gap-1">
      <Link href="/dashboard/notifications" className={buttonClass("ghost", "icon", "relative")} aria-label={unread ? `${unread} unread notifications` : "Notifications"}>
        <Bell aria-hidden className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-forest" />}
      </Link>
      <details className="relative">
        <summary className={buttonClass("ghost", "sm", "list-none gap-2 text-[0.8rem] [&::-webkit-details-marker]:hidden")}>
          <UserRound aria-hidden className="h-4 w-4" />
          <span className="max-w-28 truncate">{session.displayName.split(" ")[0]}</span>
        </summary>
        <div className="absolute right-0 mt-3 w-56 rounded-2xl border-2 border-forest bg-white p-2 shadow-[var(--shadow-lift)]">
          <p className="truncate px-3 py-2 text-xs text-ink-subtle">{session.email}</p>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="block rounded-xl px-3 py-2 text-sm font-semibold hover:bg-gold">
              {l.label}
            </Link>
          ))}
          <form action={logoutAction}>
            <button className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-terracotta-700 hover:bg-terracotta-100">Sign out</button>
          </form>
        </div>
      </details>
    </div>
  );
}
