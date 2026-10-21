import type { Queryable } from "../db/client";
import type { Actor, Role } from "@/domain/authz";
import { getDummyHash, hashPassword, verifyPassword } from "../auth/password";
import { hashToken, newToken } from "../auth/tokens";
import { sendEmail } from "./email";
import { audit } from "./audit";

export const SESSION_TTL_DAYS = 30;
const LOGIN_WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 25;
const RESET_TTL_MINUTES = 30;
const MAX_RESETS_PER_HOUR = 3;

export class RateLimitedError extends Error {
  readonly status = 429;
  constructor() {
    super("Too many attempts. Please wait a few minutes and try again.");
  }
}

export class EmailTakenError extends Error {
  constructor() {
    super("An account with this email already exists.");
  }
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  accountType: "traveller" | "guide" | "operator";
}

export async function registerUser(db: Queryable, input: RegisterInput): Promise<{ userId: string }> {
  const passwordHash = await hashPassword(input.password);
  const existing = await db.query("select 1 from users where lower(email) = lower($1)", [input.email]);
  if (existing.rows.length) throw new EmailTakenError();
  try {
    const { rows } = await db.query<{ id: string }>(
      "insert into users (email, password_hash, display_name) values ($1, $2, $3) returning id",
      [input.email.trim(), passwordHash, input.displayName.trim()],
    );
    const userId = rows[0].id;
    // Every account can travel; provider roles are granted at signup and gated by provider approval.
    await db.query("insert into user_roles (user_id, role) values ($1, 'traveller')", [userId]);
    await db.query("insert into traveller_profiles (user_id) values ($1)", [userId]);
    if (input.accountType !== "traveller") {
      await db.query("insert into user_roles (user_id, role) values ($1, $2)", [userId, input.accountType]);
    }
    return { userId };
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new EmailTakenError();
    throw err;
  }
}

async function recentFailures(db: Queryable, key: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from auth_attempts
     where key = $1 and success = false and created_at > now() - make_interval(mins => $2)`,
    [key, LOGIN_WINDOW_MINUTES],
  );
  return rows[0].n;
}

/** Verifies credentials with per-email and per-IP throttling. Returns null for bad credentials. */
export async function authenticate(
  db: Queryable,
  email: string,
  password: string,
  ip: string,
): Promise<{ userId: string } | null> {
  const emailKey = `login:email:${email.trim().toLowerCase()}`;
  const ipKey = `login:ip:${ip}`;
  if ((await recentFailures(db, emailKey)) >= MAX_FAILURES_PER_EMAIL || (await recentFailures(db, ipKey)) >= MAX_FAILURES_PER_IP) {
    throw new RateLimitedError();
  }

  const { rows } = await db.query<{ id: string; password_hash: string; status: string }>(
    "select id, password_hash, status from users where lower(email) = lower($1)",
    [email.trim()],
  );
  const user = rows[0];
  const ok = await verifyPassword(password, user?.password_hash ?? (await getDummyHash()));
  const success = !!user && ok && user.status === "active";

  await db.query("insert into auth_attempts (key, success) values ($1, $2), ($3, $2)", [emailKey, success, ipKey]);
  return success ? { userId: user.id } : null;
}

export async function createSession(
  db: Queryable,
  userId: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db.query(
    "insert into sessions (user_id, token_hash, expires_at, ip, user_agent) values ($1, $2, $3, $4, $5)",
    [userId, hashToken(token), expiresAt, meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null],
  );
  return { token, expiresAt };
}

export interface SessionUser {
  actor: Actor;
  email: string;
  displayName: string;
  providerStatus: string | null;
  providerKind: "guide" | "operator" | null;
}

export async function resolveSession(db: Queryable, token: string): Promise<SessionUser | null> {
  const { rows } = await db.query<{
    user_id: string;
    email: string;
    display_name: string;
    roles: Role[];
    provider_id: string | null;
    provider_status: string | null;
    provider_kind: "guide" | "operator" | null;
  }>(
    `select u.id as user_id, u.email, u.display_name,
            coalesce(array(select role from user_roles r where r.user_id = u.id), '{}') as roles,
            p.id as provider_id, p.status as provider_status, p.kind as provider_kind
       from sessions s
       join users u on u.id = s.user_id
       left join provider_profiles p on p.user_id = u.id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.status = 'active'`,
    [hashToken(token)],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    actor: { userId: r.user_id, roles: r.roles, providerId: r.provider_id },
    email: r.email,
    displayName: r.display_name,
    providerStatus: r.provider_status,
    providerKind: r.provider_kind,
  };
}

export async function revokeSession(db: Queryable, token: string): Promise<void> {
  await db.query("update sessions set revoked_at = now() where token_hash = $1 and revoked_at is null", [hashToken(token)]);
}

export async function revokeAllSessions(db: Queryable, userId: string): Promise<void> {
  await db.query("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [userId]);
}

/**
 * Always behaves the same whether or not the email exists, so it cannot be used to enumerate
 * accounts. Throttled per email address.
 */
export async function requestPasswordReset(db: Queryable, email: string, baseUrl: string): Promise<void> {
  const key = `reset:${email.trim().toLowerCase()}`;
  const { rows: recent } = await db.query<{ n: number }>(
    "select count(*)::int as n from auth_attempts where key = $1 and created_at > now() - interval '1 hour'",
    [key],
  );
  await db.query("insert into auth_attempts (key, success) values ($1, true)", [key]);
  if (recent[0].n >= MAX_RESETS_PER_HOUR) return;

  const { rows } = await db.query<{ id: string; email: string }>(
    "select id, email from users where lower(email) = lower($1) and status = 'active'",
    [email.trim()],
  );
  const user = rows[0];
  if (!user) return;

  const token = newToken();
  await db.query(
    "insert into password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, now() + make_interval(mins => $3))",
    [user.id, hashToken(token), RESET_TTL_MINUTES],
  );
  const link = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail(db, {
    to: user.email,
    subject: "Reset your password",
    text: `We received a request to reset your password.\n\nUse this link within ${RESET_TTL_MINUTES} minutes:\n${link}\n\nIf you didn't request this, you can ignore this email.`,
    sensitive: true,
  });
}

export async function resetPassword(db: Queryable, token: string, newPassword: string): Promise<boolean> {
  const passwordHash = await hashPassword(newPassword);
  const { rows } = await db.query<{ user_id: string }>(
    `update password_reset_tokens set used_at = now()
      where token_hash = $1 and used_at is null and expires_at > now()
      returning user_id`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return false;
  await db.query("update users set password_hash = $1 where id = $2", [passwordHash, row.user_id]);
  await revokeAllSessions(db, row.user_id);
  await audit(db, { actorId: row.user_id, actorRole: "traveller", action: "user.password_reset", entityType: "user", entityId: row.user_id });
  return true;
}

/** Changes the password after re-verifying the current one; signs out every other session. */
export async function changePassword(db: Queryable, userId: string, current: string, next: string, keepSessionToken?: string): Promise<boolean> {
  const { rows } = await db.query<{ password_hash: string }>("select password_hash from users where id = $1", [userId]);
  if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) return false;
  await db.query("update users set password_hash = $2 where id = $1", [userId, await hashPassword(next)]);
  await db.query(
    "update sessions set revoked_at = now() where user_id = $1 and revoked_at is null and ($2::text is null or token_hash <> $2)",
    [userId, keepSessionToken ? hashToken(keepSessionToken) : null],
  );
  await audit(db, { actorId: userId, actorRole: "traveller", action: "user.password_changed", entityType: "user", entityId: userId });
  return true;
}
