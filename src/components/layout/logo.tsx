import Link from "next/link";
import { brand } from "@/config/brand";
import { cn } from "@/components/ui";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("h-9 w-9", className)} aria-hidden>
      <rect width="40" height="40" rx="11" fill="#111111" />
      <circle cx="27" cy="14" r="6" fill="#F2B11B" />
      <path d="M19 30 L19.8 20.5 L20.6 30 Z M8 20.5 C 12 18.5, 28 18.5, 32 20.5 C 28 21.8, 12 21.8, 8 20.5 Z" fill="#FFFFFF" />
      <path d="M5 34 C 13 29, 27 29, 35 34 Z" fill="#FFFFFF" />
    </svg>
  );
}

export function Logo({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5", className)} aria-label={`${brand.name} home`}>
      <LogoMark />
      <span className={cn("hidden font-display text-[1.05rem] font-extrabold leading-none tracking-[-0.045em] sm:inline", tone === "dark" ? "text-forest" : "text-white")}>
        {brand.name}
      </span>
    </Link>
  );
}
