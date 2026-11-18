import express, { Router } from "express";
import { Webhook } from "standardwebhooks";
import { config } from "../config.js";
import { sendProblem } from "../http/problem.js";
import { webhookEvents } from "../observability/metrics.js";
import { processWebhook, webhookEvent } from "./webhook.js";

// Standard Webhooks: HMAC over id, timestamp and raw body, with a 5 minute timestamp tolerance.
const verifier = new Webhook(config.DODO_PAYMENTS_WEBHOOK_KEY);

export const webhookRouter = Router();

// Mounted before express.json(): the signature covers the exact raw bytes.
webhookRouter.post("/webhooks/dodo", express.raw({ type: "application/json" }), async (req, res) => {
  const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  const webhookId = req.header("webhook-id") ?? "";

  let payload: unknown;
  try {
    payload = verifier.verify(body, {
      "webhook-id": webhookId,
      "webhook-timestamp": req.header("webhook-timestamp") ?? "",
      "webhook-signature": req.header("webhook-signature") ?? "",
    });
  } catch {
    webhookEvents.inc({ type: "unknown", result: "invalid_signature" });
    sendProblem(res, 401, "invalid_signature", "Invalid webhook signature");
    return;
  }

  const parsed = webhookEvent.safeParse(payload);
  if (!parsed.success) {
    // Event types we do not handle are acknowledged so Dodo stops retrying them.
    webhookEvents.inc({ type: "other", result: "ignored" });
    res.sendStatus(200);
    return;
  }

  const outcome = await processWebhook(parsed.data);
  webhookEvents.inc({ type: parsed.data.type, result: outcome });
  req.log.info({ webhookId, type: parsed.data.type, outcome }, "Webhook processed");
  res.sendStatus(200);
});
