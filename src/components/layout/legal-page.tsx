import type { ReactNode } from "react";
import { Alert, Container, PageHeader } from "@/components/ui";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Container className="max-w-3xl py-12">
      <PageHeader eyebrow="Legal" title={title} />
      <Alert tone="warning" className="mt-6" title="Draft for review">
        This document is a working draft written for product development. It has not been reviewed by a lawyer and must be finalised with qualified Kenyan legal counsel (including against the Data Protection Act, 2019, the Consumer Protection Act and tourism regulations) before launch.
      </Alert>
      <div className="prose-legal mt-8 space-y-6 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-forest [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </Container>
  );
}
