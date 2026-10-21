import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/layout/auth-shell";
import { ResetPasswordForm } from "@/components/forms/auth-forms";
import { Alert, Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false }, referrer: "no-referrer" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function ResetPasswordPage({ searchParams }: { searchParams: SP }) {
  return (
    <AuthShell title="Choose a new password" subtitle="For your security, this will sign you out on all devices." footer={<Link href="/forgot-password" className="font-semibold text-forest underline">Request a new link</Link>}>
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function Form({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  if (!token) return <Alert tone="error">This reset link is incomplete. Please request a new one.</Alert>;
  return <ResetPasswordForm token={token} />;
}
