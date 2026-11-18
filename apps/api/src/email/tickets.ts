import { formatMoney, formatTicketCode } from "@gatepass/shared";
import QRCode from "qrcode";
import { config } from "../config.js";
import { pool } from "../db/client.js";
import { logger } from "../observability/logger.js";
import { emailsSent } from "../observability/metrics.js";
import { emailSender, isDeliverable, type Email } from "./sender.js";

type OrderForEmail = {
  id: string;
  email: string;
  name: string;
  eventTitle: string;
  venue: string;
  startsAt: Date;
  amountMinor: number;
  currency: string;
};

type TicketForEmail = { code: string; sectionName: string; rowLabel: string; seatNumber: number };

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function loadOrder(orderId: string): Promise<OrderForEmail | undefined> {
  const { rows } = await pool.query<OrderForEmail>(
    `select o.id, u.email, u.name, e.title as "eventTitle", e.venue, e.starts_at as "startsAt",
            o.amount_minor as "amountMinor", o.currency
     from orders o join "user" u on u.id = o.user_id join events e on e.id = o.event_id
     where o.id = $1`,
    [orderId],
  );
  return rows[0];
}

async function deliver(kind: string, orderId: string, email: Email) {
  if (!isDeliverable(email.to)) {
    emailsSent.inc({ result: "skipped" });
    return;
  }
  try {
    await emailSender().send(email);
    emailsSent.inc({ result: "sent" });
  } catch (err) {
    // The order page offers "resend", so a failed email never fails the purchase.
    emailsSent.inc({ result: "failed" });
    logger.error({ err, orderId, kind }, "Email failed");
  }
}

export async function sendTicketEmail(orderId: string) {
  const order = await loadOrder(orderId);
  if (!order) return;
  const { rows: tickets } = await pool.query<TicketForEmail>(
    `select t.code, sec.name as "sectionName", s.row_label as "rowLabel", s.seat_number as "seatNumber"
     from tickets t join seats s on s.id = t.seat_id join sections sec on sec.id = s.section_id
     where t.order_id = $1 and t.status = 'valid'
     order by sec.name, s.row_label, s.seat_number`,
    [orderId],
  );
  if (tickets.length === 0) return;

  const orderUrl = `${config.APP_URL}/orders/${order.id}`;
  const when = order.startsAt.toUTCString().replace(":00 GMT", " UTC");
  const qr = await Promise.all(
    tickets.map((t) => QRCode.toBuffer(t.code, { type: "png", width: 320, margin: 1, errorCorrectionLevel: "M" })),
  );

  const rows = tickets
    .map(
      (t, i) => `
      <tr>
        <td style="padding:12px 0;border-top:1px solid #e5e5e5">
          <img src="cid:ticket-${i}" width="160" height="160" alt="QR code" style="display:block" />
        </td>
        <td style="padding:12px 16px;border-top:1px solid #e5e5e5;font-family:sans-serif">
          <strong>${escape(t.sectionName)}, row ${escape(t.rowLabel)}, seat ${t.seatNumber}</strong><br />
          <code style="font-size:13px">${formatTicketCode(t.code)}</code>
        </td>
      </tr>`,
    )
    .join("");

  await deliver("tickets", orderId, {
    to: order.email,
    subject: `Your tickets for ${order.eventTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;color:#111">
        <h1 style="font-size:22px">You're going to ${escape(order.eventTitle)}</h1>
        <p>${escape(order.venue)} &middot; ${when}</p>
        <p>Show each QR code at the door. Every code works once.</p>
        <table style="border-collapse:collapse;width:100%">${rows}</table>
        <p>Total paid: ${formatMoney(order.amountMinor, order.currency)} plus applicable taxes.</p>
        <p><a href="${orderUrl}">View your order</a></p>
      </div>`,
    text: [
      `Your tickets for ${order.eventTitle}`,
      `${order.venue}, ${when}`,
      "",
      ...tickets.map((t) => `${t.sectionName}, row ${t.rowLabel}, seat ${t.seatNumber}: ${formatTicketCode(t.code)}`),
      "",
      `View your order: ${orderUrl}`,
    ].join("\n"),
    attachments: qr.map((content, i) => ({ filename: `ticket-${i + 1}.png`, content, contentId: `ticket-${i}` })),
  });
}

/** Sent when a payment arrived after its seat was taken: the money goes back automatically. */
export async function sendSeatLostEmail(orderId: string) {
  const order = await loadOrder(orderId);
  if (!order) return;
  const eventUrl = `${config.APP_URL}/events`;
  await deliver("seat_lost", orderId, {
    to: order.email,
    subject: `Your payment for ${order.eventTitle} is being refunded`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;color:#111">
        <h1 style="font-size:22px">Sorry, your seats were released</h1>
        <p>Your payment arrived after the hold on your seats ran out and someone else bought them.
        We have started a full refund to your original payment method.</p>
        <p><a href="${eventUrl}">Find other seats</a></p>
      </div>`,
    text: `Your payment for ${order.eventTitle} arrived after your seats were released. A full refund has started.`,
  });
}
