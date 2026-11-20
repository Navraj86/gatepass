# Load tests

Four scenarios and an audit. Payments never reach Dodo: with `LOAD_TEST=true` the API swaps checkout creation for a stub and accepts the run file's unsigned session tokens, and k6 signs the `payment.succeeded` webhook itself with the real webhook key, so the real verification and fulfillment code runs.

| File          | What it does                                                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onsale.js`   | About 5,000 buyers arrive over 30 s; each holds 1 to 4 random seats and retries other seats on 409. `PURCHASE=true` also creates the order and pays it with a signed webhook. |
| `viewers.mjs` | Opens thousands of live seat map streams (k6 has no SSE client, so this is plain Node).                                                                                       |
| `steady.js`   | Constant light load during `infra/deploy.sh`; fails on any 5xx or network error.                                                                                              |
| `audit.sql`   | After every run: at most one valid ticket per seat, sold seats equal valid tickets, no paid order without tickets, and so on. Every row must read 0.                          |

## Running against the server

Run k6 from a different machine than the VPS, so the load generator is not competing with what it measures.

1. On the server, set `LOAD_TEST=true` in `.env` and redeploy with the current tag.
2. Create the run file (a fresh on-sale event plus buyers with session tokens) and copy it to the k6 machine:

   ```sh
   docker compose -f compose.prod.yaml exec -T api-1 node dist/db/seed-load.js --users 5000 > run.json
   ```

3. From the k6 machine:

   ```sh
   k6 run -e BASE_URL=https://gatepass.navraj.dev -e RUN_FILE=./run.json -e PURCHASE=true -e DODO_PAYMENTS_WEBHOOK_KEY=whsec_... load/onsale.js
   node load/viewers.mjs --viewers 2000 --seconds 120 --base https://gatepass.navraj.dev --run run.json
   k6 run -e BASE_URL=https://gatepass.navraj.dev -e RUN_FILE=./run.json -e DURATION=3m load/steady.js   # while deploying
   ```

   Add `--out experimental-prometheus-rw` with `K6_PROMETHEUS_RW_SERVER_URL` and credentials to send k6's own numbers to the same Grafana Cloud stack.

4. Audit, then turn the flag off and redeploy:

   ```sh
   docker compose -f compose.prod.yaml exec -T postgres sh -c 'psql -U gatepass -d gatepass -v event_id=<eventId>' < load/audit.sql
   ```

Seat holds are limited to 10 per minute per buyer and orders to 5, so each buyer in the run file has its own session; with fewer buyers than arrivals, later arrivals reuse sessions and may hit those limits (counted as 429, not as failures).

## Running locally

```sh
cd apps/api && pnpm build
PORT=4100 LOAD_TEST=true REDIS_URL=redis://localhost:6380 DB_POOL_MAX=20 node --env-file=.env dist/index.js
LOAD_TEST=true pnpm --silent db:seed:load --users 600 > ../../load/run.json
docker run --rm -v "$PWD/load:/load" -w /load -e BASE_URL=http://host.docker.internal:4100 -e BUYERS=500 -e RAMP=10s grafana/k6 run onsale.js
```

## What the local runs found

These are from one laptop (12 threads, Windows, Docker Desktop) running a single API process, PostgreSQL, Redis and k6 together. They are a baseline and a bug hunt, not the results table: those come from the VPS with two API instances.

- **Pool starvation (fixed).** The first run left all 20 pooled connections waiting for a 21st and 397 requests queued forever: seat announcements needed a second connection while the transaction still held its first. Fixed by announcing after the client is released, with a regression test.
- **QR rendering on the hot path (fixed).** A CPU profile showed a quarter of the API's CPU drawing QR PNGs for emails that were never sent. On a 500-buyer run this took hold p50 from 2.24 s to 203 ms and payment-to-paid p50 from 9.7 s to 320 ms.
- **500 buyers over 10 s, with purchases:** 0 failed requests, hold p50 203 ms and p95 529 ms, about 200 requests per second.
- **The same plus 500 live viewers:** every viewer stayed connected (0 errors, 0 reconnects) and received 46 change batches; snapshot p50 34 ms; server-side update lag 343 ms on average, including the 250 ms batching window.
- **5,000 buyers over 30 s:** the single process saturates near 270 requests per second, hold p95 is 3.25 s, and k6 dropped 3,038 arrivals for lack of free virtual users. Correctness held anyway: 1,668 seats sold to 882 paid orders, 0 failed requests, and every audit check at 0.
