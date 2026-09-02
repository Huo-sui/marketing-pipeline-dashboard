import type { AccountRecord, AssetRecord, AutomationProfileRecord, GenerationJob, IdeaRecord, ProjectAccountBinding, ProjectRecord, RunRecord, SourcePost, TopicWatch } from "../types";

// Explicit local demo data. Replace one resource at a time through the Refine data provider.
export const projects: ProjectRecord[] = [
  { id: "atlas", name: "Project Atlas", type: "独立游戏", stage: "Pre-production", description: "独立游戏内容增长工作区", targetMarkets: ["中国大陆", "北美"], languages: ["中文", "English"], platforms: ["小红书", "抖音", "TikTok", "Reddit", "X", "Instagram"], timezone: "Asia/Shanghai", status: "active", accountIds: [], topics: 6, channels: 6, cadence: "每日", locale: "中文 / English", assetCount: 18, promptPackVersion: "v0.1" },
  { id: "reader", name: "Reader Lab", type: "阅读应用", stage: "Beta", description: "阅读产品内容验证工作区", targetMarkets: ["中国大陆", "北美"], languages: ["中文", "English"], platforms: ["小红书", "Reddit", "X"], timezone: "Asia/Shanghai", status: "active", accountIds: [], topics: 0, channels: 3, cadence: "待配置", locale: "中文 / English", assetCount: 9, promptPackVersion: "v0.1" },
  { id: "language", name: "Language Sprint", type: "语言学习", stage: "Research", description: "语言学习内容方向研究", targetMarkets: ["北美"], languages: ["English"], platforms: ["TikTok", "Instagram"], timezone: "America/Toronto", status: "active", accountIds: [], topics: 0, channels: 2, cadence: "待配置", locale: "English", assetCount: 4, promptPackVersion: "v0.0" },
];

export const initialSourcePosts: SourcePost[] = [
  {
    id: "post-01", platform: "TikTok", author: "@smallstudio", title: "失败画面先出现，3 秒后才揭示真正的核心机制", body: "",
    topic: "#indiedev", published: "2 小时前", likes: 18400, comments: 612, score: 94,
    reason: "互动速度位于话题前 2%，评论集中讨论核心机制", mediaType: "视频",
    image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=720&q=80",
    canonicalUrl: "https://www.tiktok.com/@smallstudio/video/demo-post-01", sourceLink: { usable: true }, externalId: "tt-demo-001", capturedAt: "今天 10:04",
    evidence: { signals: ["互动速度位于话题前 2%", "评论集中讨论核心机制"], scoreBreakdown: [{ label: "互动速度", value: "94" }, { label: "话题相关度", value: "92" }, { label: "可复刻结构", value: "96" }], capturedBy: "tiktok.discovery.demo", capturedAt: "今天 10:04" },
    patternCard: { summary: "用误解与揭示制造认知反差。", viralReasons: [{ claim: "前 3 秒留下信息缺口", evidence: ["先展示失败结果，再解释机制"], confidence: "medium" }], production: { mediaType: "video", hook: "先展示失败结果，再延迟揭示真正机制", structure: ["失败结果", "留白", "机制解释", "结果回收"], videoMethod: ["前 3 秒快切", "后段单镜头解释"], writingMethod: ["先提出误解，再给出机制证据"], imageTypes: ["项目 UI 截图", "时间轴字幕"] }, replicationDecision: { verdict: "adapt", reason: "结构可迁移，但角色与 UI 必须替换为项目资产。", portableElements: ["认知反差", "延迟揭示"], mustReplace: ["角色素材", "UI 截图", "字幕文案"] }, topicCandidates: [], insights: [], limitations: ["演示数据，不代表真实平台证据"] },
  },
  {
    id: "post-02", platform: "Reddit", author: "u/turnbased_dev", title: "开发日志：只改了命中反馈，玩家却认为整个战斗系统重做了", body: "",
    topic: "r/IndieDev", published: "5 小时前", likes: 3260, comments: 188, score: 89,
    reason: "作者基线提升 4.7 倍，长评论比例明显高于社区中位数", mediaType: "图文",
    image: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?auto=format&fit=crop&w=720&q=80",
    canonicalUrl: "https://www.reddit.com/r/IndieDev/comments/demo-post-02", sourceLink: { usable: true }, externalId: "reddit-demo-002", capturedAt: "今天 09:16",
    evidence: { signals: ["作者基线提升 4.7 倍", "长评论比例高于社区中位数"], scoreBreakdown: [{ label: "作者基线", value: "89" }, { label: "评论深度", value: "91" }, { label: "项目匹配", value: "87" }], capturedBy: "reddit.discovery.demo", capturedAt: "今天 09:16" },
  },
  {
    id: "post-03", platform: "小红书", author: "像素工坊", title: "独立游戏最容易被忽略的不是美术，而是第一屏的信息密度", body: "",
    topic: "#独立游戏开发", published: "昨天", likes: 8920, comments: 376, score: 86,
    reason: "收藏评论比高，适合拆解成信息设计类图文", mediaType: "图文",
    image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=720&q=80",
    canonicalUrl: "https://www.xiaohongshu.com/explore/demo-post-03", sourceLink: { usable: false, reason: "演示记录没有真实平台访问凭证。" }, externalId: "xhs-demo-003", capturedAt: "昨天 18:40",
    evidence: { signals: ["收藏评论比高", "适合拆解成信息设计图文"], scoreBreakdown: [{ label: "收藏效率", value: "88" }, { label: "图文结构", value: "90" }, { label: "项目匹配", value: "83" }], capturedBy: "xhs.discovery.demo", capturedAt: "昨天 18:40" },
  },
  {
    id: "post-04", platform: "X", author: "@buildinpublic", title: "A one-line UI change doubled demo wishlists overnight", body: "",
    topic: "indie game UI", published: "8 小时前", likes: 4720, comments: 91, score: 81,
    reason: "短文本高转发，适合评论互动或转成小红书案例卡片", mediaType: "文本",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=720&q=80",
    canonicalUrl: "https://x.com/buildinpublic/status/demo-post-04", sourceLink: { usable: true }, externalId: "x-demo-004", capturedAt: "今天 07:58",
    evidence: { signals: ["短文本高转发", "适合评论互动或案例卡片"], scoreBreakdown: [{ label: "传播速度", value: "82" }, { label: "可讨论性", value: "84" }, { label: "项目匹配", value: "78" }], capturedBy: "x.discovery.demo", capturedAt: "今天 07:58" },
  },
  {
    id: "post-05", platform: "抖音", author: "游戏制作日记", title: "把角色攻击前摇放大三倍，观众终于看懂发生了什么", body: "",
    topic: "#游戏开发", published: "4 小时前", likes: 23600, comments: 1048, score: 91,
    reason: "同话题小时互动速度第一，前两秒视觉变化明确", mediaType: "视频",
    image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=720&q=80",
    canonicalUrl: "https://www.douyin.com/video/demo-post-05", sourceLink: { usable: true }, externalId: "dy-demo-005", capturedAt: "今天 08:22",
    evidence: { signals: ["同话题小时互动速度第一", "前两秒视觉变化明确"], scoreBreakdown: [{ label: "互动速度", value: "93" }, { label: "前两秒钩子", value: "96" }, { label: "可替换素材", value: "90" }], capturedBy: "douyin.discovery.demo", capturedAt: "今天 08:22" },
    patternCard: { summary: "用高辨识度的前后对比降低理解成本。", viralReasons: [{ claim: "视觉变化在两秒内可被识别", evidence: ["原始片段与放大变化直接对照"], confidence: "medium" }], production: { mediaType: "video", hook: "把变化放大到观众第一眼就能看懂", structure: ["原始片段", "放大变化", "前后对比", "结论"], videoMethod: ["两秒内完成一次明显变化", "同场景对齐比较"], writingMethod: ["用问题收束对比结论"], imageTypes: ["前后对比帧", "差异标注"] }, replicationDecision: { verdict: "adapt", reason: "对比方式可迁移，具体游戏画面必须使用项目素材。", portableElements: ["前后对比", "两秒视觉钩子"], mustReplace: ["角色动画", "命中特效", "对比字幕"] }, topicCandidates: [], insights: [], limitations: ["演示数据，不代表真实平台证据"] },
  },
];

export const initialIdeas: IdeaRecord[] = [
  { id: "idea-01", title: "观众以为是 Bug，其实是核心机制", hook: "先展示一个明显错误的战斗结果，再用时间轴还原系统真实判断。", format: "视频", source: "post-01", sourcePostIds: ["post-01"], platforms: ["TikTok", "抖音"], status: "candidate", assetMatch: "matched", assetId: "asset-01", videoPrompt: "竖屏 9:16，前 3 秒展示玩家误解，随后以时间轴拆开真实机制；保留快节奏开场，不复制原角色和 UI。", copy: "你第一眼会把它当成 Bug 吗？", generationBatchId: "batch-demo-01", updatedAt: "今天 11:30" },
  { id: "idea-02", title: "一个反馈动画如何改变整场战斗", hook: "同一段战斗左右对比，只替换命中反馈和停顿。", format: "视频", source: "post-02", sourcePostIds: ["post-02"], platforms: ["小红书", "Reddit"], status: "approved", assetMatch: "needs_generation", videoPrompt: "左右分屏对比同一战斗片段，先展示原始反馈，再展示更清晰的反馈设计；结尾停留在差异最大的画面。", copy: "不是系统变复杂了，是反馈终于让人看懂了。", generationBatchId: "batch-demo-01", updatedAt: "今天 10:48" },
  { id: "idea-03", title: "第一屏到底应该让玩家看什么", hook: "用三张信息层级拆解图，把 UI 选择变成可以讨论的问题。", format: "图文", source: "post-03", sourcePostIds: ["post-03"], platforms: ["小红书", "X"], status: "candidate", assetMatch: "matched", assetId: "asset-04", copy: "第一屏不是展示所有信息，而是决定玩家先理解什么。", generationBatchId: "batch-demo-01", updatedAt: "今天 10:42" },
  { id: "idea-04", title: "具体观察式回复", hook: "The timing comparison is especially convincing — the mechanic reads before the caption does.", format: "评论", source: "post-04", sourcePostIds: ["post-04"], platforms: ["X"], status: "candidate", assetMatch: "not_applicable", copy: "The timing comparison is especially convincing — the mechanic reads before the caption does.", updatedAt: "今天 09:50" },
];

export const generationJobs: GenerationJob[] = [
  { id: "job-01", title: "命中反馈前后对比", type: "视频", provider: "Remotion Worker", progress: 68, status: "running", updated: "刚刚", ideaId: "idea-02", prompt: "左右分屏对比同一战斗片段，先展示原始反馈，再展示更清晰的反馈设计。", copy: "不是系统变复杂了，是反馈终于让人看懂了。", artifacts: [{ id: "text-idea-02-v1", kind: "text", label: "中文文案", provider: "Gemini Demo", status: "review", version: "v1" }, { id: "video-idea-02-v1", kind: "video", label: "视频草稿", provider: "Remotion Demo", status: "review", version: "v1" }] },
  { id: "job-02", title: "第一屏信息层级", type: "图文", provider: "Image Composer", progress: 100, status: "review", updated: "12 分钟前", ideaId: "idea-03", prompt: "三张图文卡片，强调首屏信息层级和玩家理解顺序。", copy: "第一屏不是展示所有信息，而是决定玩家先理解什么。", artifacts: [{ id: "text-idea-03-v1", kind: "text", label: "中文文案", provider: "Gemini Demo", status: "review", version: "v1" }, { id: "image-idea-03-v1", kind: "image", label: "图文卡片", provider: "Image Composer Demo", status: "ready", version: "v1" }] },
  { id: "job-03", title: "机制误读时间轴", type: "视频", provider: "Remotion Worker", progress: 100, status: "ready", updated: "36 分钟前", ideaId: "idea-01", prompt: "竖屏 9:16，前 3 秒展示玩家误解，随后以时间轴拆开真实机制。", copy: "你第一眼会把它当成 Bug 吗？", artifacts: [{ id: "text-idea-01-v1", kind: "text", label: "中文文案", provider: "Gemini Demo", status: "ready", version: "v1" }, { id: "video-idea-01-v1", kind: "video", label: "视频草稿", provider: "Remotion Demo", status: "ready", version: "v1" }] },
  { id: "job-04", title: "本周开发片段合集", type: "视频", provider: "未接入", progress: 0, status: "queued", updated: "等待素材" },
];

export const accounts: AccountRecord[] = [];

export const automationProfiles: AutomationProfileRecord[] = [];

export const accountBindings: ProjectAccountBinding[] = [];

export const trendData = [
  { day: "周五", captured: 42, qualified: 9 }, { day: "周六", captured: 57, qualified: 12 },
  { day: "周日", captured: 48, qualified: 8 }, { day: "周一", captured: 71, qualified: 14 },
  { day: "周二", captured: 86, qualified: 18 }, { day: "周三", captured: 79, qualified: 15 },
  { day: "今天", captured: 94, qualified: 21 },
];

const topicAnomalyDefaults = { searchMode: "sequential", mediaTypeFilter: "any", anomalyEnabled: true, anomalyMethod: "robust_mad", anomalyBaselineDays: 30, anomalyMinSamples: 30, anomalyZThreshold: 3.5 } as const;

export const topics = [
  { ...topicAnomalyDefaults, id: "topic-01", projectId: "atlas", name: "独立游戏开发", platform: "小红书", terms: ["独立游戏", "开发日志", "战斗系统"], excludeTerms: ["招聘", "课程"], posts: 186, qualified: 14, cadence: "每日 09:00", state: "running", minLikes: 2000, minComments: 40, maxAgeHours: 72, minScore: 75, lastRun: "今天 09:00" },
  { ...topicAnomalyDefaults, id: "topic-02", projectId: "atlas", name: "r/IndieDev", platform: "Reddit", terms: ["showcase", "feedback", "devlog"], excludeTerms: [], posts: 132, qualified: 9, cadence: "每日 09:20", state: "running", minLikes: 300, minComments: 20, maxAgeHours: 96, minScore: 70, lastRun: "今天 09:20" },
  { ...topicAnomalyDefaults, id: "topic-03", projectId: "atlas", name: "#indiedev", platform: "TikTok", terms: ["hook", "gameplay", "before-after"], excludeTerms: ["广告"], posts: 220, qualified: 18, cadence: "每日 10:00", state: "running", minLikes: 5000, minComments: 100, maxAgeHours: 72, minScore: 80, lastRun: "今天 10:00" },
  { ...topicAnomalyDefaults, id: "topic-04", projectId: "atlas", name: "游戏开发", platform: "抖音", terms: ["游戏制作", "玩法展示"], excludeTerms: [], posts: 204, qualified: 16, cadence: "每日 10:30", state: "running", minLikes: 10000, minComments: 200, maxAgeHours: 48, minScore: 82, lastRun: "今天 10:30" },
  { ...topicAnomalyDefaults, id: "topic-05", projectId: "atlas", name: "indie game UI", platform: "X", terms: ["UI", "UX", "wishlist"], excludeTerms: ["招聘"], posts: 98, qualified: 7, cadence: "每日 11:00", state: "running", minLikes: 1000, minComments: 30, maxAgeHours: 96, minScore: 72, lastRun: "今天 11:00" },
  { ...topicAnomalyDefaults, id: "topic-06", projectId: "atlas", name: "game design process", platform: "Instagram", terms: ["reels", "carousel"], excludeTerms: [], posts: 0, qualified: 0, cadence: "未接入", state: "paused", minLikes: 1000, minComments: 20, maxAgeHours: 72, minScore: 70 },
] satisfies TopicWatch[];

export const assets: AssetRecord[] = [
  { id: "asset-01", projectId: "atlas", name: "战斗反馈录屏 01", type: "录屏", image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=720&q=80", tags: ["战斗", "命中反馈", "竖屏可裁切"], usage: "可用于视频 Idea", status: "可用" },
  { id: "asset-02", projectId: "atlas", name: "角色攻击截图", type: "截图", image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=720&q=80", tags: ["角色", "攻击", "横屏"], usage: "可用于图文和视频", status: "可用" },
  { id: "asset-03", projectId: "atlas", name: "Atlas Logo", type: "Logo", image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=720&q=80", tags: ["品牌", "Logo"], usage: "所有平台品牌层", status: "可用" },
  { id: "asset-04", projectId: "atlas", name: "首屏 UI 结构图", type: "截图", image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=720&q=80", tags: ["UI", "首屏", "图文"], usage: "可用于图文 Idea", status: "待标注" },
];

export const runs: RunRecord[] = [
  { id: "run-001", kind: "抓取", status: "completed", provider: "tiktok.discovery.demo", startedAt: "今天 10:00", completedAt: "今天 10:04", inputCount: 5, outputCount: 21, note: "按 #indiedev 规则抓取；4 条达到最低评分" },
  { id: "run-002", kind: "视频分析", status: "waiting_review", provider: "Pattern Agent Demo", startedAt: "今天 10:05", inputCount: 2, outputCount: 2, note: "已生成 PatternCard，等待人工确认" },
  { id: "run-003", kind: "Idea 生成", status: "completed", provider: "Idea Planner Demo", startedAt: "今天 10:16", completedAt: "今天 10:18", inputCount: 3, outputCount: 4, note: "批次 batch-demo-01，输出 4 条候选" },
  { id: "run-004", kind: "生成", status: "running", provider: "Remotion Worker", startedAt: "今天 11:22", inputCount: 2, outputCount: 2, note: "1 条视频生成中，1 条图文待审核" },
];
