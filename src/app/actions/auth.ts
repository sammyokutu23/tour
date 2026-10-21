"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db";
import {
  authenticate,
  createSession,
  registerUser,
  requestPasswordReset,
  resetPassword,
  revokeSession,
} from "@/server/services/accounts";
import { clearSessionCookie, readSessionToken, requestMeta, safeNext, setSessionCookie } from "@/server/auth/session";
import { appUrl } from "@/config/brand";
import { runAction, str } from "./run";
import type { ActionState } from "./types";

const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "That password is too long")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Include at least one letter and one number");

const registerSchema = z.object({
  displayName: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(320),
  password: passwordSchema,
  accountType: z.enum(["traveller", "guide", "operator"]),
  terms: z.literal(true, { message: "You must accept the terms and privacy policy" }),
});

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let next = "/dashboard";
  const result = await runAction(async () => {
    const input = registerSchema.parse({
      displayName: str(fd, "displayName"),
      email: str(fd, "email"),
      password: String(fd.get("password") ?? ""),
      accountType: str(fd, "accountType") || "traveller",
      terms: fd.get("terms") === "on",
    });
    const db = await getDb();
    const { userId } = await db.transaction((tx) => registerUser(tx, input));
    const meta = await requestMeta();
    const { token, expiresAt } = await createSession(db, userId, meta);
    await setSessionCookie(token, expiresAt);
    next = input.accountType === "traveller" ? safeNext(str(fd, "next")) : "/provider/profile";
  });
  if (result?.error) return result;
  redirect(next);
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let next = "/dashboard";
  const result = await runAction(async () => {
    const email = str(fd, "email");
    const password = String(fd.get("password") ?? "");
    if (!email || !password) return { error: "Enter your email and password." };
    const db = await getDb();
    const meta = await requestMeta();
    const auth = await authenticate(db, email, password, meta.ip);
    if (!auth) return { error: "That email and password combination didn't work." };
    const { token, expiresAt } = await createSession(db, auth.userId, meta);
    await setSessionCookie(token, expiresAt);
    next = safeNext(str(fd, "next"));
  });
  if (result?.error) return result;
  redirect(next);
}

export async function logoutAction() {
  const token = await readSessionToken();
  if (token) await revokeSession(await getDb(), token);
  await clearSessionCookie();
  redirect("/");
}

export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const email = z.string().trim().email("Enter a valid email address").parse(str(fd, "email"));
    await requestPasswordReset(await getDb(), email, appUrl());
    return { ok: "If an account exists for that email, we've sent a link to reset the password. It expires in 30 minutes." };
  });
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const password = passwordSchema.parse(String(fd.get("password") ?? ""));
    if (password !== String(fd.get("confirm") ?? "")) return { error: "The passwords don't match." };
    const ok = await resetPassword(await getDb(), str(fd, "token"), password);
    if (!ok) return { error: "This reset link is invalid or has expired. Request a new one." };
  });
  if (result?.error || result?.fieldErrors) return result;
  redirect("/login?reset=1");
}
