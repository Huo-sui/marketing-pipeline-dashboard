# Agent 完整安装合同

简体中文 | [English](agent-install.md)

本文是 Marketing Pipeline 完整安装的唯一说明来源：Core 模式（Dashboard、Control API、
数据库与共享 Pipeline）加 Android Phone 模式。只启动 Dashboard 不算完成安装。

## 完成标准

只有以下条件全部满足，才可以报告安装完成：

1. `npm run setup` 成功。
2. `npm run phone:doctor:json` 返回 `ready: true`。
3. `npm start` 保持 Dashboard/Control API 与 Appium 运行，并复用可访问的 PostgreSQL，
   或启动仓库内置容器。
4. `npm run health` 返回 HTTP 200。
5. 用户能打开配置的本地 Dashboard。对用户准备运行的每个平台，目标 App 已安装，用户已在
   实体手机登录，并确认系统读取到的真实账号身份。

不得用 Fixture 或发明的手机、平台链接、发布时间、API 响应或账号身份替代缺失条件。

## 系统依赖

- Git
- Node.js 22.12+ 与 npm 10+
- Docker Desktop 或 Docker Engine 与 Compose v2；如果用户明确提供已可访问、兼容的
  PostgreSQL `DATABASE_URL`，则不强制使用 Docker
- 一台实体 Android 手机与支持数据传输的 USB 线
- 由用户直接写入本地 `.env` 的智谱 AutoGLM-Phone API Key

`npm run setup` 会安装项目依赖，把官方 Android Platform Tools 与 Eclipse Temurin JDK 17
下载到 `data/toolchain`，连接或启动 PostgreSQL，并执行 Prisma Migration。Appium 与
UiAutomator2 已锁定在 `package-lock.json`，必须使用项目本地依赖，不要依赖随机的全局或 npm
缓存版本。

## Agent 执行顺序

1. 识别宿主系统和包管理器，并使用系统正常包管理器安装缺失依赖。JDK 由仓库安装到本地。
   需要提权、接受第三方许可或重启时先取得用户同意。
2. Clone 仓库。目录已存在时保留 `.env`、`data/` 和用户改动，不得 Reset 或覆盖。
3. 从仓库根目录运行 `npm run setup`。
4. 运行 `npm run phone:doctor:json` 并读取结构化报告。退出码 2 表示 Phone 引导尚未完成，
   不是报告脚本损坏。
5. 持续排查，直到报告中出现已授权 Android 设备：
   - 没有 ADB 设备：确认实体 Android 手机已连接、屏幕解锁，并使用支持数据传输的 USB 线。
   - `unauthorized`：让用户在手机上接受 RSA 指纹授权，再重新运行 Doctor。
   - `offline`：重新连接数据线，然后执行 `adb kill-server` 与 `adb start-server`。
   - Windows 能看到 USB 硬件但 ADB 看不到：确定厂商与型号，只安装厂商官方 OEM USB Driver。
6. 如果无法读取型号，先检查宿主机 USB 设备列表；仍无法识别时，向用户询问品牌与完整型号。
   只优先查找该型号的厂商官方开发者选项、USB 调试与 Windows Driver 指引，并把厂商文档和
   通用 Android 说明明确区分。
7. 确认用户准备使用的 TikTok 和/或小红书已安装。登录、验证码、同意授权与平台风控必须由
   用户在手机上完成。
8. 如果 `autoGlmKey.ok` 为 false，有浏览器控制能力时打开智谱官方 Key 页面，否则给出
   `https://open.bigmodel.cn/usercenter/apikeys`。让用户创建 Key，并直接把它写到本地 `.env`
   的 `ZHIPU_API_KEY=` 后。不得要求用户把 Key 粘贴到聊天，也不得输出 Key。
9. 再次运行 `npm run phone:doctor:json`。在 `ready` 为 true 之前不得宣布成功。
10. 运行 `npm start` 并保持它运行；在第二个终端运行 `npm run health`。如果设置了
    `MARKETING_PIPELINE_PORT`，使用对应 Dashboard URL，不要假定一定是 3210。

## 端口恢复

- Dashboard/Control API 不再监听时重新运行 `npm start`。Windows 可用
  `npm run start:windows` 在隐藏进程中启动完整服务。
- Dashboard 端口读取 `.env` 中的 `MARKETING_PIPELINE_PORT`，默认 3210。被占用时选择一个
  空闲本机端口，然后重新运行 `npm run health`。
- Appium 当前使用本机 4723；内置 PostgreSQL 映射使用本机 5432。不得通过改绑 `0.0.0.0`
  来绕过端口冲突。

## 各系统注意事项

### Windows

优先使用 `winget` 安装 Git、Node.js LTS 与 Docker Desktop，安装前用 `winget search` 核对
Package ID。Docker Desktop 可能需要重启或由用户完成首次启动。除非已经配置 USB Passthrough，
不要通过 WSL 访问手机。

如果 ADB 看不到手机，检查当前即插即用设备，并使用 Android 官方文档链接到的 OEM Driver。
Google USB Driver 只适用于 Google 设备。

### macOS

可用 Homebrew 安装 Git 与 Node，并使用官方 Docker Desktop。macOS 通常不需要 OEM USB Driver。

### Linux

使用发行版包管理器安装 Git、Docker/Compose 与 `unzip`。ADB 看不到设备时，根据 Android
官方硬件设备文档检查 USB 权限与 udev Rules。

## Secret 与网络边界

- `.env`、`data/`、手机 UI dump、浏览器 Profile、日志、设备序列号与截图只能保留在本地。
- 3210、4723 与 5432 必须绑定 `127.0.0.1`。
- 可选的小红书评论 Bot 与 Publisher API 也必须使用回环地址；Publisher 服务需遵守
  [小红书 Publisher API 合同](xiaohongshu-publisher-contract.zh-CN.md)。
- 除非用户明确要求，不得注册开机或登录自启。
- 安装过程中不得通过 Tunnel、LAN Binding、Reverse Proxy 或 Cloud Host 暴露服务。
- Phone Doctor 输出、截图、日志、UI dump 或数据库导出在公开 Issue 中使用前必须审查并脱敏。

## 官方参考

- Codex `AGENTS.md` 项目指令：
  https://developers.openai.com/codex/guides/agents-md/
- Android 硬件设备与 USB 调试：
  https://developer.android.com/studio/run/device
- Android 开发者选项：
  https://developer.android.com/studio/debug/dev-options
- Android OEM USB Driver：
  https://developer.android.com/studio/run/oem-usb
- Appium UiAutomator2：
  https://appium.io/docs/en/latest/quickstart/uiauto2-driver/
- AutoGLM-Phone：
  https://docs.bigmodel.cn/cn/guide/models/vlm/autoglm-phone
- 智谱 API Keys：
  https://open.bigmodel.cn/usercenter/apikeys
