import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "../db";
import { resolveSession, type SessionUser } from "../services/accounts";
import type { Actor, Role } from "@/domain/authz";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-btd_session" : "btd_session";

/** Reads and validates the session for this request (deduplicated per request). */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  // Session validation hits the database, so it must only run at request time (never in a prerender).
  await connection();
  const db = await getDb();
  return resolveSession(db, token);
});

export async function getActor(): Promise<Actor | null> {
  return (await getSession())?.actor ?? null;
}

/** Redirects to sign-in when there is no session. Use at the top of protected server components. */
export async function requireSession(next: string): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
  return s;
}

export async function requireRole(next: string, roles: Role[]): Promise<SessionUser> {
  const s = await requireSession(next);
  if (!roles.some((r) => s.actor.roles.includes(r))) redirect("/dashboard?denied=1");
  return s;
}

export async function setSessionCookie(token: string, expires: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown",
    userAgent: h.get("user-agent") ?? undefined,
  };
}

/** Database handle for request-time rendering (marks the subtree dynamic before touching the DB). */
export async function requestDb() {
  await connection();
  return getDb();
}

/** Only allows same-site relative redirects after sign-in. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** For provider pages: requires a guide/operator account with a provider profile. */
export async function requireProviderSession(next: string): Promise<SessionUser & { actor: Actor & { providerId: string } }> {
  const s = await requireRole(next, ["guide", "operator"]);
  if (!s.actor.providerId) redirect("/provider/profile");
  return s as SessionUser & { actor: Actor & { providerId: string } };
}
