import { z } from "zod";
import type { Queryable } from "../db/client";

/** Platform settings with safe defaults. Values are stored in platform_settings and edited by admins. */
export const settingsSchema = z.object({
  currency: z.literal("KES"),
  serviceFeeBps: z.number().int().min(0).max(2000),
  taxBps: z.number().int().min(0).max(3000),
  defaultCommissionBps: z.number().int().min(0).max(5000),
  quoteValidityMinutes: z.number().int().min(5).max(24 * 60),
  acceptanceHoldHours: z.number().int().min(1).max(7 * 24),
  paymentWindowHours: z.number().int().min(1).max(72),
});
export type PlatformSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: PlatformSettings = {
  currency: "KES",
  serviceFeeBps: 500, // 5% traveller service fee (business hypothesis)
  taxBps: 0, // Tax treatment must be confirmed with a Kenyan tax adviser before launch.
  defaultCommissionBps: 1200, // 12% commission (within the 10–15% hypothesis)
  quoteValidityMinutes: 60,
  acceptanceHoldHours: 48,
  paymentWindowHours: 24,
};

export const SETTING_LABELS: Record<keyof PlatformSettings, string> = {
  currency: "Marketplace currency",
  serviceFeeBps: "Traveller service fee (basis points)",
  taxBps: "Tax on bookings (basis points)",
  defaultCommissionBps: "Default provider commission (basis points)",
  quoteValidityMinutes: "Quote validity (minutes)",
  acceptanceHoldHours: "Provider response window (hours)",
  paymentWindowHours: "Payment window after acceptance (hours)",
};

export async function getSettings(db: Queryable): Promise<PlatformSettings> {
  const { rows } = await db.query<{ key: string; value: unknown }>("select key, value from platform_settings");
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) merged[r.key] = r.value;
  return settingsSchema.parse(merged);
}

export async function setSetting(db: Queryable, key: keyof PlatformSettings, value: unknown, userId: string) {
  const parsed = settingsSchema.shape[key].parse(value);
  await db.query(
    `insert into platform_settings (key, value, updated_by, updated_at) values ($1, $2, $3, now())
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [key, JSON.stringify(parsed), userId],
  );
}
