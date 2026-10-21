import type { Metadata } from "next";
import { Bell, CalendarCheck, Heart, LayoutDashboard, LifeBuoy, Map, MessageSquare, Settings } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export const metadata: Metadata = { title: { template: "%s · My trips", default: "My trips" }, robots: { index: false } };

const NAV = [
  { href: "/dashboard", label: "Overview", Icon: LayoutDashboard },
  { href: "/dashboard/trips", label: "Trips", Icon: Map },
  { href: "/dashboard/bookings", label: "Bookings", Icon: CalendarCheck },
  { href: "/dashboard/messages", label: "Messages", Icon: MessageSquare },
  { href: "/dashboard/notifications", label: "Notifications", Icon: Bell },
  { href: "/dashboard/saved", label: "Saved", Icon: Heart },
  { href: "/dashboard/support", label: "Support", Icon: LifeBuoy },
  { href: "/dashboard/settings", label: "Settings", Icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell title="My account" nav={NAV}>{children}</DashboardShell>;
}
