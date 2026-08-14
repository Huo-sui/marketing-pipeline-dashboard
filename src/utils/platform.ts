import type { Platform } from "../types";

export const platformClass = (platform: Platform) => ({
  TikTok: "platform-tiktok",
  小红书: "platform-xhs",
  Reddit: "platform-reddit",
  X: "platform-x",
  抖音: "platform-douyin",
  Instagram: "platform-instagram",
}[platform]);
