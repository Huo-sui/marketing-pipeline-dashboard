# 参与 Marketing Pipeline

简体中文 | [English](CONTRIBUTING.md)

感谢参与 Marketing Pipeline。本项目仍处于 Alpha 阶段，并且可以操作真实 Android 手机与
已登录的社交平台账号，因此“如实说明能力”和“保护隐私证据”与代码质量同样重要。

## 提交 Issue 前

- 选择匹配的 GitHub Issue 表单，并先搜索是否已有相同问题。
- 删除 API Key、Cookie、账号 Handle、设备序列号、本机用户名路径、UI dump、截图、数据库
  导出与运行日志。无法通过脱敏片段说明时，请使用私密安全报告，不要提交公开 Issue。
- Phone 安装问题请提供系统、Node/npm 版本、手机厂商与型号、Android 版本，以及相关且已
  **脱敏**的 Phone Doctor 检查项。不要未经审查就附上完整报告。
- 写清实际结果、预期结果和最小稳定复现路径。

## 开发环境

```powershell
npm ci
npm run db:generate
npm run dev:local
```

只开发 UI 时可以不完成 Phone 模式；但任何声称新增或修复真实手机/平台能力的 Pull Request，
仍必须按 `docs/agent-install.md` 与 `AGENTS.md` 的要求做真实验证。

## 架构规则

修改平台工作流前，先判断改动类型：

- **共享 Pipeline 能力：**控制流只依赖 `PlatformAdapter`；标准化 Discovery、阈值、去重、
  保存、审计事件和审核保持平台无关。
- **平台专属能力：**包名、页面导航、弹窗、搜索页签、可访问性文案、分享链接、指标标签、
  日期格式、节奏和恢复行为只放在对应 Adapter 或 Playbook。
- **通用 Android Driver：**设备发现、ADB、Appium、UI source、点击、输入和剪贴板中不得
  混入平台页面语义。

不得用 Fixture、假链接、随机 external ID 或当前时间冒充发布时间，让真实平台接入看起来
成功。Mock 与 Fallback 必须显式命名、测试，并排除在生产成功路径之外。

## Pull Request 流程

1. 从 `main` 创建职责单一的分支。
2. 控制改动范围，避免无关格式化或依赖变动。
3. 行为、安装、安全或用户可见用词发生变化时，同步更新中文与英文公开文档。
4. 行为变化应新增或更新测试。
5. 运行：

   ```powershell
   npm run check
   ```

6. 完整填写 Pull Request 模板。把共享 Pipeline 改动与平台专属改动分开，列出真实设备验证
   证据，并明确仍未验证的内容。

纯文档改动不要求实体手机，但不得把未验证的 Phone 行为描述为可用。不要提交生成的
`dist/`、本地 `.env`、`data/`、浏览器 Profile、截图、APK 或日志。

提交贡献即表示你同意按 [Apache License 2.0](LICENSE) 授权该贡献。
