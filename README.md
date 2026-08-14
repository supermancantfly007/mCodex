<div align="center">

# mCodex

**Codex Desktop on your phone**

Leave Codex Desktop running on your PC, and use your phone to check progress, send follow-ups, and handle approvals.

[English](README.md) · [中文](README_ZH.md) · [Changelog](CHANGELOG.md) · [Releases](https://github.com/zqlrts60/mCodex/releases)

[![Windows 10/11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?logo=windows)](#requirements)
[![macOS 12+](https://img.shields.io/badge/macOS-12%2B%20experimental-000000?logo=apple)](#4-macos--docker-experimental)
[![Latest Release](https://img.shields.io/github/v/release/zqlrts60/mCodex?display_name=tag)](https://github.com/zqlrts60/mCodex/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f855a.svg)](LICENSE)

</div>

> [!NOTE]
> mCodex is an unofficial community project. This fork is based on [zqlrts60/mCodex](https://github.com/zqlrts60/mCodex) and adds experimental macOS and public-VPS access support. Windows 10/11 remains the original supported host; both platforms require the official Codex Desktop app to be installed and signed in.

https://github.com/user-attachments/assets/a5a2ce4b-d82e-484e-8de3-d4ceade51807

## Ways to use mCodex

### 1. Single-file EXE (recommended)

Download `mCodex-*-win-x64.exe` from [Releases](https://github.com/zqlrts60/mCodex/releases/latest), fully quit Codex Desktop, and double-click the EXE. It starts Codex Desktop and mCodex, then opens the local page automatically.

Best for most users. No Node.js or build step is required. The EXE is currently unsigned, so Windows SmartScreen may show an unknown publisher warning.

### 2. Portable ZIP

Download `mCodex-*-win-x64-portable.zip` from [Releases](https://github.com/zqlrts60/mCodex/releases/latest), extract it, fully quit Codex Desktop, and double-click `start.bat`.

Use this when you prefer an unpacked package. Node.js is included.

### 3. Source code

Requires Node.js `20.19+` or `22.12+`:

```powershell
git clone https://github.com/supermancantfly007/mCodex.git
cd mCodex
.\manage.bat
```

`manage.bat` checks dependencies, builds the project, starts Codex Desktop with local control enabled, starts mCodex, and opens the local page.

### 4. macOS + Docker (experimental)

Requires macOS 12+, the official Codex Desktop app, and Docker Desktop. The Bridge, web UI, and optional SSH tunnel run in local containers, so mCodex does not require Node.js on the Mac host:

```zsh
git clone https://github.com/supermancantfly007/mCodex.git
cd mCodex
cp .env.docker.example .env.docker
# Edit .env.docker and set at least the Codex home and projects root.
```

For the first run, wait until any active Codex task finishes, fully quit Codex Desktop with `Command-Q`, then run:

```zsh
./scripts/manage-docker.sh up
```

`up` first checks and, when needed, launches native Codex with its control channel bound only to `127.0.0.1:9222`; it then builds and starts the Bridge and optional VPS sidecar. If Codex is already running without that channel, the script exits safely and asks you to finish the task and fully quit Codex—it never force-quits the app.

Use `manage-docker.sh status`, `logs`, `restart`, `down`, and `open` for day-to-day control. `down` stops only the mCodex and tunnel containers; it does not quit Codex Desktop or stop a Codex task. `.env.docker` is ignored by Git and must remain private. The Bridge is published only on `127.0.0.1:3210`, while the container reaches Codex through `host.docker.internal`.

Docker Desktop's Start button can only start containers and cannot execute a macOS host command, so it cannot launch the Codex app itself. Use `manage-docker.sh up` when CDP should be handled automatically; direct Docker Desktop controls work when Codex is already running in CDP mode.

For terminal-free control, install the macOS app once:

```zsh
./scripts/install-macos-control-app.sh
```

It is installed as `~/Applications/mCodex Control.app`. Drag it to the Dock: one click starts Docker Desktop, Codex CDP, the Bridge, and the VPS tunnel; the next click stops only the Bridge and tunnel without quitting Codex Desktop.

## Connect your phone

### On the same network

1. Start mCodex using one of the methods above.
2. Connect the phone and PC to the same Wi-Fi or network.
3. Scan the QR code on the PC page, or open the displayed address and enter the pairing code.

The pairing code is valid for 10 minutes. After pairing, the device stays trusted until the saved token is revoked.

### Remote access

You do not need Tailscale or another private-network client. A normal HTTPS endpoint can be built with VPS Caddy, an SSH reverse tunnel, and Cloudflare Access. On macOS, the Docker Compose VPS profile manages the reverse-tunnel sidecar together with the Bridge; see the [Chinese VPS deployment guide](deploy/README_ZH.md). Only forward the mCodex service on port `3210`; never expose the Codex control port `9222`.

## What you can do

- Browse projects and follow live task output
- Send messages, follow-ups, and images
- Stop tasks and handle approval requests
- Inspect changed files and line counts
- Create projects and start new tasks
- Switch Codex Desktop permission modes

## Why mCodex?

| Common approach | Practical pain point | How mCodex differs |
| --- | --- | --- |
| **Unofficial accounts, wrappers, or relay services** | They may require cookies or tokens and route requests through third parties, increasing credential and account risk. | mCodex does not take over authentication or proxy model requests. It reuses the official session in Codex Desktop. |
| **Official ChatGPT mobile app** | It is a separate ChatGPT experience, not a mobile view of the same local Codex Desktop projects, tasks, approvals, and file changes. | mCodex keeps the current Desktop task context on your phone. |
| **Remote desktop tools** | Streaming the whole screen means tiny controls, awkward typing, scrolling, and precise clicking on a phone. | mCodex provides a responsive, touch-friendly interface focused on Codex workflows. |
| **CLI-only or infrastructure-heavy tools** | Terminal workflows are inconvenient on a phone, while multi-service deployments are excessive for one personal PC. | mCodex uses one platform launcher, one local bridge, and a browser UI. |

## Screenshots

<p align="center">
  <img src="readme/mobile-projects.jpg" alt="mCodex project and task list on a phone" width="340">
  &nbsp;&nbsp;
  <img src="readme/mobile-task.jpg" alt="mCodex task timeline and file change card on a phone" width="340">
</p>

![mCodex startup terminal showing Codex Desktop, LAN addresses, and pairing](readme/terminal.png)

## Requirements

- Windows 10/11, or experimentally macOS 12+
- Microsoft Store Codex Desktop on Windows, or the official Codex Desktop app on macOS
- A modern browser on the phone or another device
- Node.js for the Windows source workflow; the macOS Docker workflow does not require host Node.js

## Important security notes

- Keep pairing enabled and protect any address exposed through a tunneling service.
- Never expose or forward the Codex CDP port `9222`.
- mCodex does not provide a public relay, user accounts, or multi-user isolation.
- Put an independent identity layer such as Cloudflare Access in front of public domains and block proxy access to `/api/pairing-info`.
- Third-party tunneling and remote-network tools are supported as connection options but remain outside the project's security and availability responsibility.

See [SECURITY.md](SECURITY.md) for the full security policy.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| Codex control is offline | Fully quit Codex Desktop, then start mCodex again |
| Phone cannot open the page | On the same network, check port `3210`; remotely, check the tunneling or private-network configuration |
| Pairing code expired | Restart mCodex to generate a new code |
| Startup failed | For source/portable installs, run `manage.bat logs` |
| macOS says Desktop is running without control | Wait for active tasks to finish, fully quit Codex with `Command-Q`, then run `./scripts/manage-macos.sh cdp` |
| macOS container startup failed | Run `./scripts/manage-docker.sh status` and `./scripts/manage-docker.sh logs`, then check `.env.docker` |

## Friends

- [**linux.do**](https://linux.do/)

## License

[MIT](LICENSE)
