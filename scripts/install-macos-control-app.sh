#!/bin/zsh

set -eu
set -o pipefail

SCRIPT_DIRECTORY="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIRECTORY:h}"
TEMPLATE_FILE="${SCRIPT_DIRECTORY}/mcodex-control.applescript.in"
ICON_FILE="${SCRIPT_DIRECTORY}/mcodex-control-icon.svg"
INSTALL_DIRECTORY="${MCODEX_APP_INSTALL_DIRECTORY:-${HOME}/Applications}"
APP_NAME="mCodex Control.app"
INSTALL_PATH="${INSTALL_DIRECTORY}/${APP_NAME}"
TEMPORARY_DIRECTORY="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/mcodex-control.XXXXXX")"

cleanup() {
  /bin/rm -rf "$TEMPORARY_DIRECTORY"
}
trap cleanup EXIT

[[ "$(/usr/bin/uname -s)" == "Darwin" ]] || {
  print -u2 "Error: the control app can only be installed on macOS."
  exit 1
}
[[ -f "$TEMPLATE_FILE" ]] || {
  print -u2 "Error: missing AppleScript template."
  exit 1
}

escaped_project_root="$(print -rn -- "$PROJECT_ROOT" | /usr/bin/sed 's/[\\&|]/\\&/g')"
/usr/bin/sed "s|__MCODEX_PROJECT_ROOT__|${escaped_project_root}|g" \
  "$TEMPLATE_FILE" >"${TEMPORARY_DIRECTORY}/mcodex-control.applescript"

/usr/bin/osacompile -o "${TEMPORARY_DIRECTORY}/${APP_NAME}" \
  "${TEMPORARY_DIRECTORY}/mcodex-control.applescript"

render_icon() {
  local preview_directory="${TEMPORARY_DIRECTORY}/preview"
  local iconset_directory="${TEMPORARY_DIRECTORY}/mCodex.iconset"
  /bin/mkdir -p "$preview_directory" "$iconset_directory"
  /usr/bin/qlmanage -t -s 1024 -o "$preview_directory" "$ICON_FILE" >/dev/null 2>&1
  local preview_file="${preview_directory}/$(/usr/bin/basename "$ICON_FILE").png"
  [[ -f "$preview_file" ]] || return 1

  /usr/bin/sips -z 16 16 "$preview_file" --out "${iconset_directory}/icon_16x16.png" >/dev/null
  /usr/bin/sips -z 32 32 "$preview_file" --out "${iconset_directory}/icon_16x16@2x.png" >/dev/null
  /usr/bin/sips -z 32 32 "$preview_file" --out "${iconset_directory}/icon_32x32.png" >/dev/null
  /usr/bin/sips -z 64 64 "$preview_file" --out "${iconset_directory}/icon_32x32@2x.png" >/dev/null
  /usr/bin/sips -z 128 128 "$preview_file" --out "${iconset_directory}/icon_128x128.png" >/dev/null
  /usr/bin/sips -z 256 256 "$preview_file" --out "${iconset_directory}/icon_128x128@2x.png" >/dev/null
  /usr/bin/sips -z 256 256 "$preview_file" --out "${iconset_directory}/icon_256x256.png" >/dev/null
  /usr/bin/sips -z 512 512 "$preview_file" --out "${iconset_directory}/icon_256x256@2x.png" >/dev/null
  /usr/bin/sips -z 512 512 "$preview_file" --out "${iconset_directory}/icon_512x512.png" >/dev/null
  /bin/cp "$preview_file" "${iconset_directory}/icon_512x512@2x.png"
  /usr/bin/iconutil -c icns "$iconset_directory" -o "${TEMPORARY_DIRECTORY}/applet.icns"
  /bin/cp "${TEMPORARY_DIRECTORY}/applet.icns" \
    "${TEMPORARY_DIRECTORY}/${APP_NAME}/Contents/Resources/applet.icns"
}

if [[ -f "$ICON_FILE" ]]; then
  render_icon || print -u2 "Warning: custom icon generation failed; using the default app icon."
fi

# Replacing the compiled app's icon changes a sealed resource, so refresh the
# local ad-hoc signature before installing the bundle.
/usr/bin/codesign --force --deep --sign - "${TEMPORARY_DIRECTORY}/${APP_NAME}" >/dev/null

/bin/mkdir -p "$INSTALL_DIRECTORY"
if [[ -e "$INSTALL_PATH" ]]; then
  backup_path="${INSTALL_PATH}.backup-$(/bin/date -u +%Y%m%dT%H%M%SZ)"
  /bin/mv "$INSTALL_PATH" "$backup_path"
  print "Previous app moved to: ${backup_path}"
fi
/bin/mv "${TEMPORARY_DIRECTORY}/${APP_NAME}" "$INSTALL_PATH"

print "Installed: ${INSTALL_PATH}"
print "Drag the app to the Dock for one-click start/stop."
