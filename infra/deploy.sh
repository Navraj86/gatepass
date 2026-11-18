#!/usr/bin/env sh
# Rolling deploy of one image tag (a commit SHA) on the VPS:
#   infra/deploy.sh <tag>
# Pulls images, runs migrations as a one-off container, restarts api-1 and waits until it
# is ready before touching api-2, then updates web, nginx and alloy. Nginx keeps sending
# traffic to whichever API instance is up, so the API, SSE and webhooks stay available.
# Rollback is the same command with the previous tag (see infra/runbook.md).
set -eu

TAG="${1:?usage: infra/deploy.sh <image-tag>}"
cd "$(dirname "$0")/.."

export IMAGE_TAG="$TAG"
COMPOSE="docker compose -f compose.prod.yaml ${COMPOSE_ARGS:-}"

log() { printf '%s deploy %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

wait_healthy() {
  service="$1"
  for _ in $(seq 1 60); do
    id="$($COMPOSE ps -q "$service")"
    status="$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo starting)"
    [ "$status" = "healthy" ] && return 0
    sleep 2
  done
  log "$service did not become healthy; stopping here. Roll back with the previous tag."
  exit 1
}

if [ "${SKIP_PULL:-0}" != "1" ]; then
  log "pulling $TAG"
  $COMPOSE pull --quiet migrate api-1 api-2 web
fi

$COMPOSE up -d postgres redis
log "migrating"
$COMPOSE run --rm migrate

for service in api-1 api-2; do
  log "restarting $service"
  $COMPOSE up -d --no-deps --force-recreate "$service"
  wait_healthy "$service"
  # Nginx benches an instance for fail_timeout (10 s) after failed connections during its
  # restart. Restarting the other one sooner would leave nginx with no instance it trusts.
  sleep "${SETTLE_SECONDS:-12}"
done

log "restarting web"
$COMPOSE up -d --no-deps web
wait_healthy web
$COMPOSE up -d --no-deps nginx alloy
# Picks up a changed infra/nginx/nginx.conf without dropping connections.
$COMPOSE exec -T nginx nginx -s reload

echo "$TAG" > .deployed-tag
log "done: $TAG"
