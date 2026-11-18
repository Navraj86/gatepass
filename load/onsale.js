// On-sale spike: about 5,000 buyers arrive over 30 seconds, each tries to hold 1 to 4
// random seats and retries on 409 with other seats. With PURCHASE=true, buyers who win
// a hold also create an order and k6 sends the signed payment.succeeded webhook itself.
//
//   k6 run -e BASE_URL=https://gatepass.navraj.dev -e RUN_FILE=./run.json load/onsale.js
//   k6 run -e PURCHASE=true -e DODO_PAYMENTS_WEBHOOK_KEY=whsec_... load/onsale.js

import { sleep } from "k6";
import exec from "k6/execution";
import http from "k6/http";
import { Counter, Trend } from "k6/metrics";
import { authHeaders, BASE_URL, EVENT_ID, paymentSucceeded, pick, signedWebhook, users } from "./lib.js";

const PURCHASE = __ENV.PURCHASE === "true";
const BUYERS = Number(__ENV.BUYERS || 5000);
const RAMP = __ENV.RAMP || "30s";
const MAX_ATTEMPTS = 5;

const holdLatency = new Trend("hold_latency", true);
const holdsWon = new Counter("holds_won");
const holdConflicts = new Counter("hold_conflicts");
const buyersGaveUp = new Counter("buyers_gave_up");
const seatsHeld = new Counter("seats_held");
const ordersPaid = new Counter("orders_paid");
const fulfillment = new Trend("fulfillment_latency", true);
const unexpected = new Counter("unexpected_responses");

// Arrivals ramp linearly from 0 to peak, so total buyers = peak x ramp seconds / 2.
const rampSeconds = Number.parseInt(RAMP, 10);
const peak = Math.ceil((2 * BUYERS) / rampSeconds);

export const options = {
  scenarios: {
    onsale: {
      executor: "ramping-arrival-rate",
      startRate: 0,
      timeUnit: "1s",
      preAllocatedVUs: 500,
      maxVUs: 4000,
      stages: [{ target: peak, duration: RAMP }],
    },
  },
  thresholds: {
    unexpected_responses: ["count==0"],
    hold_latency: ["p(95)<500"],
  },
  summaryTrendStats: ["avg", "p(50)", "p(95)", "p(99)", "max"],
};

/** One seat-map snapshot for the whole run; buyers pick from it like a stale browser would. */
export function setup() {
  const res = http.get(`${BASE_URL}/api/events/${EVENT_ID}/seats`);
  if (res.status !== 200) throw new Error(`seat map: ${res.status}`);
  return { seatIds: res.json("seats").map((s) => s.id) };
}

export default function (data) {
  const user = users[exec.scenario.iterationInTest % users.length];
  const headers = authHeaders(user);
  const want = 1 + Math.floor(Math.random() * 4);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const seatIds = pick(data.seatIds, want);
    const res = http.post(`${BASE_URL}/api/events/${EVENT_ID}/holds`, JSON.stringify({ seatIds }), {
      headers,
      tags: { name: "hold" },
      // 409 (taken) and 422 (cap) are expected answers, not failures.
      responseCallback: http.expectedStatuses(200, 201, 409, 422, 429),
    });
    holdLatency.add(res.timings.duration);
    if (res.status === 200 || res.status === 201) {
      holdsWon.add(1);
      seatsHeld.add(seatIds.length);
      if (PURCHASE) buy(user, headers);
      return;
    }
    if (res.status === 409) {
      holdConflicts.add(1);
      sleep(0.2 + Math.random() * 0.5);
      continue;
    }
    if (res.status >= 500 || res.status === 0) markUnexpected(res);
    return;
  }
  buyersGaveUp.add(1);
}

function buy(user, headers) {
  const started = Date.now();
  const created = http.post(
    `${BASE_URL}/api/orders`,
    JSON.stringify({ eventId: EVENT_ID, email: user.email, name: "Load Buyer", country: "US", zipcode: "94107" }),
    { headers, tags: { name: "order" } },
  );
  if (created.status !== 201) return markUnexpected(created);
  const orderId = created.json("orderId");

  const order = http.get(`${BASE_URL}/api/orders/${orderId}`, { headers, tags: { name: "order_get" } }).json("order");
  const body = paymentSucceeded(order);
  const hook = http.post(`${BASE_URL}/api/webhooks/dodo`, body, {
    headers: signedWebhook(body),
    tags: { name: "webhook" },
  });
  if (hook.status !== 200) return markUnexpected(hook);

  for (let i = 0; i < 20; i++) {
    const status = http
      .get(`${BASE_URL}/api/orders/${orderId}`, { headers, tags: { name: "order_poll" } })
      .json("order.status");
    if (status === "paid") {
      ordersPaid.add(1);
      fulfillment.add(Date.now() - started);
      return;
    }
    if (status !== "pending") return;
    sleep(0.25);
  }
}

function markUnexpected(res) {
  unexpected.add(1, { status: String(res.status) });
  console.warn(`unexpected ${res.status} ${res.request.method} ${res.url}`);
}
