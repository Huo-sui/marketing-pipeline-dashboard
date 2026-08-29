# GitHub 项目页文案与设置

简体中文 | [English](github-project-page.md)

本文是维护者配置 GitHub 公开元数据的文案来源。About 建议使用英文以便全球检索，并在
README 顶部链接 `README.zh-CN.md` 服务中文读者。

## About

**推荐 Description（GitHub 主描述使用英文）**

> Solo Company Marketing Pipeline: local-first Android discovery for Xiaohongshu and TikTok, with a modular generation-to-publishing roadmap.

**中文对照**

> 一人公司营销管线：目前通过 Android 真机发现小红书与 TikTok 内容，按模块扩展到生成、发布与智能回复闭环。

**Website**

正式项目站点上线前留空。不要填写 localhost、临时 Tunnel 或个人主页 URL。

**Topics**

```text
content-intelligence
marketing-automation
social-media
local-first
human-in-the-loop
android-automation
appium
adb
xiaohongshu
tiktok
typescript
react
postgresql
solopreneur
creator-tools
```

真实能力完成并验证前，不要添加 `auto-publishing`、`comment-bot` 等会造成误解的 Topic。

## Repository Features

- 启用 **Issues** 并使用仓库内的 Issue Form。
- 在 Security 中保持 **Private vulnerability reporting** 开启。
- Discussions 可选；只有有人负责维护时再开启。
- 不要为了暴露本地 Dashboard 而启用公开 Pages。
- Social Preview 只能使用专门制作并通过隐私检查的图片；不要使用含项目、账号或设备信息的
  运行时截图。

## 建议 Labels

```text
type: bug
type: feature
type: documentation
area: installation
area: android-phone
area: platform-adapter
area: pipeline
area: ui
needs: reproduction
needs: real-device-validation
good first issue
```

安全漏洞必须使用 Private Advisory，不要用公开 `security` Label 处理。

## `main` 分支保护

- 合并前必须提交 Pull Request。
- 必须通过 `.github/workflows/ci.yml` Matrix 产生的两个检查：
  `check (ubuntu-latest)` 与 `check (windows-latest)`。
- 必须解决 Review Conversation。
- 禁止 Force Push 与删除分支。
- 管理员绕过只用于紧急恢复，并在随后的 Pull Request 或 Release 中记录原因。

托管 CI 能验证隐私规则、Lint、单元测试、Build 与依赖审计；GitHub Runner 没有维护者的实体
手机和已登录平台账号，所以它不能证明 Android Phone 已 Ready。

## Release Notes 模板

```markdown
## 本次变化 / What changed

- 用户可见结果

## 已验证 / Verified

- `npm run check`
- 已执行的 Core/人工路径
- 适用时列出真实设备/平台路径（不得包含私密标识）

## 当前限制 / Current limitations

- 仍不可用或未验证的能力

## 安装与升级 / Installation and upgrade

- 配置、Migration 或重启步骤

## 安全与隐私 / Security and privacy

- 数据边界变化，或“无变化 / No change”
```

Alpha Release 必须显式标记为 Prerelease。不得只根据 UI、Schema、Mock 数据或未配置的
Provider 记录，就宣称生成、评论分析、互动或发布已经可用。

## 发布前检查

1. 检查 `git status`、完整 Diff 和所有新追踪文件。
2. 运行 `npm run check` 并记录结果。
3. 发布前再次运行 `npm run audit:privacy`。
4. 确认 `.env`、`data/`、浏览器 Profile、截图、APK、UI dump、数据库导出与日志既未被
   Git 追踪，也未作为附件上传。
5. 确认中英文 README 链接正常且能力表一致。
6. 确认安装文档与 `package.json`、`scripts/setup.mjs`、`scripts/start.mjs`、
   `scripts/phone-doctor.mjs` 一致。
7. Release Notes 中把真实设备验证与未验证行为分开。
8. 确认服务仍只绑定 `127.0.0.1`。
