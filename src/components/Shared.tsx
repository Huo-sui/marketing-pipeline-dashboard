import { Button, Tooltip } from "antd";
import { ExternalLink, MessageCircle, WandSparkles } from "lucide-react";
import type { Platform, ReviewAction, SourcePost } from "../types";
import { platformClass } from "../utils/platform";

export function PlatformBadge({ platform }: { platform: Platform }) {
  return <span className={`platform-badge ${platformClass(platform)}`}>{platform}</span>;
}

export function PageHeader({ title, meta, actions }: { title: string; meta: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div><h1 className="page-title">{title}</h1><div className="page-meta">{meta}</div></div><div className="page-actions">{actions}</div></div>;
}

export function Panel({ title, caption, action, children }: { title: string; caption?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="panel"><header className="panel-header"><div><h2 className="panel-title">{title}</h2>{caption && <div className="panel-caption">{caption}</div>}</div>{action}</header><div className="panel-body">{children}</div></section>;
}

export function PostActions({ post, onAction }: { post: SourcePost; onAction: (action: ReviewAction) => void }) {
  return <div className="action-group">
    <Tooltip title="查看来源"><Button className="icon-button" size="small" icon={<ExternalLink size={14} />} /></Tooltip>
    <Tooltip title="生成评论"><Button className="icon-button" size="small" type={post.action === "engage" ? "primary" : "default"} icon={<MessageCircle size={14} />} onClick={() => onAction("engage")} /></Tooltip>
    <Tooltip title="做同款"><Button className="icon-button" size="small" type={post.action === "adapt" ? "primary" : "default"} icon={<WandSparkles size={14} />} onClick={() => onAction("adapt")} /></Tooltip>
  </div>;
}
