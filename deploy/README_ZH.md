# 通过 VPS 公网访问

这套部署不依赖 Tailscale。Mac 上的 mCodex 仍然只监听回环地址，Mac 主动建立 SSH 反向隧道，VPS 上的 Caddy 提供 HTTPS 网页入口。

```text
浏览器 → Cloudflare Access → VPS Caddy → SSH 反向隧道 → Mac mCodex :3210 → Codex CDP :9222
```

## 安全边界

- Codex CDP `9222` 必须始终只监听 Mac 的 `127.0.0.1`，不得转发到 VPS。
- 隧道模式必须设置 `BRIDGE_EXTERNAL_ACCESS=true`；`manage-macos.sh tunnel` 已自动设置。
- 公网域名前必须配置 Cloudflare Access 或同等的身份认证，只允许自己的账号。
- Caddy 必须阻止公网访问 `/api/pairing-info`，并关闭该站点的访问日志。
- SSH 私钥、真实域名、VPS 地址、Token 和修改后的启动脚本不得提交到公共仓库。

## 1. 验证 Mac 端

先完全退出 Codex Desktop，然后运行：

```zsh
./scripts/manage-macos.sh tunnel
./scripts/manage-macos.sh status
```

首次使用独立的远程控制 Profile 时，Codex Desktop 可能要求重新确认登录。Bridge 配对码会写入 `.run-logs/bridge.out.log`，也可在 Mac 本机打开 `http://127.0.0.1:3210` 查看。

## 2. 建立 SSH 反向隧道

复制 `examples/start-public-tunnel.sh.example` 到公共仓库之外，填写 VPS 地址、用户和私钥位置。默认命令在 VPS 的 `127.0.0.1:13210` 创建监听，因此适用于直接运行在 VPS 主机上的 Caddy。

如果 Caddy 位于 Docker：

1. 找出 Caddy 所在 Docker 网络的宿主机网关地址。
2. 让 SSH 远端转发只绑定该网关地址，而不是 `0.0.0.0`。
3. 将 Caddy upstream 改成同一网关地址和端口。
4. OpenSSH 默认 `GatewayPorts no` 会强制绑定回环地址；只在确认 VPS 防火墙后，为专用用户配置 `GatewayPorts clientspecified`。

不要为了让容器连接隧道而直接把端口暴露到 `0.0.0.0`。如果不得不这样做，必须同时用主机防火墙和云防火墙拒绝公网访问该端口。

## 3. 配置 Caddy 和 Cloudflare

把 `examples/Caddyfile` 中的域名和 upstream 合并到 VPS 的 Caddyfile。模板已经支持 WebSocket、最大 64 MB 请求体、禁止公网读取配对信息并关闭访问日志。

随后在 Cloudflare Zero Trust 中为该子域名创建 Access Application，只允许自己的邮箱或身份提供商账号。若 Cloudflare 使用 Full 模式且源站使用内部证书，可按现有 VPS 约定增加 `tls internal`。

## 4. 配置 macOS 自动重连

复制并修改：

- `examples/start-public-tunnel.sh.example`
- `examples/com.mcodex.public-tunnel.plist.example`

将私有启动脚本设为仅自己可读写执行，然后把 plist 放入 `~/Library/LaunchAgents/`。加载前先手工运行脚本确认 Codex、Bridge 和 SSH 隧道都能正常启动。

LaunchAgent 不会强制退出一个已经运行但未开启 CDP 的 Codex Desktop。遇到这种情况，需要先在 Mac 上用 `Command-Q` 完全退出 Codex，再让任务重新启动。
