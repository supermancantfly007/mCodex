# 通过 VPS 公网访问

这套方案不依赖 Tailscale。Codex Desktop 原生运行在 Mac，mCodex Bridge 和 SSH 反向隧道运行在本地 Docker；VPS 上的 Caddy 提供普通 HTTPS 网页入口。

```text
浏览器
  → Cloudflare Access
  → VPS Caddy（HTTPS，可再加 Basic Auth）
  → VPS 内部 socket proxy
  → 仅监听 VPS 127.0.0.1 的 SSH 反向隧道
  → Mac Docker 中的 mCodex :3210
  → host.docker.internal:9222
  → Codex Desktop
```

## 安全边界

- Codex CDP `9222` 必须始终只监听 Mac 的 `127.0.0.1`，不得发布到局域网、Docker 端口或 VPS。
- mCodex 只发布到 Mac 的 `127.0.0.1:3210`；SSH sidecar 通过 Compose 内部网络访问它。
- SSH 远端端口只监听 VPS 的 `127.0.0.1`，不得使用 `0.0.0.0`。
- 公网域名前必须配置 Cloudflare Access 或同等身份认证，只允许自己的账号。Caddy Basic Auth 可作为第二层保护。
- Caddy 必须禁止公网读取 `/api/pairing-info`，并丢弃该站点访问日志，避免设备 Token 出现在日志中。
- `.env.docker`、SSH 私钥、真实域名、VPS 地址和密码不得提交到公共仓库。

## 1. 配置 Mac

复制环境变量模板：

```zsh
cp .env.docker.example .env.docker
chmod 600 .env.docker
```

至少填写：

```dotenv
MCODEX_HOST_CODEX_HOME=/Users/you/.codex
MCODEX_HOST_PROJECTS_ROOT=/Users/you/workspace
MCODEX_LOCAL_PORT=3210

MCODEX_VPS_ENABLED=true
MCODEX_VPS_HOST=vps.example.com
MCODEX_VPS_USER=mcodex-tunnel
MCODEX_VPS_TUNNEL_PORT=13210
MCODEX_VPS_SSH_KEY=/Users/you/.ssh/mcodex-tunnel
```

SSH 私钥应设为 `600`。第一次使用本地控制通道时，先等 Codex 当前任务结束，再用 `Command-Q` 完全退出 Codex Desktop，然后运行：

```zsh
./scripts/manage-docker.sh up
```

`manage-docker.sh up` 会先检查并按需原生启动 Codex 控制通道，再由 Compose 启动 Bridge 与隧道。如果 Codex 正在运行但没有控制通道，脚本不会强制退出它，而是提示等待当前任务结束后手工完全退出。日常命令：

```zsh
./scripts/manage-docker.sh status
./scripts/manage-docker.sh logs
./scripts/manage-docker.sh restart
./scripts/manage-docker.sh down
./scripts/manage-docker.sh open
```

`down` 不会退出 Codex Desktop，也不会停止正在执行的 Codex 任务。

Docker Desktop 的 Start 按钮不能执行 Mac 宿主机命令。需要自动拉起 Codex CDP 时必须使用 `manage-docker.sh up`；Codex 已处于 CDP 模式时才可直接用 Docker Desktop 启停。

## 2. 限制 VPS 上的 SSH 隧道

建议创建无登录 shell 的专用用户，例如 `mcodex-tunnel`，并只授权远程端口转发。对应公钥的 `authorized_keys` 选项应限制监听目标，例如：

```text
restrict,port-forwarding,permitlisten="127.0.0.1:13210" ssh-ed25519 AAAA... mcodex-tunnel
```

在 `sshd_config.d` 中进一步限制该用户：只允许 remote forwarding、禁止 TTY/agent/X11，并保留 `GatewayPorts no`。修改后先运行 `sshd -t`，再 reload SSH 服务。

隧道最终必须是：

```text
VPS 127.0.0.1:13210 → Mac Compose 服务 mcodex:3210
```

## 3. 让 Docker 中的 Caddy 访问回环隧道

如果 Caddy 直接运行在 VPS 宿主机，可将 upstream 指向 `127.0.0.1:13210`。

如果 Caddy 运行在 Docker，它无法直接访问宿主机回环地址。推荐用 `systemd-socket-proxyd` 建一个仅绑定到 Caddy Docker 网络网关的代理端口：

```text
Caddy 容器 → Docker 网关:13211 → VPS 127.0.0.1:13210
```

先用 `docker network inspect` 确认 Caddy 网络的宿主机网关地址，再让 `.socket` 单元只监听该地址。不要把代理端口绑定到 `0.0.0.0`，也不要为了容器连通性放宽 SSH 的回环监听限制。

如果 VPS 的 `INPUT` 防火墙默认拒绝连接，还必须只允许 Caddy Docker 网段访问这个网关端口，否则 Caddy 会返回 `502`，而 `127.0.0.1:13210` 上的隧道本身仍可能完全正常。例如 Caddy 网络为 `172.19.0.0/16`、网关为 `172.19.0.1` 时：

```bash
sudo iptables -I INPUT \
  -s 172.19.0.0/16 -d 172.19.0.1/32 \
  -p tcp --dport 13211 -m conntrack --ctstate NEW \
  -m comment --comment mcodex-caddy-proxy -j ACCEPT
```

应通过 VPS 使用的防火墙管理工具持久化该规则，例如已安装 `iptables-persistent` 时运行 `sudo netfilter-persistent save`。不要放行公网接口上的 `13211`。最后分别从 VPS 宿主机检查 `127.0.0.1:13210`，并从 Caddy 容器检查网关的 `13211`，两者都应返回 mCodex 健康响应。

## 4. 配置 Caddy 和 Cloudflare

把 [`examples/Caddyfile`](examples/Caddyfile) 中的站点合并到 VPS Caddyfile，并替换域名与 upstream。模板包含：

- WebSocket 反向代理；
- 64 MB 请求体上限；
- `/api/pairing-info` 返回 `404`；
- 安全响应头；
- 丢弃访问日志。

源站使用内部证书并由 Cloudflare 代理时，可按现有约定增加 `tls internal`。建议再加一层 Caddy Basic Auth，凭据只保存在 VPS 的 `600` 权限文件中。

Cloudflare 侧需要：

1. 确认该子域名的 DNS 记录已开启代理；
2. 创建 Self-hosted Access Application；
3. 目标设为完整 mCodex 域名；
4. Allow 策略只包含自己的邮箱或身份提供商账号。

## 5. 检查与运维

在不触碰 Codex Desktop 的情况下，可以执行：

```zsh
./scripts/manage-docker.sh config
./scripts/manage-docker.sh status
```

需要查看隧道重连情况时运行 `./scripts/manage-docker.sh logs`。VPS 侧同时检查 SSH 登录日志、socket proxy 状态和 Caddy 日志；不要在命令输出或文档中打印密码、私钥或完整设备 Token。

`deploy/examples/start-public-tunnel.sh.example` 和 LaunchAgent plist 是早期宿主机 Node/SSH 方案，仅为已有部署保留。新的 macOS 部署应使用 `compose.yaml` 与 `scripts/manage-docker.sh`。
