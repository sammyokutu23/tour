"use client";

import { useEffect } from "react";
import { Button, Container, LinkButton } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Container className="max-w-xl py-24 text-center">
      <h1 className="text-4xl text-forest">Something went wrong</h1>
      <p className="mt-4 text-ink-muted">An unexpected error occurred. Nothing was booked or charged as a result of this error.{error.digest && <span className="mt-2 block font-mono text-xs">Reference: {error.digest}</span>}</p>
      <div className="mt-8 flex justify-center gap-3"><Button onClick={reset}>Try again</Button><LinkButton href="/" variant="secondary">Go home</LinkButton></div>
    </Container>
  );
}
