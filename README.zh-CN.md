# 一人公司营销管线

> Solo Company Marketing Pipeline

简体中文 | [English](README.md)

[![CI](https://github.com/Huo-sui/marketing-pipeline-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/Huo-sui/marketing-pipeline-dashboard/actions/workflows/ci.yml)

一人公司营销管线是一套为一人公司、独立开发者和小团队设计的本地优先营销工作台。当前
版本通过一台 USB 连接的 Android 手机，按项目和话题抓取小红书、TikTok 的真实帖子，并把
它们归集到统一来源收件池（Dashboard 中的“爆帖分析”），同时保留原帖链接、作者、指标、
发布时间与运行证据。

它的目标不只是内容情报，而是一条可以每天自动运行、由一个人掌控终审的完整营销闭环：

`每日运行 -> 爆帖收集 -> 爆帖分析 -> 选题箱 -> 图片/视频与文案 -> 待审草稿 -> 指定或多账号发布 -> 智能回复`

## 平台支持与产品规划

### 当前支持

- **小红书：**内置混合 Adapter。配置本地 `xiaohongshu-mcp` 后优先用结构化 MCP 搜索与取详情；
  MCP 超时、登录/验证码/风控异常、字段合同不完整，或所有候选都没通过当前赞数、评论数和评分
  硬门槛时，自动回退到现有 Android Phone Adapter。未配置 MCP 时直接使用手机视觉链路。
- **TikTok：**内置 Android Phone Adapter，负责真实搜索与证据采集；当前复制分享链接路径会在
  声明的能力上使用智谱 AutoGLM-Phone 回退。

两条平台链路都要求目标 App 已安装、用户本人已登录、账号身份已在 Dashboard 确认，并且
Phone Doctor 返回 Ready。这里的“支持”指仓库已提供平台 Adapter 与统一入库链路，不代表每种
机型、地区、App 版本和账号状态都已完成真机验证。

### 计划支持

YouTube、Instagram、Reddit、抖音及其他主流内容平台都在扩展范围内。其中 Instagram、
Reddit、抖音和 X 已有可配置的 HTTP Discovery 合同入口，但仓库尚未内置对应外部服务，因此
不能视为开箱即用的平台支持；YouTube 仍处于规划阶段。

### 完整功能闭环

1. 根据项目方向和追踪话题，持续收集高表现帖子并进入爆帖分析池。
2. 结合来源帖子、评论与已有项目资产，拆解爆款结构、提炼痛点，并产出可编辑、可人工终审的选题。
3. 贯通原创文案、图片与视频生成；每份草稿保留来源选题、原帖和资产溯源。
4. 人工确认后，一键交给指定账号或多账号发布模块；各平台 Publisher 保持可替换、互不耦合。
5. 基于抓取的帖子与评论生成有证据来源的智能回复，并保留人工审核和平台风控边界。

产品目标是让一个人配置项目、话题、账号与每日运行时间后，系统持续完成收集、分析和准备
工作，把关键判断留给人。当前版本可以保存“每日 10:00”一类运行计划，但仓库尚未内置常驻
调度器；现在仍需手动运行已保存规则。自动按日运行、失败重试和通知属于下一阶段交付。

> **Alpha 状态：**真实 Android Phone 模式是产品组成部分，不是可选 Demo。仓库已经包含
> 爆帖分析、选题/灵感管理、待审草稿复刻、评论 Bot 合同与 Publisher 合同，但 Dashboard 不会
> 自行调用模型。评论 Bot、真实图片/视频生成 Provider 和手机发布服务不随仓库内置。能力不可用
> 时系统会明确报不可用，不会用 Fixture 或回退数据伪造成功。

## 目前能做什么

| 范围 | 当前状态 |
| --- | --- |
| 项目工作区 | 项目、话题追踪规则、账号绑定、资产、Idea、草稿记录和运行历史通过本地 Control API 保存到 PostgreSQL。 |
| 话题雷达 | 使用已保存的阈值运行 P0 规则；运行时不依赖 Agent 临时手工操作手机。 |
| Android Discovery | TikTok 与小红书拥有基于 ADB、Appium 和 UiAutomator2 的 Phone Adapter。TikTok 当前在复制分享链接时使用 AutoGLM-Phone 回退；小红书使用确定性平台 Playbook。 |
| 证据管线 | 保存真实 external ID 与 canonical URL、作者/标题/指标、Adapter 要求的发布时间证据、媒体类型、命中词、原始证据、指标快照、匹配关系与运行事件。 |
| 筛选 | 使用已保存的硬阈值；相对异常基线严格限制在同平台、同 TopicWatch、同追踪词和同发布年龄桶内。 |
| 爆帖分析 | 仓库级 `$viral-topic-analysis` Skill 读取经过隐私最小化的项目/证据 DTO，并保存严格校验、可版本追溯的拆解；不会自动通过选题，也不会补造缺失的媒体或评论证据。 |
| 选题与灵感 | **选题箱**支持可编辑、版本化、人工终审的选题；独立**灵感箱**保存痛点、反馈和灵感，并区分原帖、评论与分析推断。 |
| 待审草稿 | 已通过选题可生成独立版本化的 ContentDraft；`$content-draft-replication` 可写入原创文案、复用项目资产，或把原创生成图上传并登记为带来源的 Asset。每个版本锁定选题、原帖和实际使用的分析版本；视频仍是明确预留位。 |
| 评论采集 | Control API 与 Adapter 合同可调用独立部署的小红书评论 Bot 并保存标准化证据；仓库不内置 Bot，只有配置 `XIAOHONGSHU_COMMENT_BOT_BASE_URL` 后能力才会变为可用。 |
| 发布 | 已实现模块化、幂等的 Publisher 调用与真实回执校验；配置本机 `XIAOHONGSHU_PUBLISHER_BASE_URL` 后，人工确认可把锁定草稿交给手机发布服务。仓库不内置该服务，未配置时明确返回 `PUBLISHER_NOT_CONFIGURED`。 |

## 产品路线图

下面仍属于路线图，不代表当前已经完成：

- 增加常驻调度、失败重试与通知，让已保存规则可以每天自动运行。
- 接入真正的图片生成 Provider，并保存 Artifact 与来源，再增加可替换的视频生成模块。
- 实现并验证仓库外的平台专属评论 Bot、智能回复与 Phone Publisher 服务，并支持指定账号和
  多账号编排；只有显式批准后才会把 PublicationDraft 交给配置在回环地址上的服务。
- 为 YouTube、Instagram、Reddit、抖音等平台交付并真机/真实账号验证对应 Adapter。
- 为审计 Actor 增加经过认证的多用户身份；当前产品仍是只绑定回环地址的单 Workspace 本地工具。

每个阶段都应通过窄合同独立替换，让 Provider 或平台故障尽量只影响自身模块。

手机发布服务的中英文请求、回执、幂等与安全边界见
[小红书 Publisher API 合同](docs/xiaohongshu-publisher-contract.zh-CN.md)。

## 运行方式与设备支持

完整 Phone 模式使用一台通过 USB 数据线连接电脑的实体手机。手机可以长期保持连接；运行时
必须处于 ADB 已授权、App 可操作且账号有效的状态。底层是混合式手机自动化：ADB、Appium、
UiAutomator2 和平台 Playbook 负责确定性操作，智谱 AutoGLM-Phone 为明确声明的视觉/动作能力
提供回退（当前主要用于 TikTok Phone Discovery），并不是所有步骤都由视觉模型执行。

手机自动化减少了对非官方抓取或发布 API 的依赖，并复用真实 App 登录态，但**不等于零封号
风险**。平台仍可能触发验证码、限流、风控、功能变化或账号限制。请使用你有权操作的账号，
控制运行频率，遵守平台条款，并保留登录、验证码、授权和风险处置的人工作业。

当前只支持 Android，因为现有实现和真机验证环境都基于 Android。iOS/iPhone 在路线图内；如果
你能提供 iPhone、macOS/Xcode 环境或持续的真机测试反馈，欢迎通过 Issue 或 Pull Request 一起
推进 iOS Adapter。

## 完整安装

一人公司营销管线以一个本地安装包同时交付：

- **Core 模式：**Dashboard、本地 Control API、PostgreSQL 与共享 Pipeline。
- **Phone 模式：**通过 ADB、Appium 与 UiAutomator2 控制一台真实、已授权的 Android 手机。

只启动 Dashboard 可以用于 UI 开发，但不算产品完整安装。

### 前置要求

- Git
- Node.js 22.12+ 与 npm 10+
- Docker Desktop/Engine 与 Compose v2；如果 `DATABASE_URL` 已指向可访问的兼容 PostgreSQL，
  则可不使用 Docker
- 一台已解锁、通过 USB **数据线**连接的实体 Android 手机
- 手机已开启开发者选项与 USB 调试
- 已安装并由你本人登录准备使用的平台 App
- 对明确声明该运行依赖的能力提供智谱 AutoGLM-Phone API Key（目前是 TikTok Phone Discovery）

部分 Windows 手机还需要厂商官方 OEM USB Driver。Setup 脚本会从 Google 下载 Android
Platform Tools、从 Adoptium 下载 Eclipse Temurin JDK 17，并仅保存到已忽略的本地
`data/toolchain` 目录。Appium 与 UiAutomator2 是锁定版本的项目依赖。

### 让 Agent 安装

可以把下面任一提示词交给 Coding Agent：

- [Codex 安装提示词](prompts/CODEX_INSTALL_PROMPT.zh-CN.md)
  ([English](prompts/CODEX_INSTALL_PROMPT.md))
- [Claude Code 安装提示词](prompts/CLAUDE_CODE_INSTALL_PROMPT.zh-CN.md)
  ([English](prompts/CLAUDE_CODE_INSTALL_PROMPT.md))
- [Agent 安装合同](docs/agent-install.zh-CN.md)
  ([English](docs/agent-install.md))

Agent 必须读取 `AGENTS.md`，执行 Setup 与结构化 Phone Doctor，并持续排查到
`npm run phone:doctor:json` 返回 `ready: true`。登录、验证码、同意授权、USB RSA 授权和平台
风控操作必须由用户在实体手机上完成。

### 手动安装

```powershell
git clone https://github.com/Huo-sui/marketing-pipeline-dashboard.git
cd marketing-pipeline-dashboard
npm run setup
npm run phone:doctor:json
```

如果 Phone Doctor 提示缺少 API Key，请到
[智谱官方 API Keys 页面](https://open.bigmodel.cn/usercenter/apikeys)创建，然后直接写入仓库本地
`.env`：

```dotenv
ZHIPU_API_KEY=your-key-here
```

不要把 Key 粘贴到 Issue、聊天、日志、截图或 Git 提交中。然后继续：

```powershell
npm run phone:doctor:json
npm start
```

保持 `npm start` 运行，并在第二个终端执行：

```powershell
npm run health
```

打开 [http://127.0.0.1:3210](http://127.0.0.1:3210)。如果已在 `.env` 设置
`MARKETING_PIPELINE_PORT`，请改用对应端口。服务、Appium 和仓库内置 PostgreSQL 端口映射
都只绑定 `127.0.0.1`；不要把 3210、4723 或 5432 暴露给局域网或公网。

如需把已批准草稿交给独立的小红书手机发布服务，在 `.env` 中设置回环地址
`XIAOHONGSHU_PUBLISHER_BASE_URL` 和可选的 `XIAOHONGSHU_PUBLISHER_KEY`。服务必须实现
[Publisher API 合同](docs/xiaohongshu-publisher-contract.zh-CN.md)；未配置不会影响抓取、分析或草稿审核。

如需启用小红书 MCP 主抓取，在本机启动可信的
[xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp)，并在 `.env` 设置：

```dotenv
XIAOHONGSHU_MCP_BASE_URL=http://127.0.0.1:18060
XIAOHONGSHU_MCP_ACCOUNT_ID=<Dashboard 中已确认身份的小红书账号 UUID>
XIAOHONGSHU_MCP_TOKEN=
XIAOHONGSHU_MCP_TIMEOUT_MS=70000
XIAOHONGSHU_MCP_COOKIES_PATH=./data/runtime/xiaohongshu-mcp/cookies.json
XIAOHONGSHU_MCP_LOGIN_PROFILE_DIR=./data/browser-profiles/xiaohongshu-mcp-login
XIAOHONGSHU_MCP_EXPECTED_DISPLAY_NAME=<已确认账号昵称>
```

服务必须只绑定回环地址，且扫码账号必须与 `XIAOHONGSHU_MCP_ACCOUNT_ID` 对应的已确认账号一致；
缺少显式绑定或运行规则选择了不同账号时，MCP 会 fail closed 并使用手机回退。不要使用上游独立登录器的
临时 Chromium 页面；执行 `npm run xhs:mcp:login`，由项目使用真实 Google Chrome 的专用持久 Profile
完成扫码、账号昵称验证并把小红书 Cookie 写入 MCP 实际读取的同一路径。随后执行
`npm run xhs:mcp:doctor` 验证 MCP 可达和登录有效；仅扫码或点击登录不算成功。即使 MCP 已启用，仍需保持
`npm run phone:doctor:json` 为 Ready，才能保证验证码、风控、超时或低质量结果出现时可自动回退。

## Phone Doctor 状态

`npm run phone:doctor:json` 是机器可读安装状态的唯一依据。它会区分：

- ADB 未发现设备；
- 设备处于 `offline`；
- 设备等待 USB 调试授权（`unauthorized`）；
- 已授权 Android 设备，并提供脱敏序列号和可读取的厂商/型号/系统版本/App 安装信息；
- 无法读取机型，需要人工提供品牌与完整型号并查找厂商官方说明；
- Node.js、npm、Git、Docker/数据库、JDK、Platform Tools、Appium、UiAutomator2、
  DATABASE_URL 或 AutoGLM 配置缺失。

报告会列出 TikTok 与小红书是否已安装；但只有目标 App 已安装、用户已登录并在 Dashboard
确认真实账号身份后，对应平台工作流才算可用。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run setup` | 安装锁定依赖与 Phone 工具链、生成 Prisma Client，并对现有或仓库内置 PostgreSQL 执行迁移。 |
| `npm run phone:install` | 安装/验证仓库本地 Android Platform Tools、Temurin JDK 17、Appium 与 UiAutomator2 依赖。 |
| `npm run phone:doctor` | 输出便于人工阅读的完整 Phone 诊断。 |
| `npm run phone:doctor:json` | 输出供 Codex 或其他 Agent 使用的结构化报告。退出码 2 表示安装尚未完成。 |
| `npm run xhs:mcp:login` | 用真实 Google Chrome 专用 Profile 登录小红书，验证账号后保存到 MCP 的显式 Cookie 路径。 |
| `npm run xhs:mcp:doctor:json` | 验证小红书 MCP 回环服务可达且实际识别为已登录。 |
| `npm start` | 启动或复用 PostgreSQL、启动或复用 Appium，并在本地提供 Dashboard 与 Control API。 |
| `npm run health` | 验证配置端口上的 Control API 与数据库。 |
| `npm run check` | 执行隐私扫描、Lint、单元测试、Build 与高危依赖审计。 |
| `npm run start:windows` | 在隐藏 Windows 进程中启动完整本地服务。 |
| `npm run startup:register` | 用户主动选择后注册 Windows 登录启动；Setup 不会自动启用。 |

如果 Dashboard 端口已经掉线，请重新执行 `npm start`（Windows 也可使用
`npm run start:windows`）。如果端口被占用，请在 `.env` 选择空闲的
`MARKETING_PIPELINE_PORT`，然后重新运行健康检查。Appium 当前固定使用本机 4723 端口。

## 架构边界

控制层只依赖 `PlatformAdapter` 合同，不按平台名称分支。通用 Android 基础设施负责设备发现、
ADB/Appium、UI source、点击、输入与剪贴板。App 包名、页面导航、弹窗、搜索页签、可访问性
文案、分享链接、指标文案与日期格式只存在于对应平台 Adapter 或 Playbook。

进入 Pipeline 的 Discovery 记录必须来自真实证据。系统不会为了让运行通过而发明链接、
external ID、指标或发布时间。详见[架构 v0.1](docs/architecture-v0.1.md)、
[异常检测策略](docs/topic-radar-anomaly-policy.md)与 [AGENTS.md](AGENTS.md)。

## 隐私、账号安全与负责任使用

- `.env` 已被 Git 忽略，用于本地 Secret。
- `data/` 下除 `.gitkeep` 外全部忽略，因为其中可能包含资产、手机 UI 数据、账号标识、日志和
  下载的工具链。
- 浏览器 Profile、APK、截图、UI dump、数据库导出和运行日志不得提交或附加到公开 Issue。
- `npm run audit:privacy` 会扫描待发布文件中的常见 Secret、个人本机路径与禁止发布的运行产物。
- 应用必须只绑定 `127.0.0.1`；它没有按多用户或公网服务进行安全加固。
- 只操作你有权访问的账号与内容，并遵守平台条款、限流、版权、隐私和当地法律。

本项目与 TikTok、小红书、智谱 AI、Google、Appium 及其他被提及的平台/Provider 均无隶属
或官方合作关系。使用真实账号前请阅读 [SECURITY.md 中文版](SECURITY.zh-CN.md)。

## 参与贡献

```powershell
npm ci
npm run db:generate
npm run check
npm run dev:local
```

提交 Issue 或 Pull Request 前请阅读 [CONTRIBUTING.md 中文版](CONTRIBUTING.zh-CN.md)。仓库
维护者可参考 [GitHub 项目页文案与设置](docs/github-project-page.zh-CN.md)，其中给出了推荐的
About 描述、Topics、分支保护和发布清单。

## 许可证

本项目使用 [Apache License 2.0](LICENSE)。
