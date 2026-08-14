import { Button } from "antd";
import { Plus, Settings2 } from "lucide-react";
import { PageHeader } from "../components/Shared";
import { projects } from "../data/demoData";

export function ProjectsPage() {
  return <><PageHeader title="项目" meta="项目配置决定 Topic、Prompt Pack、素材与发布策略" actions={<Button type="primary" icon={<Plus size={15} />}>新建项目</Button>} />
    <div className="project-grid">{projects.map((project) => <article className="entity-card" key={project.id}><div className="entity-card-header"><div><h2 className="entity-title">{project.name}</h2><div className="entity-subtitle">{project.type} · {project.stage}</div></div><Button className="icon-button" size="small" icon={<Settings2 size={14} />} /></div><div className="topic-tags"><span className="topic-tag">{project.locale}</span><span className="topic-tag">{project.cadence}</span></div><div className="entity-stats"><div><div className="entity-stat-value">{project.topics}</div><div className="entity-stat-label">Topic</div></div><div><div className="entity-stat-value">{project.channels}</div><div className="entity-stat-label">Channel</div></div><div><div className="entity-stat-value">v0.1</div><div className="entity-stat-label">Prompt Pack</div></div></div></article>)}</div>
  </>;
}
