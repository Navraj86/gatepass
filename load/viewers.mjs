// Live seat map viewers: opens many SSE streams to one event and counts what arrives.
// k6 has no SSE client, so this is plain Node (24+, no dependencies). Run it next to
// onsale.js so the viewers see real changes; update lag is measured on the server as
// sse_update_lag_seconds (commit to batch written), shown on the dashboard.
//
//   node load/viewers.mjs --viewers 2000 --seconds 120 --base https://gatepass.navraj.dev --run load/run.json
import { readFileSync } from "node:fs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const viewers = Number(arg("viewers", 1000));
const seconds = Number(arg("seconds", 60));
const base = arg("base", "http://localhost:4000").replace(/\/$/, "");
const eventId = arg("event", undefined) ?? JSON.parse(readFileSync(arg("run", "load/run.json"), "utf8")).eventId;
const url = `${base}/api/events/${eventId}/seats/stream`;

const stats = { connected: 0, open: 0, snapshots: 0, changeBatches: 0, seatChanges: 0, errors: 0, reconnects: 0 };
const connectMs = [];
const stop = new AbortController();

async function viewer() {
  let first = true;
  while (!stop.signal.aborted) {
    const started = performance.now();
    try {
      const res = await fetch(url, { headers: { Accept: "text/event-stream" }, signal: stop.signal });
      if (!res.ok) throw new Error(`status ${res.status}`);
      stats.connected++;
      stats.open++;
      if (!first) stats.reconnects++;
      first = false;
      let buffer = "";
      let gotSnapshot = false;
      const decoder = new TextDecoder();
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let end = buffer.indexOf("\n\n");
        while (end >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          end = buffer.indexOf("\n\n");
          const type = frame.match(/^event: (.+)$/m)?.[1];
          const data = frame.match(/^data: (.*)$/m)?.[1];
          if (type === "snapshot") {
            stats.snapshots++;
            if (!gotSnapshot) connectMs.push(performance.now() - started);
            gotSnapshot = true;
          } else if (type === "changes" && data) {
            stats.changeBatches++;
            stats.seatChanges += JSON.parse(data).length;
          }
        }
      }
      stats.open--;
    } catch (err) {
      if (stop.signal.aborted) return;
      stats.errors++;
      if (stats.errors <= 5) console.error(`viewer error: ${err.message}`);
    }
    // The stream ended (deploy or Redis reset): reconnect like EventSource would.
    if (!stop.signal.aborted) await new Promise((r) => setTimeout(r, 3000));
  }
}

const pct = (list, p) => {
  if (list.length === 0) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

console.log(`Opening ${viewers} streams to ${url} for ${seconds} s`);
// Ramp over about 10 seconds instead of opening every connection at once.
const workers = [];
for (let i = 0; i < viewers; i++) {
  workers.push(viewer());
  if (i % Math.max(1, Math.floor(viewers / 100)) === 0) await new Promise((r) => setTimeout(r, 100));
}
const ticker = setInterval(() => console.log(JSON.stringify(stats)), 10_000);
await new Promise((r) => setTimeout(r, seconds * 1000));
clearInterval(ticker);
stop.abort();
await Promise.allSettled(workers);

console.log(
  JSON.stringify(
    {
      ...stats,
      open: undefined,
      snapshotMs: { p50: Math.round(pct(connectMs, 50)), p95: Math.round(pct(connectMs, 95)) },
    },
    null,
    2,
  ),
);
