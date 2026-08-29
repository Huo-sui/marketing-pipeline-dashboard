import type { Platform } from "../types";

const classes: Record<string, string> = {
  TikTok: "platform-tiktok",
  小红书: "platform-xhs",
  Reddit: "platform-reddit",
  X: "platform-x",
  抖音: "platform-douyin",
  Instagram: "platform-instagram",
};

export const platformClass = (platform: Platform) => classes[platform] ?? "platform-generic";
