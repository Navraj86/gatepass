import { config } from "../config.js";
import { logger } from "../observability/logger.js";

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentId?: string }[];
};

export interface EmailSender {
  send(email: Email): Promise<void>;
}

/** Transactional email through Resend's HTTP API, from a subdomain with SPF and DKIM set. */
function resendSender(apiKey: string): EmailSender {
  return {
    async send(email) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: config.EMAIL_FROM,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          attachments: email.attachments?.map((a) => ({
            filename: a.filename,
            content: a.content.toString("base64"),
            content_id: a.contentId,
          })),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Resend answered ${response.status}: ${await response.text()}`);
      }
    },
  };
}

/** Without an API key (local runs, load tests) emails are only logged. */
const logSender: EmailSender = {
  async send(email) {
    logger.info({ subject: email.subject, attachments: email.attachments?.length ?? 0 }, "Email not sent (no provider)");
  },
};

// Reserved domains never receive mail; demo accounts use them.
const undeliverable = /@(.+\.)?(test|invalid|example|localhost)$|@example\.(com|org|net)$/i;

let current: EmailSender | undefined;

export function emailSender(): EmailSender {
  current ??= config.RESEND_API_KEY && !config.LOAD_TEST ? resendSender(config.RESEND_API_KEY) : logSender;
  return current;
}

export function setEmailSender(sender: EmailSender) {
  current = sender;
}

export function isDeliverable(address: string) {
  return !undeliverable.test(address);
}
