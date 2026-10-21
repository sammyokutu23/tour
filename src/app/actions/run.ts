import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { toUserMessage } from "@/server/errors";
import type { ActionState } from "./types";

/**
 * Runs a server action body and converts thrown errors into safe, user-facing state.
 * Navigation signals (redirect/notFound) are re-thrown so Next.js can handle them.
 */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".") || "_";
        (fieldErrors[key] ??= []).push(issue.message);
      }
      return { error: "Please check the highlighted fields.", fieldErrors };
    }
    return { error: toUserMessage(err) };
  }
}

// ── FormData helpers ──
export const str = (fd: FormData, key: string): string => String(fd.get(key) ?? "").trim();
export const optStr = (fd: FormData, key: string): string | null => {
  const v = str(fd, key);
  return v ? v : null;
};
export const int = (fd: FormData, key: string, fallback = 0): number => {
  const v = str(fd, key);
  const n = Number(v);
  return v && Number.isFinite(n) ? Math.round(n) : fallback;
};
export const optInt = (fd: FormData, key: string): number | null => {
  const v = str(fd, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
export const optNum = (fd: FormData, key: string): number | null => {
  const v = str(fd, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/** Major currency units ("12,500") → minor units. */
export const moneyMinor = (fd: FormData, key: string): number | null => {
  const v = str(fd, key).replace(/[,\s]/g, "");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
export const list = (fd: FormData, key: string): string[] =>
  fd
    .getAll(key)
    .flatMap((v) => String(v).split(/[\n,]/))
    .map((v) => v.trim())
    .filter(Boolean);
export const lines = (fd: FormData, key: string): string[] =>
  str(fd, key)
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
export const bool = (fd: FormData, key: string): boolean => fd.get(key) === "on" || fd.get(key) === "true";
