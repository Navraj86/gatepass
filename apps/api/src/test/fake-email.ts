import type { Email, EmailSender } from "../email/sender.js";

export function createFakeEmail() {
  const sent: Email[] = [];
  const sender: EmailSender = {
    async send(email) {
      sent.push(email);
    },
  };
  return { sender, sent };
}
