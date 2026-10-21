import { createHash, randomBytes } from "node:crypto";

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Tokens are stored hashed so a database leak does not yield usable sessions or reset links. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function referenceCode(prefix: string, length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}-${out}`;
}
