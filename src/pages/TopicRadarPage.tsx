import { Button, Switch } from "antd";
import { Plus, RefreshCw } from "lucide-react";
import { PageHeader, PlatformBadge } from "../components/Shared";
import { topics } from "../data/demoData";
import type { Platform } from "../types";

export function TopicRadarPage() {
  return <><PageHeader title="话题雷达" meta="每个项目固定追踪的 Topic、社区与关键词" actions={<><Button icon={<RefreshCw size={15} />}>研究候选</Button><Button type="primary" icon={<Plus size={15} />}>添加话题</Button></>} />
    <div className="topic-grid">{topics.map((topic) => <article className="entity-card" key={topic.id}><div className="entity-card-header"><div><PlatformBadge platform={topic.platform as Platform} /><h2 className="entity-title" style={{ marginTop: 10 }}>{topic.name}</h2><div className="entity-subtitle">{topic.cadence}</div></div><Switch size="small" defaultChecked={topic.state === "运行中"} /></div><div className="topic-tags">{topic.tags.map((tag) => <span className="topic-tag" key={tag}>{tag}</span>)}</div><div className="entity-stats"><div><div className="entity-stat-value">{topic.posts}</div><div className="entity-stat-label">近 7 日帖子</div></div><div><div className="entity-stat-value">{topic.qualified}</div><div className="entity-stat-label">入选</div></div><div><div className="entity-stat-value">{topic.posts ? Math.round(topic.qualified / topic.posts * 100) : 0}%</div><div className="entity-stat-label">入选率</div></div></div></article>)}</div>
  </>;
}
