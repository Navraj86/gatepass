# Gatepass runbook

Everything runs from `~/gatepass` on one VPS with Docker Compose (`compose.prod.yaml`). Secrets live in `~/gatepass/.env` (template: `infra/env.prod.example`), the Cloudflare Origin Certificate in `infra/certs/` (`origin.pem`, `origin.key`). Neither is in git.

The EC2 instance is stopped when not in use. Stop it, never terminate it: terminating deletes the disk and the database with it.

## First setup

1. Ubuntu LTS, 4 vCPU and 8 GB RAM class. Security group: 80 and 443 from Cloudflare ranges only, 22 from your own IP only.
2. Harden: SSH keys only (`PasswordAuthentication no`, `PermitRootLogin no`), `ufw` mirroring the security group, `unattended-upgrades` on.
3. Install Docker Engine with the compose plugin, plus `rclone` for backups.
4. `git clone https://github.com/Navraj86/gatepass.git ~/gatepass`, then create `.env` and `infra/certs/`.
5. `sudo install -d -o $USER /var/log/gatepass` for the backup log that Alloy reads.
6. If the GHCR packages are private, `docker login ghcr.io` once with a token that has `read:packages`.
7. Cloudflare: proxied A record to the VPS, SSL mode Full (strict), and a Dodo webhook pointing at `https://gatepass.navraj.dev/api/webhooks/dodo`.
8. First deploy: `infra/deploy.sh <commit-sha>`, then seed the demo once with `docker compose -f compose.prod.yaml exec -e DEMO_PASSWORD=... api-1 node dist/db/seed.js`. Never run `pnpm db:seed` here: its `--reset` wipes data (the API refuses it in production anyway).

## Deploy

Pushing to `main` runs CI, builds `gatepass-api` and `gatepass-web` tagged with the commit SHA, pushes both to GHCR and, when the repository has the `DEPLOY_HOST` variable and `DEPLOY_SSH_KEY` secret, runs the deploy over SSH. Since port 22 only accepts your IP, the usual path is manual:

```sh
cd ~/gatepass
git fetch && git checkout <sha>
infra/deploy.sh <sha>
```

The script pulls the images, runs migrations as a one-off container, restarts `api-1`, waits until it is healthy and nginx trusts it again, does the same for `api-2`, then restarts web and reloads nginx. The API, SSE and webhooks stay up the whole time; pages blip for a few seconds while the single web container restarts. A local run under steady load served 8,328 requests during a full deploy with no errors.

Migrations must stay additive (new tables, new nullable columns, new indexes) so the old and new API versions can run side by side for those few seconds.

## Rollback

Redeploy the previous tag. It is in `.deployed-tag` before you deploy, or in `git log`:

```sh
infra/deploy.sh <previous-sha>
```

Because migrations are additive, the old code runs fine on the newer schema.

## Looking at things

- Dashboard: Grafana Cloud, "Gatepass: On-sale night" (import `infra/grafana/on-sale-night.json`).
- Logs: Grafana Explore with Loki, for example `{service="api-1"} | json | req_id="<X-Request-Id>"`. Every response carries `X-Request-Id`, and nginx and the API log the same id.
- On the box: `docker compose -f compose.prod.yaml ps`, `... logs -f --tail 100 api-1`.
- Health of one instance: `docker compose -f compose.prod.yaml exec api-1 wget -qO- localhost:4000/api/health/ready`. Through Cloudflare: `curl https://gatepass.navraj.dev/api/health/ready`.

## Alerts

Load the rules once, and again after editing them:

```sh
mimirtool rules load infra/grafana/alerts.yaml --address=<prometheus ruler url> --id=<prometheus user> --key=<token>
mimirtool rules load infra/grafana/log-alerts.yaml --backend=loki --address=<loki ruler url> --id=<loki user> --key=<token>
```

| Alert           | First thing to check                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| ApiNotReady     | `ps` and logs for that instance. `ready` reports `db`, `bus` and `draining`, so the body says which dependency is down.          |
| HighErrorRate   | Loki errors for the API; a Dodo outage shows up as `checkout_sessions_created_total{result="failed"}`.                           |
| SlowRequests    | PostgreSQL pool panel: `waiting` above zero means the pool is the bottleneck.                                                    |
| OversellBlocked | Nothing is broken: the database refused a second ticket for a seat. Find the order in the logs and confirm it went to refunding. |
| RefundsFailing  | Retry from the organizer sales page; check Dodo's dashboard for the payment.                                                     |
| BackupMissing   | `tail /var/log/gatepass/backup.log` and run the script by hand.                                                                  |

## Common incidents

**One API instance is stuck.** `docker compose -f compose.prod.yaml restart api-2`. It drains on SIGTERM (readiness goes false, SSE clients are told to reconnect, in-flight requests finish) and nginx sends traffic to the other instance meanwhile.

**Redis restarts.** Nothing is lost that matters: seat state is in PostgreSQL. Each API instance notices the reconnect and closes its SSE streams, browsers reconnect and get a fresh snapshot. Rate limits fail open while Redis is down.

**Dodo webhooks failing.** Dodo retries with backoff. Check `webhook_events_total` by result and the API logs for signature errors (a rotated webhook key not yet in `.env` is the usual cause). After fixing `.env`, run the deploy again with the current tag to restart both instances.

**Disk filling up.** `docker system df`, then `docker image prune -a --filter until=168h` to drop images older than a week.

## Backups and restore

Host crontab (`crontab -e`):

```
15 3 * * * BACKUP_REMOTE=r2:gatepass-backups /home/ubuntu/gatepass/infra/backup.sh >> /var/log/gatepass/backup.log 2>&1
```

`infra/backup.sh` runs `pg_dump -Fc` inside the postgres container, uploads it with rclone, deletes dumps older than 14 days and logs `backup ok` with the size. Configure the remote once with `rclone config` (Cloudflare R2 or Backblaze B2).

Restore into a scratch container first, check it, then swap:

```sh
rclone copyto r2:gatepass-backups/<file>.dump /tmp/restore.dump
docker run -d --name restore -e POSTGRES_USER=gatepass -e POSTGRES_PASSWORD=scratch -e POSTGRES_DB=gatepass postgres:17-alpine
docker exec -i restore pg_restore -U gatepass -d gatepass --no-owner --exit-on-error < /tmp/restore.dump
docker exec restore psql -U gatepass -d gatepass -c 'select count(*) from tickets'
```

To replace production with it: stop `api-1`, `api-2` and `web`, run the same `pg_restore` with `--clean --if-exists` against the `postgres` service, then `infra/deploy.sh $(cat .deployed-tag)`.

Restore timing: a development-sized dump (112 KB) restores in about half a second. Time a restore of the production dump on the server and record it here.

## Load tests

See `load/README.md`. Set `LOAD_TEST=true` in `.env` and redeploy only for the run, then set it back and redeploy: with it on, checkout never reaches Dodo.
