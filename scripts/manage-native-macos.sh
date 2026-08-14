#!/bin/zsh

set -eu
set -o pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIRECTORY="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIRECTORY:h}"
ENV_FILE="${MCODEX_ENV_FILE:-${PROJECT_ROOT}/.env.docker}"
RUN_DIRECTORY="${PROJECT_ROOT}/.run-macos"
TUNNEL_PID_FILE="${RUN_DIRECTORY}/tunnel.pid"
TUNNEL_OUTPUT_LOG="${RUN_DIRECTORY}/tunnel.out.log"
TUNNEL_ERROR_LOG="${RUN_DIRECTORY}/tunnel.err.log"
TOKEN_FILE="${RUN_DIRECTORY}/remote-bridge-token"
DOCKER_TOKEN_FILE="${PROJECT_ROOT}/.run-docker/bridge/remote-bridge-token"

CONFIG_LOADED=false

fail() {
  print -u2 "Error: $1"
  exit 1
}

config_value() {
  local requested_key="$1"
  local line value=""

  while IFS= read -r line; do
    if [[ "$line" == "${requested_key}="* ]]; then
      value="${line#*=}"
    fi
  done <"$ENV_FILE"

  value="${value%$'\r'}"
  if (( ${#value} >= 2 )); then
    if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then
      value="${value:1:-1}"
    fi
  fi
  print -r -- "$value"
}

load_config() {
  [[ "$CONFIG_LOADED" == "true" ]] && return
  [[ "$(/usr/bin/uname -s)" == "Darwin" ]] || fail "Native control is supported only on macOS."
  [[ -f "$ENV_FILE" ]] || fail "Missing .env.docker. The native app reuses its private VPS settings."

  BRIDGE_PORT="$(config_value MCODEX_LOCAL_PORT)"
  BRIDGE_PORT="${BRIDGE_PORT:-3210}"
  [[ "$BRIDGE_PORT" == <-> ]] && (( BRIDGE_PORT >= 1 && BRIDGE_PORT <= 65535 )) || fail "MCODEX_LOCAL_PORT is invalid."

  HOST_CODEX_HOME="$(config_value MCODEX_HOST_CODEX_HOME)"
  HOST_CODEX_HOME="${HOST_CODEX_HOME:-${HOME}/.codex}"
  MCODEX_LOCALE_VALUE="$(config_value MCODEX_LOCALE)"
  MCODEX_LOCALE_VALUE="${MCODEX_LOCALE_VALUE:-zh-CN}"

  local enabled_value="$(config_value MCODEX_VPS_ENABLED)"
  case "${enabled_value:l}" in
    true|1|yes) VPS_ENABLED=true ;;
    false|0|no|"") VPS_ENABLED=false ;;
    *) fail "MCODEX_VPS_ENABLED must be true or false." ;;
  esac

  if [[ "$VPS_ENABLED" == "true" ]]; then
    VPS_HOST="$(config_value MCODEX_VPS_HOST)"
    VPS_USER="$(config_value MCODEX_VPS_USER)"
    VPS_USER="${VPS_USER:-mcodex-tunnel}"
    VPS_PORT="$(config_value MCODEX_VPS_TUNNEL_PORT)"
    VPS_PORT="${VPS_PORT:-13210}"
    VPS_SSH_KEY="$(config_value MCODEX_VPS_SSH_KEY)"

    [[ -n "$VPS_HOST" && "$VPS_HOST" != -* ]] || fail "MCODEX_VPS_HOST is invalid."
    [[ -n "$VPS_USER" && "$VPS_USER" != -* ]] || fail "MCODEX_VPS_USER is invalid."
    [[ "$VPS_PORT" == <-> ]] && (( VPS_PORT >= 1 && VPS_PORT <= 65535 )) || fail "MCODEX_VPS_TUNNEL_PORT is invalid."
    [[ -f "$VPS_SSH_KEY" ]] || fail "MCODEX_VPS_SSH_KEY does not point to a private key."
  fi

  CONFIG_LOADED=true
}

bridge_health() {
  /usr/bin/curl --fail --silent --show-error --max-time 2 \
    "http://127.0.0.1:${BRIDGE_PORT}/api/health" >/dev/null 2>&1
}

docker_bridge_running() {
  command -v docker >/dev/null 2>&1 || return 1
  [[ "$(docker inspect -f '{{.State.Running}}' mcodex 2>/dev/null || true)" == "true" ]]
}

recorded_tunnel_pid() {
  if [[ -f "$TUNNEL_PID_FILE" ]]; then
    local pid="$(<"$TUNNEL_PID_FILE")"
    [[ "$pid" == <-> ]] && print -r -- "$pid"
  fi
}

tunnel_running() {
  [[ "$VPS_ENABLED" == "true" ]] || return 0
  local pid="$(recorded_tunnel_pid || true)"
  [[ -n "$pid" ]] || return 1
  /bin/kill -0 "$pid" 2>/dev/null || return 1

  local command_line="$(/bin/ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ "$command_line" == *"/usr/bin/ssh"* \
    && "$command_line" == *"127.0.0.1:${VPS_PORT}:127.0.0.1:${BRIDGE_PORT}"* \
    && "$command_line" == *"${VPS_USER}@${VPS_HOST}"* ]]
}

prepare_runtime() {
  /bin/mkdir -p "$RUN_DIRECTORY"
  /bin/chmod 700 "$RUN_DIRECTORY"
  if [[ ! -f "$TOKEN_FILE" && -f "$DOCKER_TOKEN_FILE" ]]; then
    /bin/cp "$DOCKER_TOKEN_FILE" "$TOKEN_FILE"
  fi
  [[ ! -f "$TOKEN_FILE" ]] || /bin/chmod 600 "$TOKEN_FILE"
}

start_bridge() {
  if docker_bridge_running; then
    fail "The Docker mCodex container is still running. Stop it once before switching to the native app."
  fi

  prepare_runtime
  export BRIDGE_PORT
  export BRIDGE_TOKEN_FILE="$TOKEN_FILE"
  export CODEX_HOME="$HOST_CODEX_HOME"
  export MCODEX_LOCALE="$MCODEX_LOCALE_VALUE"
  export MCODEX_NO_OPEN=1
  "${SCRIPT_DIRECTORY}/manage-macos.sh" tunnel
}

start_tunnel() {
  [[ "$VPS_ENABLED" == "true" ]] || return
  if tunnel_running; then
    print "VPS tunnel is already online."
    return
  fi

  /bin/rm -f "$TUNNEL_PID_FILE"
  /usr/bin/nohup /usr/bin/ssh -NT \
    -i "$VPS_SSH_KEY" \
    -o BatchMode=yes \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o StrictHostKeyChecking=accept-new \
    -o UserKnownHostsFile="${RUN_DIRECTORY}/known_hosts" \
    -R "127.0.0.1:${VPS_PORT}:127.0.0.1:${BRIDGE_PORT}" \
    "${VPS_USER}@${VPS_HOST}" \
    >>"$TUNNEL_OUTPUT_LOG" 2>>"$TUNNEL_ERROR_LOG" </dev/null &
  local pid=$!
  print -r -- "$pid" >"$TUNNEL_PID_FILE"

  integer attempt=0
  while (( attempt < 30 )); do
    if ! /bin/kill -0 "$pid" 2>/dev/null; then
      /bin/rm -f "$TUNNEL_PID_FILE"
      print -u2 "VPS tunnel exited during startup. See ${TUNNEL_ERROR_LOG}."
      exit 1
    fi
    /bin/sleep 0.1
    (( attempt += 1 ))
  done
  print "VPS tunnel is online."
}

stop_tunnel() {
  [[ "$VPS_ENABLED" == "true" ]] || return
  local pid="$(recorded_tunnel_pid || true)"
  if [[ -n "$pid" ]] && tunnel_running; then
    /bin/kill "$pid"
    integer attempt=0
    while /bin/kill -0 "$pid" 2>/dev/null && (( attempt < 50 )); do
      /bin/sleep 0.1
      (( attempt += 1 ))
    done
    if /bin/kill -0 "$pid" 2>/dev/null; then
      /bin/kill -KILL "$pid"
    fi
    print "VPS tunnel stopped."
  fi
  /bin/rm -f "$TUNNEL_PID_FILE"
}

stop_bridge() {
  export BRIDGE_PORT
  "${SCRIPT_DIRECTORY}/manage-macos.sh" stop
}

show_status() {
  local bridge_state="已停止"
  local tunnel_state="未启用"
  bridge_health && bridge_state="运行中"
  if [[ "$VPS_ENABLED" == "true" ]]; then
    tunnel_state="已停止"
    tunnel_running && tunnel_state="运行中"
  fi
  print "Bridge：${bridge_state}"
  print "VPS 隧道：${tunnel_state}"
}

pairing_info() {
  /usr/bin/curl --fail --silent --show-error --max-time 3 \
    "http://127.0.0.1:${BRIDGE_PORT}/api/pairing-info"
}

refresh_pairing() {
  /usr/bin/curl --fail --silent --show-error --max-time 3 \
    -X POST "http://127.0.0.1:${BRIDGE_PORT}/api/pairing-refresh"
}

command_name="${1:-up}"
load_config

case "$command_name" in
  up|start)
    start_bridge
    start_tunnel
    ;;
  ensure)
    if ! bridge_health; then
      start_bridge
    fi
    start_tunnel
    ;;
  down|stop)
    stop_tunnel
    stop_bridge
    ;;
  status)
    show_status
    ;;
  is-running)
    bridge_health && tunnel_running
    ;;
  open)
    /usr/bin/open "http://127.0.0.1:${BRIDGE_PORT}/"
    ;;
  pairing-info)
    pairing_info
    ;;
  refresh-pairing)
    refresh_pairing
    ;;
  logs)
    "${SCRIPT_DIRECTORY}/manage-macos.sh" logs
    print "===== VPS tunnel errors ====="
    [[ -f "$TUNNEL_ERROR_LOG" ]] && /usr/bin/tail -n 40 "$TUNNEL_ERROR_LOG"
    ;;
  *)
    print -u2 "Usage: $0 [up|down|status|is-running|open|pairing-info|refresh-pairing|logs|ensure]"
    exit 2
    ;;
esac
