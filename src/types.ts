export type Platform = "TikTok" | "小红书" | "Reddit" | "X" | "抖音" | "Instagram";
export type ReviewAction = "unreviewed" | "engage" | "adapt" | "ignored";
export type IdeaStatus = "candidate" | "approved" | "rejected";

export interface ProjectRecord {
  id: string;
  name: string;
  type: string;
  stage: string;
  topics: number;
  channels: number;
  cadence: string;
  locale: string;
}

export interface SourcePost {
  id: string;
  platform: Platform;
  author: string;
  title: string;
  topic: string;
  published: string;
  likes: number;
  comments: number;
  score: number;
  reason: string;
  mediaType: "视频" | "图文" | "文本";
  image: string;
  action: ReviewAction;
}

export interface IdeaRecord {
  id: string;
  title: string;
  hook: string;
  format: "视频" | "图文" | "评论";
  source: string;
  platforms: Platform[];
  status: IdeaStatus;
}

export interface GenerationJob {
  id: string;
  title: string;
  type: "视频" | "图文";
  provider: string;
  progress: number;
  status: "running" | "review" | "ready" | "queued";
  updated: string;
}

export interface AccountRecord {
  id: string;
  platform: Platform;
  handle: string;
  status: "healthy" | "attention" | "disconnected";
  projects: number;
  lastCheck: string;
  connector: string;
}
