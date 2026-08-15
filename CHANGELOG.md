# 更新记录

## [Unreleased]

### Added

- 增加实验性的 macOS 源码启动与管理脚本，支持官方 Codex Desktop
- 增加 Windows/macOS 任务深链平台适配及自动化测试
- 增加 VPS Caddy、SSH 反向隧道、Cloudflare Access 和 LaunchAgent 公网部署模板
- 增加 macOS Docker Compose 启动方式，将 Bridge/Web 与 SSH 反向隧道作为本地容器统一启停
- 增加原生常驻 macOS 控制 App，不依赖 Docker，直接管理 Bridge 与 SSH 隧道，并显示、手动刷新和自动轮换配对码
- 增加 iPhone 主屏幕 Web App 的任务完成通知，支持测试通知和点击直达对应会话

### Changed

- macOS 推荐启动方式改为原生控制 App；Docker Compose 作为可选运行方式保留
- `manage-docker.sh up/restart` 会先检查并按需启动 macOS Codex CDP，不再要求单独执行 CDP 命令

### Security

- 新增 `BRIDGE_EXTERNAL_ACCESS`，允许 Bridge 只监听回环地址时仍强制启用配对和设备 Token 鉴权
- 公网部署模板禁止代理本机配对信息，并默认丢弃可能包含 Token 的访问日志
- Web Push 的 VAPID 私钥与设备订阅仅保存在权限为 `600` 的本地状态文件中，锁屏通知不包含回答正文

## [0.1.1] - 2026-08-12

### Fixed

- 修复手机端新建对话缓慢的问题：任务一旦落盘即返回，不再等待二次全文确认，并避免反复全量扫描历史会话
- 修复对话框长时间显示"正在连接当前任务的控制…"的问题：过期或断开的任务切换请求会被取消，不再阻塞后续操作，等待上限收紧为 10 秒

## [0.1.0] - 2026-08-07

### Added

- 通过局域网网页查看和操作 Codex Desktop 任务
- 会话时间线、实时运行状态和图片消息
- 消息发送、停止、审批和后续指令
- 项目和新任务创建
- 配对码和设备信任 Token
- Windows source、portable 和 SEA EXE 发布形式
- 配对信息仅允许本机读取，并限制 API 查询参数 Token 的使用范围

### Notes

- 当前版本为 experimental。
- 仅支持 Windows 10/11 和 Windows Store 版 Codex Desktop。
- Codex Desktop 更新后，CDP selector 变化可能影响控制功能。
