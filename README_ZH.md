<div align="center">

# mCodex

**专为 Windows 版 Codex Desktop 打造的手机控制端**

面向 Windows 10/11 的本地 Web 控制界面。Codex Desktop 留在电脑上，
你可以从手机查看进度、补充指令、处理审批并发起新任务。

[English](README.md) · [中文](README_ZH.md) · [更新日志](CHANGELOG.md) · [参与贡献](CONTRIBUTING.md)

[![Windows 10/11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?logo=windows)](#环境要求)
[![Node.js 20.19+](https://img.shields.io/badge/Node.js-20.19%2B-339933?logo=nodedotjs&logoColor=white)](#环境要求)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f855a.svg)](LICENSE)

</div>

> [!IMPORTANT]
> **Windows 是本项目优先且当前唯一支持的电脑端平台。** mCodex 面向 Windows 10/11 和 Microsoft Store 版 Codex Desktop；目前不支持以 macOS 或 Linux 作为主机。访问端可以是 Android、iPhone 或任意现代桌面浏览器。

> [!NOTE]
> mCodex 是非官方社区项目，与 OpenAI 无关。使用时仍需安装并登录官方 Codex Desktop。

mCodex 与 Codex Desktop 运行在同一台 Windows 电脑上。它只读解析 `CODEX_HOME` 中的本地任务记录，并通过本机 CDP 连接把交互操作交给 Codex Desktop 执行。mCodex 不增加云端中转服务，也不会上传你的对话。

<p align="center">
  <a href="readme/demo.mp4?raw=1">
    <img src="readme/demo-cover.jpg" alt="mCodex 在电脑端 Codex Desktop 与手机浏览器之间同步任务" width="900">
  </a>
</p>

<p align="center"><strong><a href="readme/demo.mp4?raw=1">观看 1 分 43 秒完整演示</a></strong></p>

## 为什么需要 mCodex？

Codex Desktop 的使用场景以电脑为中心。现有的手机端替代方案，往往需要改变账号或请求链路、离开 Desktop 的任务上下文、传输整个电脑画面，或者为个人局域网使用部署一套过重的系统。mCodex 只聚焦一个问题：**如何在手机上自然、安全地继续操作 Windows 电脑里的 Codex 任务。**

| 常见方案 | 实际痛点 | mCodex 的处理方式 |
| --- | --- | --- |
| **非官方账号、套壳客户端或中转服务** | 部分服务会要求提交 Cookie、Token，或把实际请求发送到第三方中转。这样既扩大了凭据暴露面，异常的会话与请求链路也可能增加额外验证、功能限制乃至账号封禁的风险。 | mCodex 不提供所谓“非官方账号”，不接管登录，也不代理模型请求；它复用 Codex Desktop 已经建立的官方 OAuth 登录态。 |
| **官方 ChatGPT 手机 App** | 手机端需要再次登录官方账号，但它仍是通用 ChatGPT 客户端，并不是 Windows 上 Codex Desktop 项目、工作区、运行中任务、审批和文件修改的移动视图；外部网络状况也可能让交互显得缓慢或不稳定。 | 手机浏览器无需再次提交 OpenAI 账号凭据，通过局域网连接 mCodex 即可保留 Desktop 任务上下文；模型请求仍由 Codex Desktop 通过官方服务完成。 |
| **ToDesk、向日葵等远程桌面** | 远程桌面传输的是整个屏幕。电脑与手机分辨率不同，按钮细小、文字输入、滚动和精确点击都不适合触屏，操作成本很高。 | mCodex 提供响应式、触控友好的任务界面，只呈现 Codex 工作流真正需要的信息和操作。 |
| **仅支持 CLI 或架构复杂的开源方案** | CLI 在手机上使用不便；多服务、数据库、容器或复杂网关对于只控制一台个人 Windows 电脑而言又显得臃肿。 | mCodex 保持克制：一个 Windows 启动入口、一个本地 Node.js Bridge 和一个浏览器界面，不强制依赖数据库或容器平台。 |

> [!TIP]
> mCodex 改善的是**访问与操控体验**，不是模型服务本身的网络连接。模型请求、账号状态、额度与官方服务可用性仍由 Codex Desktop 和 OpenAI 官方服务决定。

## 可以做什么

- 在手机上按项目浏览任务，实时跟进 Codex 输出
- 发送消息和后续指令、附加图片，或停止正在运行的任务
- 处理审批请求，查看并切换 Codex Desktop 权限模式
- 查看修改过的文件及代码增删行数
- 创建项目和新任务，不必回到电脑前操作
- 使用短期配对码接入可信局域网，已配对设备可持久信任

## 保持本地运行

| | mCodex 的处理方式 |
| --- | --- |
| 数据 | 直接读取本机 `CODEX_HOME` 中的任务记录，不修改会话文件 |
| 控制 | 交给已经登录的 Codex Desktop 执行 |
| 网络 | 默认只监听本机；局域网访问强制配对与 Token 鉴权 |
| 账号 | 不增加独立账号体系或托管后端 |

## 界面预览

<p align="center">
  <img src="readme/mobile-projects.jpg" alt="手机上的 mCodex 项目与任务列表" width="340">
  &nbsp;&nbsp;
  <img src="readme/mobile-task.jpg" alt="手机上的 mCodex 任务时间线与文件修改卡片" width="340">
</p>

<p align="center"><sub>浏览项目与任务，并跟进工具调用、文件修改、审批请求和后续消息。</sub></p>

## 工作方式

```mermaid
flowchart LR
    phone["手机浏览器<br>可信局域网"] <-->|HTTP + WebSocket| bridge["mCodex :3210"]
    bridge -->|只读| files["CODEX_HOME 会话 JSONL"]
    bridge -->|本地 CDP| desktop["Codex Desktop :9222"]
    desktop -->|实时运行状态| bridge
```

mCodex 从会话 JSONL 中读取对话和任务记录，从 Desktop CDP 获取运行状态。发送消息、停止任务、处理审批和创建任务都由 Codex Desktop 执行。

## 快速开始

### 环境要求

| 项目 | 要求 |
| --- | --- |
| 操作系统 | Windows 10/11（当前启动脚本使用 PowerShell 和 Microsoft Store 包） |
| Codex Desktop | 已安装并登录的 Windows Store 版 Codex Desktop（包名 `OpenAI.Codex`） |
| Node.js | `20.19+` 或 `22.12+`，并自带 npm；Vite 7 不支持旧版本 |
| 浏览器 | 手机或桌面上的现代浏览器，WebSocket 必须可用 |
| 网络端口 | Bridge 默认 `3210`；Codex CDP 默认 `9222`，只允许本机访问 |
| 可选 | Git（从仓库获取源码） |

> 首次启动前请完全退出普通模式的 Codex Desktop。Bridge 会用 `--remote-debugging-port=9222` 重新启动它；如果 Desktop 已在运行但没有 CDP，控制功能会不可用。

### 三步启动

1. 下载或克隆本仓库。
2. 完全退出普通模式的 Codex Desktop，然后双击项目根目录的 `manage.bat`，或运行：

```bat
manage.bat start
```

3. 在自动打开的电脑端页面中查看二维码，用连接同一 Wi-Fi 的手机扫码。

脚本会按顺序执行以下操作：

1. 检查 `winget`；缺少时打开 Microsoft App Installer 安装页
2. 检查兼容版本的 Node.js/npm；缺少时通过 `winget` 安装 Node.js LTS
3. 检查 Codex Desktop 是否已安装；缺少时停止并提示
4. 执行 `npm ci`，构建服务端和生产前端
5. 以本地 CDP 模式启动 Codex Desktop
6. 在 `0.0.0.0:3210` 启动 Bridge 并打开本地页面 `http://127.0.0.1:3210/`

首次安装 Node.js 时，Windows 可能弹出安装确认或 UAC 窗口；按提示完成后重新运行脚本。Codex Desktop 必须预先安装并登录。

### 启动成功后

![mCodex 启动终端，显示 Codex Desktop、局域网地址与配对信息](readme/terminal.png)

## 下载与安装

### 发布包

项目同时提供三种 Windows 发行形态：

```powershell
npm run release:source    # 源码 ZIP，适合开发者
npm run release:portable  # 便携 ZIP，内置 Node.js，无需 npm install
npm run release:sea       # Node SEA 单文件 EXE
npm run release            # 一次生成以上三种发行物
```

发行物会写入 `release/`（该目录默认不提交到 Git）：

- `*-source.zip` 保留源码、测试和 `manage.bat`；使用者需要自行安装 Node.js。
- `*-portable.zip` 内置 Node.js、预构建服务端和 Web 文件，解压后运行 `start.bat` 即可。
- `*.exe` 使用 Node 22 SEA，把服务端、Web 静态资源和 CDP 启动脚本嵌入单个 EXE；首次运行仍要求本机已安装 Codex Desktop。

SEA EXE 当前未做代码签名，Windows SmartScreen 可能显示未知发布者提示。正式对外分发时建议为 EXE 或安装包配置代码签名证书。CDP 启动使用独立的 `RemoteBridgeProfile` 配置目录，首次启动可能需要在 Codex Desktop 中重新登录。

启动完成后会自动打开电脑端页面。页面会显示局域网连接二维码和中文提示；手机与电脑连接同一 Wi-Fi 后，使用相机扫码即可自动配对。也可以手工打开局域网地址，例如 `http://192.168.1.20:3210/`，再输入启动窗口中的八位配对码。配对码有效 10 分钟，日志位于 `.run-logs\\bridge.out.log`。

### 手动启动

```powershell
npm ci
npm run build

# 另开一个窗口：启动带 CDP 的 Codex Desktop
powershell -ExecutionPolicy Bypass -File .\\scripts\\start-codex-cdp.ps1

# 本机只读开发/使用
npm start
```

手动启动默认只监听 `127.0.0.1:3210`，不会暴露到局域网。要开放局域网访问，请先设置强 Token：

```powershell
$env:BRIDGE_HOST = '0.0.0.0'
$env:BRIDGE_TOKEN = '请替换成至少 24 个字符的随机字符串'
npm start
```

手机首次打开页面后，输入启动日志中显示的配对码。配对成功后，Token 会保存在该浏览器的本地存储中。

## 管理命令

| 命令 | 用途 |
| --- | --- |
| `manage.bat` / `manage.bat start` | 启动 CDP、构建并启动局域网 Bridge |
| `manage.bat restart` | 重新执行一键启动 |
| `manage.bat stop` | 停止 Bridge 服务（不会退出 Codex Desktop） |
| `manage.bat status` | 查看 `3210` 和 `9222` 是否在线 |
| `manage.bat install` | 检查 Node.js 并安装 npm 依赖 |
| `manage.bat build` | 构建服务端和生产前端 |
| `manage.bat cdp` | 只启动带 CDP 的 Codex Desktop |
| `manage.bat lan` | 以 `0.0.0.0:3210` 启动 Bridge |
| `manage.bat logs` | 查看最近 Bridge 日志 |
| `manage.bat open` | 打开本机 Bridge 页面 |

## 局域网访问

一键启动已经监听 `0.0.0.0:3210`。手机和电脑连接同一个 Wi-Fi 后访问：

```text
http://<电脑局域网 IP>:3210/
```

Windows 防火墙若拦截 Node.js，请只允许家庭/专用网络访问 `3210`，不要为公网网络开放。不要转发 `9222`。

## 关于外网访问

mCodex 的设计和支持边界是**可信局域网**。项目本身不提供内网穿透、公网网关或托管中转服务。

如确有外网访问需求，可以自行结合 Tailscale、花生壳等第三方工具。其基本原理，是让手机与电脑加入同一个虚拟私有网络，或通过第三方服务把 mCodex 的局域网端口映射到其他网络。相比直接向公网暴露端口，Tailscale 一类的私有组网通常更合适，因为它不会创建面向所有互联网用户的公开入口。

> [!WARNING]
> 第三方组网和内网穿透不属于 mCodex 的功能与支持范围，其配置、可用性、隐私、账号、流量及安全风险均由对应服务商和使用者自行负责。**在适用法律允许的范围内，因使用此类方案造成的服务暴露、数据泄露、账号影响、入侵或其他后果，mCodex 项目及维护者不承担责任。**任何情况下都不要暴露或转发 Codex CDP 端口 `9222`。

## 配置

配置通过环境变量读取。`.env.example` 只是参考文件；项目没有加载 dotenv，不会自动读取 `.env`。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `BRIDGE_HOST` | `127.0.0.1` | 监听地址；非 loopback 地址会强制 Token 鉴权 |
| `BRIDGE_PORT` | `3210` | Bridge HTTP/WebSocket 端口 |
| `BRIDGE_TOKEN` | 空 | 外部监听时至少 24 个字符；留空会在 `CODEX_HOME/remote-bridge-token` 持久化生成，已配对设备重启后仍可访问 |
| `BRIDGE_TOKEN_FILE` | `CODEX_HOME/remote-bridge-token` | 自动生成的设备信任令牌保存位置；删除此文件即可让所有已配对设备重新配对 |
| `CODEX_HOME` | `%USERPROFILE%\\.codex` | Codex 会话目录 |
| `CODEX_CDP_URL` | `http://localhost:9222` | 本地 Codex CDP 地址（兼容 IPv4/IPv6 回环监听） |
| `BRIDGE_SCAN_INTERVAL_MS` | `500` | 会话目录扫描间隔（毫秒） |
| `MCODEX_LOCALE` | 自动检测 | 启动黑框和 SEA 程序的语言；可设为 `zh-CN` 或 `en-US`，未设置时跟随 Windows UI 语言 |

生成 Token 的示例：

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$env:BRIDGE_TOKEN = [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
```

生产环境建议使用密码管理器生成并设置 `BRIDGE_TOKEN`，不要把 `.run-logs`、`remote-bridge-token` 或 Token 提交到仓库、截图或聊天中。手机首次配对后，浏览器会保存设备令牌；后续重启 Bridge 不需要再次输入配对码。若需要撤销已有设备信任，停止 Bridge 后删除 `CODEX_HOME/remote-bridge-token`，再重新启动并配对。

## 开发与测试

```powershell
npm ci
npm run dev       # Vite: http://127.0.0.1:5173，API/WebSocket 代理到 3210
npm run build     # 类型检查 + 生产前端构建
npm test -- --run # Vitest 测试
```

开发模式下，若需要发送消息、停止任务或处理审批，仍需另行执行 `manage.bat cdp`。只查看已保存会话时可以不启动 CDP。

## API 速览

所有 `/api/*`（`/api/health`、`/api/pair` 和仅限本机访问的 `/api/pairing-info` 除外）以及 `/ws` 都需要 Token。API 默认使用 `Authorization: Bearer <token>`；图片读取 `/api/media` 和 WebSocket 使用 `?token=<token>`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查和鉴权状态 |
| `GET` | `/api/status` | Bridge、CDP 和会话目录状态 |
| `PUT` | `/api/permissions` | 切换 Desktop 的 `ask` / `auto` / `full-access` 权限模式 |
| `GET` | `/api/threads` | 任务列表 |
| `GET` | `/api/threads/:id/timeline` | 任务时间线与审批请求 |
| `GET` | `/api/media` | 读取指定任务历史消息引用的本地图片 |
| `POST` | `/api/threads/:id/open` | 切换 Desktop 当前任务 |
| `POST` | `/api/threads/:id/send` | 发送消息 |
| `POST` | `/api/threads/:id/follow-up` | 任务运行中发送后续消息；`mode` 为 `steer` / `queue` / `interrupt` |
| `POST` | `/api/threads/:id/stop` | 停止任务 |
| `POST` | `/api/threads/:id/approval` | `approve` / `reject` 审批 |
| `GET` / `POST` | `/api/projects` | 查询或创建项目 |
| `GET` | `/api/fs/roots` | 列出电脑快捷目录和盘符 |
| `GET` | `/api/fs/list` | 列出指定目录下的子文件夹 |
| `POST` | `/api/tasks` | 创建任务 |

发送消息和创建任务都必须携带 UUID 格式的 `clientMessageId`，用于避免重复提交。发送和后续消息还可携带最多 4 张图片；每张图片不超过 10 MB，支持 AVIF、GIF、JPEG、PNG 和 WebP：

```json
{
  "clientMessageId": "3f707e82-dd85-4d23-bf36-1fbf59a863d4",
  "content": "请分析这张截图",
  "images": [
    {
      "name": "screenshot.png",
      "mimeType": "image/png",
      "data": "<Base64 数据>"
    }
  ]
}
```

## 安全边界

- `9222` 始终绑定本机回环地址，不要通过端口转发或任何网络方式暴露
- 外部监听必须设置至少 24 个字符的 `BRIDGE_TOKEN`
- 配对码只在启动日志出现一次，10 分钟后失效，连续错误 10 次会锁定到 Bridge 重启
- Bridge 读取本地会话数据；发送、停止、审批和创建操作由 Codex Desktop 执行
- 内网穿透和第三方组网不属于项目支持的安全边界，相关风险由使用者自行承担
- 服务不包含多用户隔离、细粒度权限或审计系统，不适合作为公网 SaaS 直接部署

## 已知限制

- 电脑端仅支持 Windows 10/11 和 Microsoft Store 版 Codex Desktop；macOS 与 Linux 主机暂不支持
- Codex Desktop 更新后，CDP 页面控件或 selector 变化可能导致控制功能失效
- 电脑睡眠或 Desktop 完全退出后，只能看到最后一次已保存的会话状态
- 创建项目可在网页内浏览电脑目录并选择文件夹；也可继续手动输入绝对路径
- 当前启动脚本面向 Microsoft Store 版 Codex Desktop；其它安装渠道可能需要自行调整 `scripts/start-codex-cdp.ps1`
- 项目仅面向可信局域网，不内置公网穿透、账号体系或多用户隔离

## 故障排查

| 现象 | 处理 |
| --- | --- |
| `Node.js not found` | 安装 Node.js `20.19+` 或 `22.12+`，重新打开终端 |
| `Codex control: OFFLINE` | 完全退出 Codex，运行 `manage.bat cdp`，再用 `manage.bat status` 检查 `9222`；新版 Desktop 可能只监听 `::1`，请使用 `localhost` 而非固定的 `127.0.0.1` |
| 手机无法打开页面 | 确认电脑和手机位于同一可信局域网，再检查 Windows 防火墙及 `3210` 端口 |
| 配对码失效 | 配对码 10 分钟过期或尝试次数用尽，重启 Bridge 获取新码 |
| 页面能看但不能操作 | CDP 未上线；读取会话和桌面控制是两个独立能力 |
| Bridge 启动失败 | 运行 `manage.bat logs`，检查 `.run-logs\\bridge.err.log` |

## 项目结构

```text
src/
  server.ts                 HTTP API、鉴权、WebSocket
  cdp/controller.ts         Codex Desktop CDP 控制
  sessions/store.ts         会话读取
  sessions/watcher.ts       会话变化监听
  sessions/parser.ts        事件到时间线的解析
  runtime-status.ts         Desktop 运行状态合并
web/src/
  main.tsx                  React 页面和交互
  styles.css                移动端优先样式
scripts/                    Codex CDP 和环境启动脚本
scripts/manage.ps1          新电脑环境检测、安装和启动流程
manage.bat                  Windows 管理入口
```

## 参与贡献

欢迎提交 Issue 和 Pull Request。涉及 CDP selector、鉴权、会话解析或远程访问的改动，请同时补充测试或复现步骤，并在提交前运行：

```powershell
npm run build
npm test -- --run
```

## 许可证

本项目采用 [MIT License](LICENSE)。
