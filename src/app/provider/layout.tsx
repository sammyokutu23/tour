import type { Metadata } from "next";
import { CalendarClock, CalendarCheck, LayoutDashboard, ListChecks, MessageSquare, Star, UserCog, Wallet, Compass } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export const metadata: Metadata = { title: { template: "%s · Provider", default: "Provider dashboard" }, robots: { index: false } };

const NAV = [
  { href: "/provider", label: "Overview", Icon: LayoutDashboard },
  { href: "/provider/bookings", label: "Bookings", Icon: CalendarCheck },
  { href: "/provider/profile", label: "Profile & verification", Icon: UserCog },
  { href: "/provider/services", label: "Guide services", Icon: Compass },
  { href: "/provider/listings", label: "Experiences", Icon: ListChecks },
  { href: "/provider/availability", label: "Availability", Icon: CalendarClock },
  { href: "/provider/messages", label: "Messages", Icon: MessageSquare },
  { href: "/provider/earnings", label: "Earnings", Icon: Wallet },
  { href: "/provider/reviews", label: "Reviews", Icon: Star },
];

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell title="Provider" nav={NAV}>{children}</DashboardShell>;
}
