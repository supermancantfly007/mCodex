<div align="center">

# mCodex

**手机通过网页控制 Codex Desktop**

Codex Desktop 留在电脑上，随时用手机查看进度、追加指令和处理审批。

[English](README.md) · [中文](README_ZH.md) · [更新日志](CHANGELOG.md) · [版本下载](https://github.com/zqlrts60/mCodex/releases)

[![Windows 10/11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?logo=windows)](#环境要求)
[![macOS 12+](https://img.shields.io/badge/macOS-12%2B%20experimental-000000?logo=apple)](#4-macos--docker实验支持)
[![最新版本](https://img.shields.io/github/v/release/zqlrts60/mCodex?display_name=tag&label=release)](https://github.com/zqlrts60/mCodex/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f855a.svg)](LICENSE)

</div>

> [!NOTE]
> mCodex 是非官方社区项目。本 Fork 基于 [zqlrts60/mCodex](https://github.com/zqlrts60/mCodex)，增加实验性的 macOS 与 VPS 公网访问支持。Windows 10/11 为原有支持平台；两者都要求安装并登录官方 Codex Desktop。

https://github.com/user-attachments/assets/a5a2ce4b-d82e-484e-8de3-d4ceade51807

## 使用方式

### 1. 单文件 EXE（推荐）

从 [Releases](https://github.com/zqlrts60/mCodex/releases/latest) 下载 `mCodex-*-win-x64.exe`，完全退出 Codex Desktop，然后双击 EXE。程序会自动启动 Codex Desktop 和 mCodex，并打开电脑端页面。

适合大多数用户，不需要安装 Node.js，也不需要构建。EXE 暂未签名，Windows SmartScreen 可能提示“未知发布者”。

### 2. 便携 ZIP

从 [Releases](https://github.com/zqlrts60/mCodex/releases/latest) 下载 `mCodex-*-win-x64-portable.zip`，解压后完全退出 Codex Desktop，再双击 `start.bat`。

适合希望使用解压版的用户，包内已包含 Node.js。

### 3. 源码一键启动

需要 Node.js `20.19+` 或 `22.12+`：

```powershell
git clone https://github.com/supermancantfly007/mCodex.git
cd mCodex
.\manage.bat
```

`manage.bat` 会检查依赖、构建项目、以本地控制模式启动 Codex Desktop、启动 mCodex，并自动打开电脑端页面。

### 4. macOS + Docker（实验支持）

需要 macOS 12+、官方 Codex Desktop 和 Docker Desktop。Bridge、Web 界面及可选的 SSH 隧道均在本地 Docker 中运行，Mac 宿主机无需为 mCodex 安装 Node.js：

```zsh
git clone https://github.com/supermancantfly007/mCodex.git
cd mCodex
cp .env.docker.example .env.docker
# 编辑 .env.docker，至少填写 Codex Home 和项目根目录
```

第一次使用时，等 Codex 中的任务结束后，用 `Command-Q` 完全退出 Codex Desktop，再执行：

```zsh
./scripts/manage-docker.sh up
```

`up` 会先检查并按需原生启动 Codex，控制端口仅监听 `127.0.0.1:9222`，随后构建并启动 Bridge；启用 VPS 时也会启动隧道 sidecar。如果 Codex 正在运行但没有控制通道，脚本会安全退出并提示你先结束任务、完全退出 Codex，不会强制关闭它。

之后用以下命令启停即可。`down` 只停止 mCodex 与隧道容器，不会退出 Codex Desktop，也不会终止 Codex 任务：

```zsh
./scripts/manage-docker.sh status
./scripts/manage-docker.sh logs
./scripts/manage-docker.sh restart
./scripts/manage-docker.sh down
./scripts/manage-docker.sh open
```

`.env.docker` 包含本机路径和可选的 VPS 信息，已被 Git 忽略，不要提交。Bridge 只发布到 Mac 的 `127.0.0.1:3210`；容器通过 `host.docker.internal` 连接 Codex 的本地控制端口。

Docker Desktop 的 Start 按钮只能启动容器，不能执行 Mac 宿主机命令，因此无法自行拉起 Codex App。需要自动处理 Codex CDP 时请使用上面的 `manage-docker.sh up`；如果 Codex 已处于 CDP 模式，也可以直接在 Docker Desktop 中启停容器。

## 手机连接

### 同一网络

1. 使用上面任意一种方式启动 mCodex。
2. 手机和电脑连接同一个 Wi-Fi 或网络。
3. 扫描电脑页面上的二维码，或打开页面显示的地址并输入配对码。

配对码有效期为 10 分钟。配对成功后，设备会保持信任，直到保存的 Token 被撤销。

### 远程访问

不安装 Tailscale 等组网客户端，也可以通过“VPS Caddy + SSH 反向隧道 + Cloudflare Access”提供普通 HTTPS 网页入口。macOS Docker 方式把隧道作为 Compose sidecar 管理；在 `.env.docker` 中启用 VPS 配置后，`up` 和 `down` 会一起管理 Bridge 与隧道。详见 [VPS 公网部署指南](deploy/README_ZH.md)。只允许转发 mCodex 的 `3210` 端口，任何情况下都不要暴露 Codex 控制端口 `9222`。

## 可以做什么

- 按项目浏览任务并跟进实时输出
- 发送消息、后续指令和图片
- 停止任务并处理审批请求
- 查看修改文件及代码增删行数
- 创建项目和新任务
- 切换 Codex Desktop 权限模式

## 为什么需要 mCodex？

| 常见方案 | 实际痛点 | mCodex 的处理方式 |
| --- | --- | --- |
| **非官方账号、套壳客户端或中转服务** | 可能要求提交 Cookie、Token，或把请求发送到第三方中转，增加凭据与账号风险。 | mCodex 不接管登录、不代理模型请求，只复用 Codex Desktop 已有的官方登录态。 |
| **官方 ChatGPT 手机 App** | 它是独立的 ChatGPT 使用体验，并不是本机 Codex Desktop 项目、任务、审批和文件修改的移动视图。 | mCodex 可以直接在手机上保留当前 Desktop 任务上下文。 |
| **远程桌面工具** | 传输整个屏幕，手机上按钮细小，输入、滚动和精确点击都不方便。 | mCodex 提供响应式、触控友好的 Codex 工作界面。 |
| **仅支持 CLI 或架构复杂的工具** | CLI 不适合手机操作，多服务部署对控制一台个人电脑又过于复杂。 | mCodex 使用一个平台启动入口、一个本地 Bridge 和浏览器界面。 |

## 界面预览

<p align="center">
  <img src="readme/mobile-projects.jpg" alt="手机上的 mCodex 项目与任务列表" width="340">
  &nbsp;&nbsp;
  <img src="readme/mobile-task.jpg" alt="手机上的 mCodex 任务时间线与文件修改卡片" width="340">
</p>

![mCodex 启动终端，显示 Codex Desktop、局域网地址与配对信息](readme/terminal.png)

## 环境要求

- Windows 10/11，或实验支持的 macOS 12+
- Windows 安装 Microsoft Store 版 Codex Desktop；macOS 安装官方 Codex Desktop
- 手机或其他设备使用现代浏览器
- Windows 源码方式需要 Node.js；macOS Docker 方式不需要宿主机 Node.js

## 重要安全提示

- 使用内网穿透时保留配对鉴权，并妥善保护对外访问地址。
- 不要暴露或转发 Codex CDP 端口 `9222`。
- mCodex 不提供公网中转、用户账号或多用户隔离。
- 公网域名应增加 Cloudflare Access 等独立身份认证，并禁止代理 `/api/pairing-info`。
- 第三方内网穿透和远程组网可以作为连接方式，但其安全性和可用性由对应工具及使用者负责。

完整说明见 [SECURITY.md](SECURITY.md)。

## 故障排查

| 现象 | 处理方式 |
| --- | --- |
| Codex 控制离线 | 完全退出 Codex Desktop，再重新启动 mCodex |
| 手机打不开页面 | 同一网络下检查 `3210` 端口；远程使用时检查组网或内网穿透配置 |
| 配对码失效 | 重启 mCodex 获取新的配对码 |
| 启动失败 | 源码版或便携版可运行 `manage.bat logs` 查看日志 |
| macOS 提示 Desktop 正在运行但控制通道离线 | 等当前任务结束后，用 `Command-Q` 完全退出 Codex，再运行 `./scripts/manage-macos.sh cdp` |
| macOS 容器启动失败 | 运行 `./scripts/manage-docker.sh status` 和 `./scripts/manage-docker.sh logs`，并检查 `.env.docker` |

## 友情链接

- [**linux.do**](https://linux.do/)

## 许可证

本项目采用 [MIT License](LICENSE)。
