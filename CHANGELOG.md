# 更新记录

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
