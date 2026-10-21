import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/layout/auth-shell";
import { LoginForm } from "@/components/forms/auth-forms";
import { Alert, Skeleton } from "@/components/ui";
import { safeNext } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function LoginPage({ searchParams }: { searchParams: SP }) {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage your trips, bookings and messages." footer={<>New here? <Link href="/register" className="font-semibold text-forest underline">Create an account</Link></>}>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function Form({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  return (
    <div className="space-y-4">
      {sp.reset && <Alert tone="success">Your password was changed. Please sign in with the new password.</Alert>}
      <LoginForm next={next} />
    </div>
  );
}
