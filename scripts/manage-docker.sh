#!/bin/zsh

set -eu
set -o pipefail

SCRIPT_DIRECTORY="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIRECTORY:h}"
ENV_FILE="${PROJECT_ROOT}/.env.docker"
COMPOSE_FILE="${PROJECT_ROOT}/compose.yaml"

cd "$PROJECT_ROOT"

fail() {
  print -u2 "Error: $1"
  exit 1
}

ensure_docker() {
  command -v docker >/dev/null 2>&1 || fail "Docker Desktop is required."
  docker info >/dev/null 2>&1 || fail "Docker Desktop is not running."
  docker compose version >/dev/null 2>&1 || fail "Docker Compose is unavailable."
}

ensure_env() {
  [[ -f "$ENV_FILE" ]] || fail "Missing .env.docker. Copy .env.docker.example and fill in the local paths."
  /bin/mkdir -p .run-docker/bridge .run-docker/tunnel
  /bin/chmod 700 .run-docker .run-docker/bridge .run-docker/tunnel
}

ensure_cdp() {
  [[ "$(/usr/bin/uname -s)" == "Darwin" ]] || fail "Automatic Codex CDP startup is supported only on macOS."
  "${SCRIPT_DIRECTORY}/manage-macos.sh" cdp
}

vps_enabled() {
  /usr/bin/grep -Eq '^MCODEX_VPS_ENABLED=(true|1|yes)$' "$ENV_FILE"
}

compose() {
  local arguments=(--env-file "$ENV_FILE" -f "$COMPOSE_FILE")
  if vps_enabled; then
    arguments+=(--profile vps)
  fi
  docker compose "${arguments[@]}" "$@"
}

command_name="${1:-up}"
ensure_docker
ensure_env

case "$command_name" in
  up|start)
    ensure_cdp
    compose up -d --build
    ;;
  down|stop)
    compose down
    ;;
  restart)
    ensure_cdp
    compose restart
    ;;
  build)
    compose build
    ;;
  status|ps)
    compose ps
    ;;
  logs)
    compose logs -f --tail=100
    ;;
  open)
    local_port="$(/usr/bin/sed -n 's/^MCODEX_LOCAL_PORT=//p' "$ENV_FILE" | /usr/bin/tail -n 1)"
    /usr/bin/open "http://127.0.0.1:${local_port:-3210}/"
    ;;
  config)
    compose config
    ;;
  *)
    print -u2 "Usage: $0 [up|down|restart|build|status|logs|open|config]"
    exit 2
    ;;
esac
