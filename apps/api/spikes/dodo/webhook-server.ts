import express from "express";
import { mkdirSync, writeFileSync } from "node:fs";
import { dodo } from "./client.js";

const app = express();
mkdirSync("spikes/dodo/out", { recursive: true });

app.post("/webhooks/dodo", express.raw({ type: "application/json" }), async (req, res) => {
    const headers = {
        "webhook-id": req.header("webhook-id") ?? "",
        "webhook-signature": req.header("webhook-signature") ?? "",
        "webhook-timestamp": req.header("webhook-timestamp") ?? "",
    };

    try {
        const event = await dodo.webhooks.unwrap(req.body.toString(), { headers });
        const file = `spikes/dodo/out/${Date.now()}-${event.type}.json`;
        writeFileSync(file, JSON.stringify({ headers, event }, null, 2));
        console.log(event.type, headers["webhook-id"], "→", file);
        res.sendStatus(200);
    } catch (err) {
        console.error("Signature check failed:", err);
        res.sendStatus(401);
    }
});

app.listen(4100, () => console.log("Webhook receiver on http://localhost:4100"));
