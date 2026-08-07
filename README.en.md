# mCodex

View and control Codex Desktop on Windows from a phone browser.

mCodex runs locally. It reads session records from `CODEX_HOME` and uses CDP to control Codex Desktop over a trusted LAN. It does not modify session files.

This is an unofficial project and is not affiliated with OpenAI.

## Features

- View projects, conversations, timelines, and live task status
- Send messages, follow-ups, stop tasks, and handle approvals
- Attach and preview images
- Create projects and tasks from a phone
- Pair a device with a short-lived code
- Run from source, a portable ZIP, or a Windows SEA executable

## Quick start

1. Install and sign in to the Windows Store version of Codex Desktop.
2. Install Node.js `20.19+` or `22.12+`.
3. Run `manage.bat start` from a command prompt.
4. Open the local page and scan its QR code from a phone on the same trusted Wi-Fi network.

For manual setup, configuration, API details, security boundaries, and troubleshooting, see the [Chinese README](README.md). Contributions and vulnerability reports are covered by [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Privacy and security

mCodex does not include telemetry or upload conversation data. It is designed for trusted local networks, not public Internet deployment. Never expose Codex Desktop's CDP port `9222`; use a strong `BRIDGE_TOKEN` when listening beyond localhost. See [SECURITY.md](SECURITY.md) before enabling LAN access.

## License

MIT. See [LICENSE](LICENSE).
