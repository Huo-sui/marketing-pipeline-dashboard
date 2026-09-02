import { Button, Tooltip } from "antd";
import { ExternalLink, Eye } from "lucide-react";
import type { Platform, SourcePost } from "../types";
import { platformClass } from "../utils/platform";

export function PlatformBadge({ platform }: { platform: Platform }) {
  return <span className={`platform-badge ${platformClass(platform)}`}>{platform}</span>;
}

export function MediaTypeBadge({ type }: { type: "视频" | "图文" | "文本" }) {
  return <span className="media-type-badge">{type}</span>;
}

export function PageHeader({ title, meta, actions }: { title: string; meta: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div><h1 className="page-title">{title}</h1><div className="page-meta">{meta}</div></div><div className="page-actions">{actions}</div></div>;
}

export function Panel({ title, caption, action, children }: { title: string; caption?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="panel"><header className="panel-header"><div><h2 className="panel-title">{title}</h2>{caption && <div className="panel-caption">{caption}</div>}</div>{action}</header><div className="panel-body">{children}</div></section>;
}

export function PostActions({ post, onOpen }: { post: SourcePost; onOpen?: () => void }) {
  return <div className="action-group">
    <Tooltip title="查看详情"><Button className="icon-button" size="small" icon={<Eye size={14} />} onClick={onOpen} /></Tooltip>
    <Tooltip title={post.sourceLink.usable ? "打开原帖" : (post.sourceLink.reason || "原帖链接待重新抓取")}><Button className="icon-button" size="small" disabled={!post.sourceLink.usable} icon={<ExternalLink size={14} />} {...(post.sourceLink.usable ? { href: post.canonicalUrl, target: "_blank", rel: "noreferrer" } : {})} /></Tooltip>
  </div>;
}
