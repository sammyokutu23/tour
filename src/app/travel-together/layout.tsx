import type { Metadata } from "next";
import { TravelNav } from "@/components/travel/travel-nav";

export const metadata: Metadata = { title: { template: "%s · Travel Together", default: "Travel Together" } };

export default function TravelTogetherLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TravelNav />
      {children}
    </>
  );
}
