# 安全政策

简体中文 | [English](SECURITY.md)

Marketing Pipeline 是一个可以控制实体 Android 手机并与已登录社交平台 Session 交互的
本地优先应用。宿主机、手机、`.env`、PostgreSQL 数据和 `data/` 目录都应视为敏感数据。

## 支持版本

安全修复只面向默认分支上的最新代码。本项目仍处于 Alpha 阶段，目前不维护旧版本分支。

## 私密报告漏洞

请在本 GitHub 仓库中使用 **Security -> Advisories -> Report a vulnerability**。漏洞完成
初步处理前，不要提交公开 Issue。

报告中不得包含真实 API Key、Cookie、账号 Handle、设备序列号、UI dump、带账号资料的截图、
浏览器 Profile 或未经脱敏的数据库导出。请用能够证明问题的最小脱敏复现；维护者可通过私密
Advisory 继续索取必要信息。

以下情况通常是普通 Bug，不是安全漏洞：端口被占用、缺少 OEM USB Driver、ADB 设备为
`unauthorized`、平台页面布局变化，或在未泄露 Secret 的情况下得到预期的
`PUBLISHER_NOT_CONFIGURED`。

## 部署边界

- Dashboard/Control API、Appium 和仓库内置 PostgreSQL 端口映射必须绑定 `127.0.0.1`。
- 不得通过局域网绑定、Tunnel、Reverse Proxy、端口转发或公网 Cloud Host 暴露 3210、4723、
  5432。
- 本应用没有按多用户或公网服务做安全加固。
- 不得提交 `.env` 或 `data/` 下除 `.gitkeep` 外的任何内容。
- Provider 凭据只保存在本地 `.env`。用户必须在本地输入 Key；Agent 与 Issue 表单都不得要求
  用户把 Key 粘贴到聊天。
- 不操作手机时保持锁屏。本应用不会绕过设备安全，也不得保存锁屏凭据。
- 审查平台自动化动作，只操作你有权访问的账号与内容。

## 发布或附加诊断前

运行：

```powershell
npm run audit:privacy
```

之后仍需人工检查 Git Diff 与每个附件。自动扫描只是防护栏，不是内容可安全公开的证明。
Phone Doctor 会脱敏 ADB 序列号，但 OS、设备与 App 安装信息与其他细节组合后仍可能敏感。

## 第三方服务

TikTok、小红书、智谱 AI、Google、Appium、Android OEM 与用户配置的 HTTP Adapter 都有各自
条款、安全实践与可用性。本项目与这些服务无隶属或官方合作关系；账号安全、平台条款、版权、
隐私和适用法律仍由用户负责。
