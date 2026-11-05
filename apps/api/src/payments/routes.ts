import express, { Router } from "express";
import { Webhook } from "standardwebhooks";
import { requireEnv } from "../config.js";
import { processWebhook, webhookEvent } from "./webhook.js";

const verifier = new Webhook(requireEnv("DODO_PAYMENTS_WEBHOOK_KEY"));

export const webhookRouter = Router();

webhookRouter.post("/webhooks/dodo", express.raw({ type: "application/json" }), async (req, res) => {
  const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

  let payload: unknown;
  try {
    payload = verifier.verify(body, {
      "webhook-id": req.header("webhook-id") ?? "",
      "webhook-timestamp": req.header("webhook-timestamp") ?? "",
      "webhook-signature": req.header("webhook-signature") ?? "",
    });
  } catch {
    res.status(401).json({ code: "invalid_signature", message: "Invalid webhook signature" });
    return;
  }

  const parsed = webhookEvent.safeParse(payload);
  if (!parsed.success) {
    res.sendStatus(200);
    return;
  }

  await processWebhook(parsed.data);
  res.sendStatus(200);
});