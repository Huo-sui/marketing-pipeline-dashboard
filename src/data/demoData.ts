import type { AccountRecord, GenerationJob, IdeaRecord, ProjectRecord, SourcePost } from "../types";

// Explicit local demo data. Replace one resource at a time through the Refine data provider.
export const projects: ProjectRecord[] = [
  { id: "atlas", name: "Project Atlas", type: "独立游戏", stage: "Pre-production", topics: 12, channels: 5, cadence: "每日", locale: "中文 / English" },
  { id: "reader", name: "Reader Lab", type: "阅读应用", stage: "Beta", topics: 8, channels: 3, cadence: "每日", locale: "中文 / English" },
  { id: "language", name: "Language Sprint", type: "语言学习", stage: "Research", topics: 6, channels: 2, cadence: "每周三次", locale: "English" },
];

export const initialSourcePosts: SourcePost[] = [
  {
    id: "post-01", platform: "TikTok", author: "@smallstudio", title: "失败画面先出现，3 秒后才揭示真正的核心机制",
    topic: "#indiedev", published: "2 小时前", likes: 18400, comments: 612, score: 94,
    reason: "互动速度位于话题前 2%，评论集中讨论核心机制", mediaType: "视频",
    image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=720&q=80", action: "unreviewed",
  },
  {
    id: "post-02", platform: "Reddit", author: "u/turnbased_dev", title: "开发日志：只改了命中反馈，玩家却认为整个战斗系统重做了",
    topic: "r/IndieDev", published: "5 小时前", likes: 3260, comments: 188, score: 89,
    reason: "作者基线提升 4.7 倍，长评论比例明显高于社区中位数", mediaType: "图文",
    image: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?auto=format&fit=crop&w=720&q=80", action: "unreviewed",
  },
  {
    id: "post-03", platform: "小红书", author: "像素工坊", title: "独立游戏最容易被忽略的不是美术，而是第一屏的信息密度",
    topic: "#独立游戏开发", published: "昨天", likes: 8920, comments: 376, score: 86,
    reason: "收藏评论比高，适合拆解成信息设计类图文", mediaType: "图文",
    image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=720&q=80", action: "unreviewed",
  },
  {
    id: "post-04", platform: "X", author: "@buildinpublic", title: "A one-line UI change doubled demo wishlists overnight",
    topic: "indie game UI", published: "8 小时前", likes: 4720, comments: 91, score: 81,
    reason: "短文本高转发，适合评论互动或转成小红书案例卡片", mediaType: "文本",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=720&q=80", action: "unreviewed",
  },
  {
    id: "post-05", platform: "抖音", author: "游戏制作日记", title: "把角色攻击前摇放大三倍，观众终于看懂发生了什么",
    topic: "#游戏开发", published: "4 小时前", likes: 23600, comments: 1048, score: 91,
    reason: "同话题小时互动速度第一，前两秒视觉变化明确", mediaType: "视频",
    image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=720&q=80", action: "adapt",
  },
];

export const initialIdeas: IdeaRecord[] = [
  { id: "idea-01", title: "观众以为是 Bug，其实是核心机制", hook: "先展示一个明显错误的战斗结果，再用时间轴还原系统真实判断。", format: "视频", source: "post-01", platforms: ["TikTok", "抖音"], status: "candidate" },
  { id: "idea-02", title: "一个反馈动画如何改变整场战斗", hook: "同一段战斗左右对比，只替换命中反馈和停顿。", format: "视频", source: "post-02", platforms: ["小红书", "Reddit"], status: "approved" },
  { id: "idea-03", title: "第一屏到底应该让玩家看什么", hook: "用三张信息层级拆解图，把 UI 选择变成可以讨论的问题。", format: "图文", source: "post-03", platforms: ["小红书", "X"], status: "candidate" },
  { id: "idea-04", title: "具体观察式回复", hook: "The timing comparison is especially convincing — the mechanic reads before the caption does.", format: "评论", source: "post-04", platforms: ["X"], status: "candidate" },
];

export const generationJobs: GenerationJob[] = [
  { id: "job-01", title: "命中反馈前后对比", type: "视频", provider: "Remotion Worker", progress: 68, status: "running", updated: "刚刚" },
  { id: "job-02", title: "第一屏信息层级", type: "图文", provider: "Image Composer", progress: 100, status: "review", updated: "12 分钟前" },
  { id: "job-03", title: "机制误读时间轴", type: "视频", provider: "Remotion Worker", progress: 100, status: "ready", updated: "36 分钟前" },
  { id: "job-04", title: "本周开发片段合集", type: "视频", provider: "未接入", progress: 0, status: "queued", updated: "等待素材" },
];

export const accounts: AccountRecord[] = [
  { id: "acc-01", platform: "小红书", handle: "未连接账号", status: "disconnected", projects: 0, lastCheck: "—", connector: "xhs.publisher" },
  { id: "acc-02", platform: "抖音", handle: "未连接账号", status: "disconnected", projects: 0, lastCheck: "—", connector: "douyin.publisher" },
  { id: "acc-03", platform: "TikTok", handle: "@demo_studio", status: "attention", projects: 1, lastCheck: "Demo Seed", connector: "tiktok.publisher" },
  { id: "acc-04", platform: "Reddit", handle: "u/demo_studio", status: "healthy", projects: 1, lastCheck: "Demo Seed", connector: "reddit.publisher" },
  { id: "acc-05", platform: "X", handle: "@demo_studio", status: "healthy", projects: 2, lastCheck: "Demo Seed", connector: "x.publisher" },
  { id: "acc-06", platform: "Instagram", handle: "未连接账号", status: "disconnected", projects: 0, lastCheck: "—", connector: "instagram.publisher" },
];

export const trendData = [
  { day: "周五", captured: 42, qualified: 9 }, { day: "周六", captured: 57, qualified: 12 },
  { day: "周日", captured: 48, qualified: 8 }, { day: "周一", captured: 71, qualified: 14 },
  { day: "周二", captured: 86, qualified: 18 }, { day: "周三", captured: 79, qualified: 15 },
  { day: "今天", captured: 94, qualified: 21 },
];

export const topics = [
  { id: "topic-01", name: "独立游戏开发", platform: "小红书", posts: 186, qualified: 14, cadence: "每日 09:00", state: "运行中", tags: ["独立游戏", "开发日志", "战斗系统"] },
  { id: "topic-02", name: "r/IndieDev", platform: "Reddit", posts: 132, qualified: 9, cadence: "每日 09:20", state: "运行中", tags: ["showcase", "feedback", "devlog"] },
  { id: "topic-03", name: "#indiedev", platform: "TikTok", posts: 220, qualified: 18, cadence: "每日 10:00", state: "运行中", tags: ["hook", "gameplay", "before-after"] },
  { id: "topic-04", name: "游戏开发", platform: "抖音", posts: 204, qualified: 16, cadence: "每日 10:30", state: "运行中", tags: ["游戏制作", "玩法展示"] },
  { id: "topic-05", name: "indie game UI", platform: "X", posts: 98, qualified: 7, cadence: "每日 11:00", state: "运行中", tags: ["UI", "UX", "wishlist"] },
  { id: "topic-06", name: "game design process", platform: "Instagram", posts: 0, qualified: 0, cadence: "未接入", state: "待连接", tags: ["reels", "carousel"] },
];
