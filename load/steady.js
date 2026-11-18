// Constant light load for the rolling-deploy test: run it, start infra/deploy.sh on the
// server, and the threshold fails the run if a single request gets a 5xx or a network error.
//
//   k6 run -e BASE_URL=https://gatepass.navraj.dev -e RUN_FILE=./run.json -e DURATION=3m load/steady.js
import http from "k6/http";
import { Counter } from "k6/metrics";
import { BASE_URL, EVENT_ID } from "./lib.js";

const serverErrors = new Counter("server_errors");

export const options = {
  scenarios: {
    steady: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.RATE || 50),
      timeUnit: "1s",
      duration: __ENV.DURATION || "2m",
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    server_errors: ["count==0"],
    http_req_failed: ["rate==0"],
  },
};

// PAGES=false when BASE_URL is a bare API instance with no Next.js behind it.
const paths = ["/api/events", `/api/events/${EVENT_ID}`, `/api/events/${EVENT_ID}/seats`];
if (__ENV.PAGES !== "false") paths.push("/", `/events/${EVENT_ID}`);

export default function () {
  const path = paths[Math.floor(Math.random() * paths.length)];
  const res = http.get(`${BASE_URL}${path}`, { tags: { name: path.startsWith("/api") ? path.split("/")[2] : "page" } });
  if (res.status === 0 || res.status >= 500) {
    serverErrors.add(1, { status: String(res.status) });
    console.warn(`${res.status} ${path} at ${new Date().toISOString()}`);
  }
}
