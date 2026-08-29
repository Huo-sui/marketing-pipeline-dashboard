# Marketing Pipeline 总 Checklist

> 维护规则：每完成一项就勾选，并在同一项后补充日期、实现版本或链接。`[x]` 只代表当前状态已经有明确实现；Demo UI 不代表真实 API 已接入。

## 0. 产品边界与决策

- [x] 每个业务实体携带 `project_id`，Dashboard 以项目为第一层上下文
- [x] 抓取层只保存帖子事实、媒体证据、指标快照和 Agent 理由
- [x] Idea 层只消费人工通过的帖子，不越过人工筛选门
- [x] 生成层只执行批准后的 Idea 和版本化 CreativeSpec
- [x] 发布层只执行已确认的 PublicationDraft，不承载平台或账号决策
- [x] 确认第一个完整纵切平台为 TikTok（视频平台优先；后续平台通过独立 Adapter 复用领域模型）— 2026-08-14 产品确认
- [ ] 明确第一个项目、目标语言、目标市场和首批账号
- [ ] 明确内容保留周期、版权用途和删除策略

## 1. 前端控制台（本轮第一阶段）

- [x] 统一 App Shell、项目选择器、页面标题、筛选栏、Panel、状态 Badge 和批量操作条
- [x] 项目页展示追踪规则、账号、Prompt Pack 和资产数量入口
- [x] 新建与编辑项目复用同一套步骤式配置流程，覆盖项目资料、市场、语言、平台、追踪规则和可选配置 — 2026-08-14 Local Demo
- [x] 项目与一条或多条追踪规则通过同一次 Demo 工作区更新保存，不产生孤立规则 — 2026-08-14 Local Demo
- [x] 新项目保存后立即进入顶部项目选择器，并自动成为当前项目 — 2026-08-14 Local Demo
- [x] 项目和追踪规则保存到本地 Demo Provider，刷新页面后仍然存在 — 2026-08-14 Local Demo
- [x] 资产页与话题页严格按当前项目过滤，并为无数据项目显示独立空状态 — 2026-08-14 Local Demo
- [x] 项目支持可恢复归档；归档后退出活跃项目选择器，恢复后配置不丢失 — 2026-08-14 Local Demo
- [x] 追踪词手填入口
- [x] 追踪词支持别名、排除词、平台和运行计划
- [x] 追踪条件支持最低点赞、最低评论、发布时间窗口和最低评分
- [x] 追踪规则支持启停、编辑和 Demo 运行抓取
- [x] 抓取任务页展示抓取、分析、Idea、生成和发布运行记录
- [x] 帖子页支持缩略图/媒体类型、平台筛选、状态筛选和关键词搜索
- [x] 帖子详情抽屉展示原帖链接、外部 ID、抓取时间、指标和 Agent 抓取理由
- [x] 帖子详情展示评分拆解和视频 PatternCard（有分析结果时）
- [x] 帖子支持单选、全选、批量通过、批量拒绝和全部通过
- [x] Idea 页显示来源帖子和“只有人工通过内容才进入生成”的门槛
- [x] Idea 批次支持设置输出数量 N、类型、目标平台和额外要求
- [x] 视频 Idea 强制展示可编辑 Video Prompt / VideoSpec 区域
- [x] Idea 支持资产匹配、需要生图、不需要资产等判断状态
- [x] Idea 支持单条编辑、版本保存、批量批准和拒绝
- [x] 生成页展示文案、Prompt、Artifact ID、Provider、版本和审计入口
- [x] 生成审计支持编辑文案、编辑 Prompt、保存返工版本和标记可发布
- [x] 资产页支持按项目查看资产、标签、类型、使用范围和状态
- [x] 资产页提供资产元数据登记入口，并明确标注当前是 Demo 登记
- [x] TikTok 账号记录支持新建、编辑、归档和恢复，并为每条记录创建独立持久 Playwright Profile — 2026-08-15 Playwright Local 验收
- [x] 本地 TikTok Login Worker 支持通过 Dashboard API 打开、复用和关闭可见 Chrome Profile；账号页不保存密码 — 2026-08-15 Worker Smoke Test
- [x] 账号绑定向导收敛为“基本信息、人工登录、确认实际账号”，不提前配置项目角色、抓取规则或发布用途 — 2026-08-15 Desktop / Mobile Playwright 验收
- [x] 登录身份不一致时进入明确冲突状态，禁止静默覆盖；只有人工确认后才能切换绑定 — 2026-08-15 Local 实现
- [ ] 用真实 TikTok 账号完成人工登录，回读 User ID、Handle、昵称、头像和主页 URL，并确认刷新后身份记录仍存在
- [ ] 重启 Dashboard 后复用同一个 Profile，确认 TikTok 会话仍有效且登录身份与已绑定记录一致
- [x] 发布页只读展示执行状态、外部回执和发布时间样例，不包含平台或账号决策
- [x] 所有 Demo 动作明确显示 Demo，不伪装成真实抓取、生成或发布成功
- [ ] 用真实 API 替换 Demo Provider，页面不改平台专用响应结构
- [ ] 将页面状态从 React 本地状态迁移到服务端查询、Mutation 和任务订阅

## 2. 统一领域模型与 Control API

- [x] Prisma PostgreSQL schema、初始 migration、核心外键和本地 Artifact storage contract — 2026-08-19
- [x] Vite-hosted Control API、服务端 workspace snapshot 和明确的 `DATABASE_UNAVAILABLE` 错误 — 2026-08-19
- [x] React workspace 从 Control API 读取并写入项目、Topic、账号、SourcePost 审核、Idea、资产、生成任务和 PublicationDraft — 2026-08-19
- [x] 旧 Demo workspace localStorage 一次性迁移接口；迁移失败保留原始 localStorage — 2026-08-19

- [x] 定义并冻结 `ProjectProfile` — 2026-08-19 Prisma `Project`
- [x] 定义并冻结 `TopicWatch` — 2026-08-19 Prisma `TopicWatch`
- [ ] 定义并冻结 `CollectionRun`
- [x] 定义并冻结 `SourcePost`、`SourceEvidence` 和 `SourceMetricSnapshot` — 2026-08-19
- [ ] 定义并冻结 `PatternCard`
- [x] 定义并冻结 `Idea`、`IdeaRevision` 和 `ReviewDecision` — 2026-08-19
- [x] 定义并冻结 `AssetRecord` 和 `AssetMatch` — 2026-08-19
- [ ] 定义并冻结 `CreativeSpec`、`TextArtifact`、`MediaArtifact`、`Rendition`
- [x] 定义并冻结 `ReleaseBatch`、`PublicationDraft`、`PublicationReceipt` — 2026-08-19
- [ ] 定义并冻结 `AgentRun`、`ProviderRegistration` 和 `RunEvent`
- [ ] `POST /projects/:projectId/tracking-rules`
- [ ] `PATCH /tracking-rules/:id`、启停和条件版本化
- [ ] `POST /collection-runs`、`GET /collection-runs/:id`
- [ ] `GET /source-posts` 支持项目、平台、追踪规则、状态和指标筛选
- [ ] `POST /source-post-reviews:batch` 支持通过、拒绝和理由
- [ ] `POST /idea-runs` 接收 `source_post_ids`、数量 N、类型和约束
- [ ] `POST /idea-reviews:batch` 保存人工审计记录
- [ ] `POST /generation-runs` 和 `GET /generation-runs/:id`
- [ ] `POST /publication-drafts`、审批、执行和回调接口
- [ ] 使用 SSE/WebSocket 或轮询显示异步任务进度
- [ ] 所有异步任务携带 `project_id`、`job_id`、`trace_id`、`idempotency_key`、`provider_version`、`prompt_version`
- [x] 大媒体只通过本地 Artifact ID 传递，不塞进 JSON — 2026-08-19

## 3. 首个平台：Discovery 与 Extraction

- [ ] 用隔离测试账号完成一次 Agent + Playwright 可行性 Spike：登录、搜索、分页、打开帖子、提取指标、保存截图/媒体和恢复会话
- [ ] 对首个平台比较官方 API、第三方连接器与 Playwright Adapter，记录字段完整度、稳定性、成本、限流和人工接管点
- [ ] 确认自动化边界：平台 Adapter 负责确定性浏览器操作，Agent 负责语义判断、提取解释和页面变化后的修复建议
- [ ] 为首个平台实现独立 Adapter，不让平台字段泄漏到页面
- [ ] 为首个平台建立独立 Search/Extract Playbook、选择器回归样例和端到端验收数据集
- [ ] 建立隔离的持久浏览器 Profile 和登录状态
- [ ] 实现关键词搜索、分页、时间窗口和最大数量
- [ ] 保存 `canonical_url`、`external_id`、作者、原始标题、原始文本和平台字段
- [ ] 保存原始媒体、封面、截图或失败证据
- [ ] 保存点赞、评论、收藏、分享、播放等可获得指标
- [ ] 对不同平台缺失指标提供 `null` 和可解释的降级评分
- [ ] 对同一帖子按平台外部 ID、Canonical URL 和媒体哈希去重
- [ ] 对同一帖子被多个追踪词命中的情况保留多条命中关系，不重复保存帖子
- [ ] 实现限速、分页游标、超时、重试上限和任务取消
- [ ] 记录选择器、页面版本、浏览器版本和 Worker 版本
- [ ] 页面结构变化时进入人工接管或 Repair Agent，不直接静默成功

## 4. 媒体证据与视频 Pattern

- [ ] 调研并基准测试现有“爆款视频转复刻 Prompt”工具，不在验证前假设某个轮子可直接生产使用
- [ ] 用 FFmpeg 统一视频格式、分辨率、音频和关键帧
- [ ] 用 PySceneDetect 提取镜头边界和镜头节奏
- [ ] 用 WhisperX 提取带时间轴的语音文本
- [ ] 用 OCR 提取字幕、贴纸和画面文字
- [ ] 用多模态模型输出结构化 `PatternCard`
- [ ] 同时保存关键帧故事板、转录/OCR、PatternCard 和复刻 Prompt，任何下游 Agent 都通过 Artifact ID 读取同一版本
- [ ] PatternCard 至少包含 Hook 时间、镜头节奏、结构、证明点、CTA 和可替换元素
- [ ] 保存分析输入 Artifact、输出 JSON、模型版本和 Prompt 版本
- [ ] 将原帖视频视为分析证据，不默认视为可发布素材
- [ ] 把供应商无关的 Pattern/CreativeSpec 转换成具体视频模型 Prompt
- [ ] 支持人在 Idea 层修改 VideoSpec，并保留修订前后差异

## 5. 人工筛选门

- [ ] 抓取完成后状态为 `pending_review`，不能自动进入 Idea
- [ ] 支持单条通过、单条拒绝、全部通过和部分通过
- [ ] 支持填写拒绝原因和备注
- [ ] 记录操作人、时间、对象版本和来源任务
- [ ] 只有 `approved` 的 SourcePost 才能作为 Idea 输入
- [ ] 通过后锁定本次输入快照，避免运行中途来源变化
- [ ] 支持重新打开审核和追加人工备注

## 6. Idea 层

- [ ] Idea 记录来源帖子 ID、PatternCard ID 和生成批次 ID
- [ ] Idea 判断类型：视频、图文、评论或纯文本
- [ ] 视频 Idea 必须包含 VideoSpec/Prompt，不允许为空
- [ ] Idea 读取项目资产库并返回匹配候选及匹配理由
- [ ] 匹配到资产时直接引用 Asset ID，不重复生图
- [ ] 无匹配资产时携带生图 Prompt 交给生成 Agent
- [ ] 生成数量 N 支持 1–50，并显示预计成本和预计任务数
- [ ] Idea Agent 输出结构化 JSON，失败时保留原始响应和错误
- [ ] Idea 支持人工编辑 Hook、文案、Prompt、资产决策和目标平台
- [ ] Idea 审核完成前不能创建生成任务
- [ ] 对重复 Idea 做标题、语义和来源结构去重

## 7. 资产、文案与生成层

- [ ] 项目资产支持截图、录屏、Logo、音频和其他类型
- [ ] 资产有标签、尺寸、方向、透明度、许可状态和使用范围
- [ ] 资产支持视觉检索或结构化标签匹配
- [ ] 文案统一通过可配置的文本 Provider 生成
- [ ] 首个文本 Provider 接入 Gemini 3.x；接入时确认真实可用 Model ID、区域、配额与降级模型，不把版本名写死在业务代码
- [ ] 每份文案都有独立 `text_artifact_id`，不能用空 ID 表示纯文本
- [ ] 纯文本成果的 `media_artifact_id` 使用 `null`；禁止空字符串 ID，文本仍通过 `text_artifact_id` 和 `idea_id` 溯源
- [ ] 每份图片/视频都有独立 Artifact ID、版本和父 Idea ID
- [ ] 支持图文直接复用资产、无资产时进入生图管线
- [ ] 生图 Provider（如 Stable Diffusion）通过统一 Adapter 接入，保存模型、参数、Seed 和输入资产版本
- [ ] 支持视频 Prompt Agent 将 Idea 转成可执行 VideoSpec
- [ ] 视频 Provider（如 CapCut/剪映、千问或其他模型）通过统一 Adapter 接入，并基准测试质量、成本、时延和可控参数
- [ ] 为生成管线“开窗”：按文案、分镜/关键帧、Prompt、粗剪和最终渲染设置可暂停检查点
- [ ] 检查点允许修改 Prompt、资产、Provider 参数和 Seed 后只重跑当前阶段，不必整条黑盒管线重来
- [ ] 支持生成中、待审计、已通过、失败、可重试和需要人工接管
- [ ] 支持查看生成成本、Provider、模型版本和 Prompt 版本
- [ ] 支持返工并生成新版本，不覆盖旧结果

## 8. 发布层与账号策略

- [ ] 平台选择与账号绑定发生在生成层决策页面，而不是 Publisher 内部
- [ ] 项目筛选后才能选择项目内账号
- [ ] 同一个平台版本只能绑定一个账号
- [ ] 同一个内容使用感知哈希和文案相似度防止重复投放
- [ ] 不同平台创建不同 Platform Rendition，不直接复用同一个发布对象
- [ ] 发布前展示平台预览、文案、媒体、账号和排期
- [ ] Publisher 只接受已批准的 PublicationDraft
- [ ] 每个平台单独评估官方发布 API、第三方 Publisher 与 Playwright 发布，确定主路径和人工接管路径
- [ ] 为每个账号建立持久浏览器 Profile、写锁和限速器
- [ ] 发布成功回调状态、平台帖子 ID 和具体发布时间
- [ ] 发布失败回调错误类型、截图、DOM 快照和是否可安全重试
- [ ] `UNKNOWN` 提交结果禁止自动重试，必须先核对草稿和最近发布记录
- [ ] 账号登录过期、风控挑战和验证码进入人工接管状态

## 9. 运营、审计和质量

- [ ] 统一日志、Trace ID、Agent Run、Provider 版本和 Prompt 版本
- [ ] 所有人工决策可追溯、可导出、可按项目筛选
- [ ] 增加成本预算、每日任务上限和模型用量统计
- [ ] 增加抓取成功率、入选率、Idea 通过率、生成失败率和发布成功率
- [ ] 增加发布后的点赞、评论、收藏、播放和转化回流
- [ ] 建立来源数据保留、删除和版权审计流程
- [ ] 建立平台条款、账号风险和内容安全检查清单
- [ ] 为每个平台维护 Selector/Playbook 回归样例
- [ ] 为关键任务建立人工接管和恢复 Runbook
- [ ] 对所有外部边界设置超时、熔断、幂等和重试策略

## 10. 验收路径

### 小红书 P0 链路

- [x] 示例项目可声明小红书与 TikTok 双平台
- [x] 已确认的小红书账号可以 Discovery 角色绑定项目
- [x] 项目可以保存多条 P0 追踪规则
- [x] 通用 Android Driver 与小红书页面 Playbook 分层
- [x] 平台 Adapter 显式声明运行依赖和采集必填字段清单
- [x] 话题雷达提供“运行 P0 规则”单击入口
- [x] 实机解锁状态下完成真实搜索、发布时间定位、复制分享链接和话题雷达来源候选池写入验收
- [x] 对同一规则重复运行，确认 SourcePost 去重且 MetricSnapshot/RunEvent 追加
- [x] 小红书发布时间采用详情正文滚动定位并保存原始日期证据；候选缺字段时在 Adapter 内继续采集或换选，不向硬阈值阶段提交半成品
- [x] 相对异常基线限定为同平台、同 TopicWatch、同追踪词、同发布年龄桶，并纳入点赞速度、评论速度和评论率

- [x] 手动创建一个项目和一条追踪规则 — 2026-08-14 Playwright Local Demo 验收
- [ ] 手动调整点赞、评论、时间和评分阈值
- [ ] 运行一次首个平台抓取任务并看到任务进度
- [ ] 在话题雷达来源候选区查看缩略图、原帖链接、指标和 Agent 理由
- [ ] 通过全部、通过部分、拒绝部分帖子
- [ ] 只用通过的来源帖子生成 N 条可编辑选题，并进入“选题箱”人工终审
- [ ] 审核一条视频 Idea，并修改 VideoSpec
- [ ] 复用一条项目资产生成图文或视频草稿
- [ ] 编辑文案并生成新 Artifact 版本
- [ ] 选择一个平台和一个项目账号创建 PublicationDraft
- [ ] 验证无账号、登录过期、生成失败和发布未知状态的 UI
- [ ] 验证桌面端、移动端、空状态、加载状态、错误状态和长文本布局
