#!/bin/zsh

set -eu
set -o pipefail

CDP_PORT="${MCODEX_CDP_PORT:-9222}"
CODEX_APP="${MCODEX_CODEX_APP:-}"
PROFILE_DIRECTORY="${MCODEX_CODEX_PROFILE:-$HOME/Library/Application Support/Codex/RemoteBridgeProfile}"

cdp_ready() {
  /usr/bin/curl --fail --silent --show-error --max-time 2 \
    "http://127.0.0.1:${CDP_PORT}/json/version" >/dev/null 2>&1
}

resolve_codex_app() {
  if [[ -n "$CODEX_APP" && -d "$CODEX_APP" ]]; then
    return
  fi

  local candidate
  for candidate in "/Applications/ChatGPT.app" "$HOME/Applications/ChatGPT.app" "/Applications/Codex.app" "$HOME/Applications/Codex.app"; do
    if [[ -d "$candidate" ]]; then
      CODEX_APP="$candidate"
      return
    fi
  done

  print -u2 "Codex Desktop was not found. Install it first or set MCODEX_CODEX_APP."
  exit 1
}

if cdp_ready; then
  print "Codex control channel is already online: http://127.0.0.1:${CDP_PORT}"
  exit 0
fi

resolve_codex_app

if /usr/bin/pgrep -x ChatGPT >/dev/null 2>&1; then
  print -u2 "Codex Desktop is running without its local control channel."
  print -u2 "Fully quit Codex Desktop (Command-Q), then run this command again."
  exit 1
fi

/bin/mkdir -p "$PROFILE_DIRECTORY"

print "Starting ${CODEX_APP} with a loopback-only control channel..."
/usr/bin/open -n -a "$CODEX_APP" --args \
  "--remote-debugging-address=127.0.0.1" \
  "--remote-debugging-port=${CDP_PORT}" \
  "--user-data-dir=${PROFILE_DIRECTORY}"

integer attempt=0
while (( attempt < 120 )); do
  if cdp_ready; then
    print "Codex control channel is online: http://127.0.0.1:${CDP_PORT}"
    exit 0
  fi
  /bin/sleep 1
  (( attempt += 1 ))
done

print -u2 "Codex control channel did not become ready within 120 seconds."
print -u2 "Fully quit Codex Desktop and try again."
exit 1
