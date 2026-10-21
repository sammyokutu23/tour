import type { Metadata } from "next";
import { UsersRound, BarChart3, BadgeCheck, Bell, CalendarCheck, CreditCard, FileClock, LifeBuoy, ListChecks, MapPinned, RotateCcw, Settings, Star, Users, Wallet } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export const metadata: Metadata = { title: { template: "%s · Admin", default: "Admin" }, robots: { index: false } };

const NAV = [
  { href: "/admin", label: "Overview", Icon: BarChart3 },
  { href: "/admin/providers", label: "Verification", Icon: BadgeCheck },
  { href: "/admin/listings", label: "Listings", Icon: ListChecks },
  { href: "/admin/bookings", label: "Bookings", Icon: CalendarCheck },
  { href: "/admin/payments", label: "Payments", Icon: CreditCard },
  { href: "/admin/refunds", label: "Refunds", Icon: RotateCcw },
  { href: "/admin/payouts", label: "Payouts", Icon: Wallet },
  { href: "/admin/support", label: "Support & disputes", Icon: LifeBuoy },
  { href: "/admin/travel-together", label: "Travel Together", Icon: UsersRound },
  { href: "/admin/reviews", label: "Reviews", Icon: Star },
  { href: "/admin/users", label: "Users", Icon: Users },
  { href: "/admin/destinations", label: "Destinations", Icon: MapPinned },
  { href: "/admin/settings", label: "Fees & settings", Icon: Settings },
  { href: "/admin/notifications", label: "Notifications", Icon: Bell },
  { href: "/admin/audit", label: "Audit log", Icon: FileClock },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell title="Operations" nav={NAV}>{children}</DashboardShell>;
}
