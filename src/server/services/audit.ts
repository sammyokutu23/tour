import type { Queryable } from "../db/client";

export interface AuditEntry {
  actorId: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  details?: Record<string, unknown>;
}

const REDACT = /password|token|secret|card|pin|passkey/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, REDACT.test(k) ? "[redacted]" : redact(v)]),
    );
  }
  return value;
}

/** Appends to the immutable audit log. Call inside the same transaction as the change it records. */
export async function audit(db: Queryable, entry: AuditEntry): Promise<void> {
  await db.query(
    `insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, reason, details)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.actorId,
      entry.actorRole,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.reason ?? null,
      JSON.stringify(redact(entry.details ?? {})),
    ],
  );
}

export function primaryRole(roles: string[]): string {
  for (const r of ["admin", "support", "operator", "guide", "traveller"]) if (roles.includes(r)) return r;
  return "system";
}
