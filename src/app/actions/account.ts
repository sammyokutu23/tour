"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db";
import { getActor, readSessionToken } from "@/server/auth/session";
import { travellerProfileSchema, updateTravellerProfile } from "@/server/services/community";
import { changePassword } from "@/server/services/accounts";
import { bool, list, optStr, runAction, str } from "./run";
import type { ActionState } from "./types";

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/dashboard/settings");
  return runAction(async () => {
    await updateTravellerProfile(
      await getDb(),
      actor,
      travellerProfileSchema.parse({
        displayName: str(fd, "displayName"),
        phone: optStr(fd, "phone"),
        homeCountry: optStr(fd, "homeCountry"),
        languages: list(fd, "languages"),
        dietaryRequirements: optStr(fd, "dietaryRequirements"),
        accessibilityRequirements: optStr(fd, "accessibilityRequirements"),
        notifyEmail: bool(fd, "notifyEmail"),
        marketingConsent: bool(fd, "marketingConsent"),
        analyticsConsent: bool(fd, "analyticsConsent"),
      }),
    );
    refresh();
    return { ok: "Settings saved." };
  });
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/dashboard/settings");
  return runAction(async () => {
    const next = z
      .string()
      .min(10, "Use at least 10 characters")
      .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Include a letter and a number")
      .parse(String(fd.get("newPassword") ?? ""));
    const ok = await changePassword(await getDb(), actor.userId, String(fd.get("currentPassword") ?? ""), next, await readSessionToken());
    if (!ok) return { error: "Your current password is incorrect." };
    return { ok: "Password changed. Other devices have been signed out." };
  });
}
