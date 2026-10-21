import Link from "next/link";
import { brand } from "@/config/brand";
import { cn } from "@/components/ui";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("h-9 w-9", className)} aria-hidden>
      <rect width="40" height="40" rx="12" fill="#163D32" />
      <circle cx="26" cy="15" r="6" fill="#E9B949" />
      <path d="M6 29 C 12 23, 18 26, 22 22 C 26 18, 31 21, 34 19 L34 34 L6 34 Z" fill="#D96C43" />
      <path d="M6 31 C 14 27, 22 31, 34 27 L34 34 L6 34 Z" fill="#F6F1E8" opacity="0.92" />
    </svg>
  );
}

export function Logo({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5", className)} aria-label={`${brand.name} home`}>
      <LogoMark />
      <span className={cn("hidden font-display text-lg font-bold leading-none tracking-tight sm:inline", tone === "dark" ? "text-forest" : "text-sand")}>
        {brand.name}
      </span>
    </Link>
  );
}
