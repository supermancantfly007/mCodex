<div align="center">

# mCodex

**Use Codex Desktop from your phone on a trusted LAN**

View tasks, send follow-ups, handle approvals, and start new work while Codex Desktop stays on your Windows PC.

[English](README.md) · [中文](README_ZH.md) · [Changelog](CHANGELOG.md) · [Releases](https://github.com/zqlrts60/mCodex/releases)

[![Windows 10/11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?logo=windows)](#requirements)
[![Latest Release](https://img.shields.io/github/v/release/zqlrts60/mCodex?display_name=tag)](https://github.com/zqlrts60/mCodex/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f855a.svg)](LICENSE)

</div>

> [!NOTE]
> mCodex is an unofficial community project. The PC host currently supports only Windows 10/11 with the Microsoft Store version of Codex Desktop installed and signed in.

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
git clone https://github.com/zqlrts60/mCodex.git
cd mCodex
.\manage.bat
```

`manage.bat` checks dependencies, builds the project, starts Codex Desktop with local control enabled, starts mCodex, and opens the local page.

## Connect your phone

1. Connect the phone and PC to the same trusted Wi-Fi or LAN.
2. Start mCodex using one of the methods above.
3. Scan the QR code on the PC page, or open the displayed LAN address and enter the pairing code.

The pairing code is valid for 10 minutes. After pairing, the device stays trusted until the saved token is revoked.

## What you can do

- Browse projects and follow live task output
- Send messages, follow-ups, and images
- Stop tasks and handle approval requests
- Inspect changed files and line counts
- Create projects and start new tasks
- Switch Codex Desktop permission modes

## Screenshots

<p align="center">
  <img src="readme/mobile-projects.jpg" alt="mCodex project and task list on a phone" width="340">
  &nbsp;&nbsp;
  <img src="readme/mobile-task.jpg" alt="mCodex task timeline and file change card on a phone" width="340">
</p>

![mCodex startup terminal showing Codex Desktop, LAN addresses, and pairing](readme/terminal.png)

## Requirements

- Windows 10 or 11 on the host PC
- Microsoft Store version of Codex Desktop, installed and signed in
- A modern browser on the phone or another device
- Node.js only when running from source

## Important security notes

- Use mCodex only on a trusted LAN or private network.
- Never expose or forward the Codex CDP port `9222`.
- mCodex does not provide a public relay, user accounts, or multi-user isolation.
- Third-party tunneling and remote-network tools are outside the project's supported security boundary.

See [SECURITY.md](SECURITY.md) for the full security policy.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| Codex control is offline | Fully quit Codex Desktop, then start mCodex again |
| Phone cannot open the page | Check that both devices share the same LAN and allow port `3210` on private networks |
| Pairing code expired | Restart mCodex to generate a new code |
| Startup failed | For source/portable installs, run `manage.bat logs` |

## License

[MIT](LICENSE)
