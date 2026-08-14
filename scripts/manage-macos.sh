#!/bin/zsh

set -eu
set -o pipefail

# launchd starts with a minimal PATH; include the standard Homebrew locations
# for Apple Silicon and Intel Macs before resolving Node.js.
export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"

SCRIPT_DIRECTORY="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIRECTORY:h}"
BRIDGE_PORT="${BRIDGE_PORT:-3210}"
RUN_LOG_DIRECTORY="${PROJECT_ROOT}/.run-logs"
BRIDGE_PID_FILE="${RUN_LOG_DIRECTORY}/bridge.pid"
BRIDGE_MODE_FILE="${RUN_LOG_DIRECTORY}/bridge.mode"
BRIDGE_OUTPUT_LOG="${RUN_LOG_DIRECTORY}/bridge.out.log"
BRIDGE_ERROR_LOG="${RUN_LOG_DIRECTORY}/bridge.err.log"
SERVER_ENTRY="dist/server/index.js"

cd "$PROJECT_ROOT"

fail() {
  print -u2 "Error: $1"
  exit 1
}

bridge_health() {
  /usr/bin/curl --fail --silent --show-error --max-time 2 \
    "http://127.0.0.1:${BRIDGE_PORT}/api/health" 2>/dev/null
}

cdp_ready() {
  /usr/bin/curl --fail --silent --show-error --max-time 2 \
    "http://127.0.0.1:${MCODEX_CDP_PORT:-9222}/json/version" >/dev/null 2>&1
}

ensure_node() {
  command -v node >/dev/null 2>&1 || fail "Node.js 20.19+ or 22.12+ is required."
  command -v npm >/dev/null 2>&1 || fail "npm is required."

  local version major minor
  version="$(node -p 'process.versions.node')"
  major="${version%%.*}"
  minor="${${version#*.}%%.*}"
  if ! (( (major == 20 && minor >= 19) || (major >= 22) )); then
    fail "Node.js ${version} is unsupported; install 20.19+ or 22.12+."
  fi
  print "Node.js is ready: v${version}"
}

ensure_dependencies() {
  if [[ ! -d node_modules ]]; then
    print "Installing npm dependencies..."
    npm ci
  fi
}

ensure_build() {
  local output="${PROJECT_ROOT}/${SERVER_ENTRY}"
  local changed=""
  if [[ -f "$output" ]]; then
    changed="$(find src web vite.config.ts tsconfig.server.json -type f -newer "$output" -print -quit)"
  fi
  if [[ ! -f "$output" || -n "$changed" ]]; then
    print "Building mCodex..."
    npm run build
  fi
}

ensure_cdp() {
  if cdp_ready; then
    print "Codex control channel is already online."
    return
  fi
  "${SCRIPT_DIRECTORY}/start-codex-cdp-macos.sh"
}

recorded_bridge_pid() {
  if [[ -f "$BRIDGE_PID_FILE" ]]; then
    local pid="$(<"$BRIDGE_PID_FILE")"
    if [[ "$pid" == <-> ]]; then
      print "$pid"
    fi
  fi
}

bridge_process_belongs_to_project() {
  local pid="$1"
  [[ "$pid" == <-> ]] || return 1
  /bin/kill -0 "$pid" 2>/dev/null || return 1

  local command_line="$(/bin/ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ "$command_line" == *"${SERVER_ENTRY}"* ]] || return 1

  local process_cwd="$(/usr/sbin/lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | /usr/bin/sed -n 's/^n//p' | /usr/bin/head -n 1)"
  [[ "$process_cwd" == "$PROJECT_ROOT" ]]
}

listening_bridge_pid() {
  local -a listener_pids
  listener_pids=("${(@f)$(/usr/sbin/lsof -nP -tiTCP:"${BRIDGE_PORT}" -sTCP:LISTEN 2>/dev/null || true)}")
  local pid
  for pid in "${listener_pids[@]}"; do
    if bridge_process_belongs_to_project "$pid"; then
      print -r -- "$pid"
      return 0
    fi
  done
  return 1
}

effective_bridge_pid() {
  local pid="$(recorded_bridge_pid || true)"
  if [[ -n "$pid" ]] && bridge_process_belongs_to_project "$pid"; then
    print -r -- "$pid"
    return 0
  fi

  pid="$(listening_bridge_pid || true)"
  [[ -n "$pid" ]] || return 1
  /bin/mkdir -p "$RUN_LOG_DIRECTORY"
  print -r -- "$pid" >"$BRIDGE_PID_FILE"
  print -r -- "$pid"
}

stop_bridge() {
  local recorded_pid="$(recorded_bridge_pid || true)"
  local pid="$(effective_bridge_pid || true)"
  if [[ -n "$pid" ]]; then
    /bin/kill "$pid"
    integer attempt=0
    while /bin/kill -0 "$pid" 2>/dev/null && (( attempt < 50 )); do
      /bin/sleep 0.1
      (( attempt += 1 ))
    done
    if /bin/kill -0 "$pid" 2>/dev/null; then
      /bin/kill -KILL "$pid"
    fi
    print "Bridge stopped."
  elif [[ -n "$recorded_pid" ]]; then
    print -u2 "Ignoring stale Bridge PID ${recorded_pid}; it does not belong to this mCodex project."
  fi
  /bin/rm -f "$BRIDGE_PID_FILE"
  /bin/rm -f "$BRIDGE_MODE_FILE"
}

start_bridge() {
  local listen_host="$1"
  local external_access="$2"
  local current_health="$(bridge_health || true)"
  local requested_mode="${listen_host}|${external_access}"
  local current_mode=""
  [[ -f "$BRIDGE_MODE_FILE" ]] && current_mode="$(<"$BRIDGE_MODE_FILE")"

  if [[ -n "$current_health" && "$current_mode" == "$requested_mode" ]]; then
    local active_pid="$(effective_bridge_pid || true)"
    [[ -n "$active_pid" ]] || fail "Port ${BRIDGE_PORT} is responding, but its listener does not belong to this mCodex project."
    if [[ "$external_access" != "true" || "$current_health" == *'"authRequired":true'* ]]; then
      print "Bridge is already online: http://127.0.0.1:${BRIDGE_PORT}"
      return
    fi
  fi
  if [[ -n "$current_health" ]]; then
    print "Restarting Bridge with the requested access mode..."
    stop_bridge
    bridge_health >/dev/null 2>&1 && fail "Port ${BRIDGE_PORT} is still occupied by a service that does not belong to this mCodex project."
  fi

  /bin/mkdir -p "$RUN_LOG_DIRECTORY"
  export BRIDGE_HOST="$listen_host"
  export BRIDGE_PORT
  export BRIDGE_EXTERNAL_ACCESS="$external_access"
  export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
  export CODEX_CDP_URL="${CODEX_CDP_URL:-http://127.0.0.1:${MCODEX_CDP_PORT:-9222}}"

  nohup node "$SERVER_ENTRY" >>"$BRIDGE_OUTPUT_LOG" 2>>"$BRIDGE_ERROR_LOG" </dev/null &
  local pid=$!
  print -r -- "$pid" >"$BRIDGE_PID_FILE"
  print -r -- "$requested_mode" >"$BRIDGE_MODE_FILE"

  integer attempt=0
  while (( attempt < 100 )); do
    if bridge_health >/dev/null; then
      print "Bridge is online: http://127.0.0.1:${BRIDGE_PORT}"
      if [[ "$listen_host" != "127.0.0.1" ]]; then
        print "LAN access is enabled on port ${BRIDGE_PORT}."
      elif [[ "$external_access" == "true" ]]; then
        print "Bridge is loopback-only; remote authentication is enabled for a reverse tunnel."
      else
        print "Bridge is available only on this Mac."
      fi
      if [[ "${MCODEX_NO_OPEN:-0}" != "1" ]]; then
        /usr/bin/open "http://127.0.0.1:${BRIDGE_PORT}/"
      fi
      return
    fi
    if ! /bin/kill -0 "$pid" 2>/dev/null; then
      print -u2 "Bridge exited during startup. See ${BRIDGE_ERROR_LOG}."
      exit 1
    fi
    /bin/sleep 0.2
    (( attempt += 1 ))
  done

  print -u2 "Bridge did not become ready within 20 seconds. See ${BRIDGE_ERROR_LOG}."
  exit 1
}

show_status() {
  print "===== mCodex Status ====="
  if bridge_health >/dev/null; then
    print "  [ONLINE]  Bridge :${BRIDGE_PORT}"
  else
    print "  [OFFLINE] Bridge :${BRIDGE_PORT}"
  fi
  if cdp_ready; then
    print "  [ONLINE]  Codex control"
  else
    print "  [OFFLINE] Codex control"
  fi
  print "Logs: ${RUN_LOG_DIRECTORY}"
}

show_logs() {
  print "===== Bridge output ====="
  [[ -f "$BRIDGE_OUTPUT_LOG" ]] && /usr/bin/tail -n 40 "$BRIDGE_OUTPUT_LOG"
  print ""
  print "===== Bridge errors ====="
  [[ -f "$BRIDGE_ERROR_LOG" ]] && /usr/bin/tail -n 40 "$BRIDGE_ERROR_LOG"
}

command_name="${1:-start}"
case "$command_name" in
  start|lan)
    ensure_node
    ensure_dependencies
    ensure_build
    ensure_cdp
    start_bridge "${BRIDGE_HOST:-0.0.0.0}" "true"
    ;;
  tunnel)
    ensure_node
    ensure_dependencies
    ensure_build
    ensure_cdp
    start_bridge "127.0.0.1" "true"
    ;;
  local)
    ensure_node
    ensure_dependencies
    ensure_build
    ensure_cdp
    start_bridge "127.0.0.1" "false"
    ;;
  restart)
    stop_bridge
    "$0" start
    ;;
  cdp)
    ensure_cdp
    ;;
  install)
    ensure_node
    ensure_dependencies
    ;;
  build)
    ensure_node
    ensure_dependencies
    ensure_build
    ;;
  stop)
    stop_bridge
    ;;
  status)
    show_status
    ;;
  logs)
    show_logs
    ;;
  open)
    /usr/bin/open "http://127.0.0.1:${BRIDGE_PORT}/"
    ;;
  *)
    print -u2 "Usage: $0 [start|lan|tunnel|local|restart|stop|status|install|build|cdp|logs|open]"
    exit 2
    ;;
esac
