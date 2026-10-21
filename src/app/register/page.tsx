import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/layout/auth-shell";
import { RegisterForm } from "@/components/forms/auth-forms";
import { Skeleton } from "@/components/ui";
import { safeNext } from "@/server/auth/session";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function RegisterPage({ searchParams }: { searchParams: SP }) {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Save trips, book guides and keep everything in one place. Guides and operators complete a short verification after signing up."
      footer={<>Already have an account? <Link href="/login" className="font-semibold text-forest underline">Sign in</Link></>}
    >
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function Form({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const type = sp.type === "guide" || sp.type === "operator" ? sp.type : "traveller";
  return <RegisterForm next={safeNext(typeof sp.next === "string" ? sp.next : null)} accountType={type} />;
}
