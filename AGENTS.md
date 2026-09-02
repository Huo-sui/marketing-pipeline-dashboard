# Marketing Pipeline 项目约束

本文件只作用于 `MarketingPipeline` 项目。实现或调试任一社交平台能力时，必须先判断改动属于“平台化能力”还是“平台专属能力”，并按以下边界落位。

## 平台化能力

- 控制层只依赖 `PlatformAdapter` 合同，不得通过平台名称分支实现账号预检、抓取运行、阈值筛选、去重、数据库保存、审计日志或选题箱/灵感箱展示。
- 手机基础设施（设备发现、ADB、Appium、UI source、点击、输入、剪贴板）属于通用移动端 Driver，不得写入某个平台页面语义。
- 所有平台的 Discovery 输出必须标准化为真实 `externalId`、真实 `canonicalUrl`、作者、标题、指标、发布时间、媒体类型、命中词、原始证据和真实封面截图证据。手机 Driver 提供通用截图字节，各平台 Adapter 决定截图时机；控制层统一保存为 `source_post` 的 `cover` ArtifactLink，前端不得读取平台专属封面字段。
- Adapter 必须显式声明运行依赖（账号绑定、已确认身份、手机 Runner、视觉 Provider）和采集必填字段清单；控制层不得用 `mode === phone` 推断 TikTok 规则。
- SourcePost upsert、SourceMetricSnapshot、SourcePostMatch、PipelineRun/RunEvent、幂等与来源候选池是统一 Pipeline 能力；原始帖子作为证据保留在话题雷达，只有由来源证据推导、可编辑并支持人工终审的 Idea 才进入“选题箱”。
- “灵感箱”中的灵感、痛点与反馈，以及“待审草稿”的版本、来源选题、原帖溯源和素材来源，同样属于统一 Pipeline 能力，不得写成小红书专属数据结构。
- 抓取 Bot 只负责原始数据与证据，不得计算入选分。控制层使用发布时间、点赞速度、评论速度与评论率计算三角评分；TopicWatch 的 `minLikes`、`minComments` 与 `minScore` 是三个必须同时通过的独立入选硬门槛，其中 `minLikes` 与 `minComments` 也用于校准评分曲线。`maxAgeHours` 只校准评分曲线，不作为独立入选门槛。相对异常只能使用同平台、同 TopicWatch、同追踪词、相近发布年龄的历史基线，不能跨平台比较，也不能用抓取时间冒充发布时间。
- UI 的“运行 P0 规则”必须调用已保存规则；不得依赖 Codex 临时操作手机或手工搬运结果。

## 平台专属能力

- App 包名、页面入口、弹窗文案、搜索页签、卡片可访问性描述、分享面板、链接格式、指标文案与日期格式只能存在于对应平台 Adapter 或 Playbook。
- 小红书专属实现位于 `server/platforms/xiaohongshuPhoneAdapter.ts`；通用 Android 操作位于 `server/mobile/androidPhoneDriver.ts`。
- 小红书 Adapter 必须在返回候选前完成作者、标题、互动量、发布时间、媒体类型、命中词、真实链接和详情首屏截图封面清单，并保存独立的发布时间与封面证据；当前候选缺字段时应继续采集或换选，不得把半成品交给评分阶段。
- TikTok、小红书或未来平台若需要不同风控节奏、特殊字段或回退行为，应通过 Adapter 声明或平台配置表达，不得污染统一数据模型和控制流程。

## 验收要求

- 不允许用伪造链接、随机 externalId、静态 fixture 或“当前时间冒充发布时间”让抓取成功。
- 平台接入完成必须验证：真实账号身份、真实搜索、真实分享链接、重复运行去重、SourcePost/Match/Metric 保存、RunEvent 可追溯。
- 调试报告必须分别列出平台化改动与平台专属改动；已知但未验证的页面行为不得描述为已完成。

## 完整安装与 Phone 模式

- 本项目的可交付安装必须包含真实 Android Phone 模式；仅启动 Dashboard 或数据库不算安装完成。
- 安装 Agent 必须完整读取 `docs/agent-install.md`，执行 `npm run setup` 和 `npm run phone:doctor:json`，并持续排查到报告返回 `ready: true`。
- 设备未发现时必须区分未连接、非 Android、`offline`、`unauthorized`、厂商 USB Driver 缺失和 USB 线不支持数据传输；不得把“ADB 命令存在”当作手机已就绪。
- 无法自动读取机型时，应先检查宿主机 USB 设备，再向用户索取品牌与完整型号，并优先查找厂商官方开发者模式、USB 调试和 Windows Driver 指引。
- API Key 必须由用户直接写入本地 `.env`，不得要求用户粘贴到聊天，不得回显或提交。
- 服务只允许绑定 `127.0.0.1`；不得在安装流程中擅自开启公网、局域网、隧道或反向代理访问。
