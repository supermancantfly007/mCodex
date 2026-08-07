# 参与贡献

感谢参与 mCodex。提交 Issue 或 Pull Request 前，请先确认改动符合项目的安全边界：mCodex 面向可信局域网和本机使用，不以公网多用户服务为目标。

## 开发环境

- Windows 10/11
- Node.js `20.19+` 或 `22.12+`
- 已安装并登录 Codex Desktop（需要控制功能时）

```powershell
npm ci
npm test -- --run
npm run build
```

## 提交改动

- 保持改动聚焦，避免顺手重构无关代码。
- 影响 CDP selector、鉴权、会话解析或文件访问的改动必须补测试或最小复现。
- 不要提交 `.env`、Token、会话 JSONL、日志、构建产物或真实用户数据。
- 用户可见行为变化请同步更新 README 或 CHANGELOG。
- Pull Request 请说明改动、测试结果和已知限制。

## 报告问题

请提供版本、Windows 版本、Codex Desktop 版本、复现步骤和脱敏日志。安全漏洞请按照 [安全政策](SECURITY.md) 私下报告，不要直接发布到 Issue。

