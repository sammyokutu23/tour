import type { ReactNode } from "react";
import { DestinationArt } from "@/components/art/destination-art";
import { brand } from "@/config/brand";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-[calc(100dvh-4rem)] lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-forest-950 lg:block">
        <DestinationArt variant="savanna" seed="auth" className="opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950/90 to-transparent" />
        <p className="absolute bottom-12 left-12 right-12 font-display text-3xl leading-snug text-sand">{brand.tagline}</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-bold text-forest">{title}</h1>
          {subtitle && <div className="mt-2 text-sm text-ink-muted">{subtitle}</div>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-ink-muted">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
