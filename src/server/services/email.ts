import type { Queryable } from "../db/client";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Sensitive bodies (e.g. reset links) are never persisted by production adapters. */
  sensitive?: boolean;
}

export interface EmailAdapter {
  readonly id: string;
  send(msg: EmailMessage): Promise<{ providerMessageId: string | null }>;
}

/** Development adapter: nothing leaves the machine. Messages appear in the local dev mailbox. */
const devAdapter: EmailAdapter = {
  id: "dev",
  async send() {
    return { providerMessageId: null };
  },
};

/** Resend (https://resend.com/docs/api-reference/emails/send-email). */
function resendAdapter(apiKey: string, from: string): EmailAdapter {
  return {
    id: "resend",
    async send(msg) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text }),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);
      const body = (await res.json()) as { id?: string };
      return { providerMessageId: body.id ?? null };
    },
  };
}

export function getEmailAdapter(): EmailAdapter {
  const provider = process.env.EMAIL_PROVIDER ?? "dev";
  if (provider === "resend") {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) throw new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY and EMAIL_FROM");
    return resendAdapter(key, from);
  }
  if (provider !== "dev") throw new Error(`Unknown EMAIL_PROVIDER ${provider}`);
  return devAdapter;
}

/** Sends an email and records it. Throws if the provider fails so callers can retry. */
export async function sendEmail(db: Queryable, msg: EmailMessage, adapter = getEmailAdapter()) {
  const { providerMessageId } = await adapter.send(msg);
  const storeBody = adapter.id === "dev" || !msg.sensitive;
  await db.query(
    "insert into email_messages (to_address, subject, text_body, provider, provider_message_id) values ($1, $2, $3, $4, $5)",
    [msg.to, msg.subject, storeBody ? msg.text : null, adapter.id, providerMessageId],
  );
  return { providerMessageId };
}
