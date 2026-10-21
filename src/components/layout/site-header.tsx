import Link from "next/link";
import { Suspense } from "react";
import { Bell, Menu, UserRound } from "lucide-react";
import { Logo } from "./logo";
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
    <header className="sticky top-0 z-40 border-b border-sand-300/60 bg-sand/90 backdrop-blur supports-[backdrop-filter]:bg-sand/75">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-forest focus:px-4 focus:py-2 focus:text-sand">
        Skip to content
      </a>
      <Container className="flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-full px-3.5 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-forest-50 hover:text-forest">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden sm:block">
            <Link href="/studio" className={buttonClass("gold", "sm")}>
              Plan a trip
            </Link>
          </span>
          <Suspense fallback={<div className="h-9 w-20 rounded-full skeleton" aria-hidden />}>
            <UserMenu />
          </Suspense>
          <details className="group relative lg:hidden">
            <summary className={buttonClass("ghost", "icon", "list-none [&::-webkit-details-marker]:hidden")} aria-label="Open menu">
              <Menu aria-hidden className="h-5 w-5" />
            </summary>
            <nav aria-label="Mobile" className="absolute right-0 mt-2 w-60 rounded-2xl border border-sand-300 bg-white p-2 shadow-[var(--shadow-lift)]">
              {[...NAV, { href: "/studio", label: "Journey Studio" }].map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-charcoal hover:bg-forest-50">
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
        <Link href="/login" className={buttonClass("ghost", "sm")}>
          Sign in
        </Link>
        <span className="hidden md:block">
          <Link href="/register" className={buttonClass("primary", "sm")}>
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
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-terracotta ring-2 ring-sand" />}
      </Link>
      <details className="relative">
        <summary className={buttonClass("secondary", "sm", "list-none gap-2 [&::-webkit-details-marker]:hidden")}>
          <UserRound aria-hidden className="h-4 w-4" />
          <span className="max-w-28 truncate">{session.displayName.split(" ")[0]}</span>
        </summary>
        <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-sand-300 bg-white p-2 shadow-[var(--shadow-lift)]">
          <p className="truncate px-3 py-2 text-xs text-ink-subtle">{session.email}</p>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-forest-50">
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
