import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Private object storage for sensitive provider documents. Files are never publicly addressable;
 * downloads go through short-lived signed links minted only after an authorization check.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const SIGNATURES: { type: string; ext: string; magic: number[] }[] = [
  { type: "application/pdf", ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  { type: "image/jpeg", ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  { type: "image/png", ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
];

/** Validates by content (magic bytes), not by the client-supplied MIME type or extension. */
export function sniffDocumentType(bytes: Uint8Array): { type: string; ext: string } | null {
  const match = SIGNATURES.find((s) => s.magic.every((b, i) => bytes[i] === b));
  if (match) return { type: match.type, ext: match.ext };
  // WEBP: "RIFF....WEBP"
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { type: "image/webp", ext: "webp" };
  }
  return null;
}

export interface StorageAdapter {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  /** Returns a URL valid for `ttlSeconds`. */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
}

function signingSecret(): string {
  const s = process.env.FILE_SIGNING_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("FILE_SIGNING_SECRET is required in production");
  return "dev-only-file-signing-secret";
}

export function signFileToken(key: string, expires: number): string {
  return createHmac("sha256", signingSecret()).update(`${key}:${expires}`).digest("hex");
}

export function verifyFileToken(key: string, expires: number, sig: string): boolean {
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const expected = signFileToken(key, expires);
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

const localAdapter = (root: string): StorageAdapter => {
  const resolve = (key: string) => {
    if (!/^[\w/-]+\.\w+$/.test(key) || key.includes("..")) throw new Error("Invalid storage key");
    return path.join(root, key);
  };
  return {
    async put(key, bytes) {
      const file = resolve(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes, { mode: 0o600 });
    },
    async get(key) {
      return readFile(resolve(key));
    },
    async signedUrl(key, ttl) {
      const exp = Math.floor(Date.now() / 1000) + ttl;
      return `/api/files/${key}?exp=${exp}&sig=${signFileToken(key, exp)}`;
    },
  };
};

/** Supabase Storage (private bucket). Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DOCUMENTS_BUCKET. */
const supabaseAdapter = (url: string, serviceKey: string, bucket: string): StorageAdapter => ({
  async put(key, bytes, contentType) {
    const res = await fetch(`${url}/storage/v1/object/${bucket}/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": contentType, "x-upsert": "false" },
      body: Buffer.from(bytes),
    });
    if (!res.ok) throw new Error(`Storage upload failed (${res.status})`);
  },
  async get(key) {
    const res = await fetch(`${url}/storage/v1/object/${bucket}/${key}`, { headers: { Authorization: `Bearer ${serviceKey}` } });
    if (!res.ok) throw new Error(`Storage download failed (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  },
  async signedUrl(key, ttl) {
    const res = await fetch(`${url}/storage/v1/object/sign/${bucket}/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: ttl }),
    });
    if (!res.ok) throw new Error(`Storage signing failed (${res.status})`);
    const body = (await res.json()) as { signedURL: string };
    return `${url}/storage/v1${body.signedURL}`;
  },
});

export function getStorage(): StorageAdapter {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DOCUMENTS_BUCKET } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_DOCUMENTS_BUCKET) {
    return supabaseAdapter(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DOCUMENTS_BUCKET);
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_STORAGE !== "true") {
    throw new Error("Configure Supabase Storage for documents in production");
  }
  return localAdapter(process.env.LOCAL_STORAGE_DIR ?? path.join(process.cwd(), ".data", "uploads"));
}

export function newDocumentKey(providerId: string, ext: string): string {
  return `providers/${providerId}/${randomUUID()}.${ext}`;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
