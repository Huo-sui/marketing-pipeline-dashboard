import { Button, Tooltip } from "antd";
import { FolderOpen, Plus, RadioTower, Settings2 } from "lucide-react";
import { useNavigate } from "react-router";
import { PageHeader } from "../components/Shared";
import { useDemoState } from "../state/demoStateContext";

export function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, selectedProject, setSelectedProject } = useDemoState();
  const orderedProjects = [...projects].sort((left, right) => Number(left.status === "archived") - Number(right.status === "archived"));

  const openProject = (projectId: string, path: string) => {
    setSelectedProject(projectId);
    navigate(path);
  };

  return <><PageHeader title="项目" meta="项目配置决定 Topic、Prompt Pack、素材与发布策略" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => navigate("/projects/new")}>新建项目</Button>} />
    <div className="project-grid">{orderedProjects.map((project) => <article className={`entity-card ${project.id === selectedProject ? "entity-card-active" : ""} ${project.status === "archived" ? "entity-card-archived" : ""}`} key={project.id}><div className="entity-card-header"><div><div className="entity-title-line"><h2 className="entity-title">{project.name}</h2>{project.status === "archived" && <span className="status-badge status-disconnected">已归档</span>}</div><div className="entity-subtitle">{project.type} · {project.stage}</div></div><Tooltip title={project.status === "archived" ? "查看并恢复项目" : "编辑项目"}><Button aria-label={`编辑 ${project.name}`} className="icon-button" size="small" icon={<Settings2 size={14} />} onClick={() => { if (project.status === "active") setSelectedProject(project.id); navigate(`/projects/${project.id}/edit`); }} /></Tooltip></div><div className="topic-tags"><span className="topic-tag">{project.locale}</span><span className="topic-tag">{project.cadence}</span><span className="topic-tag">{project.promptPackVersion || "Prompt Pack 待配置"}</span></div><div className="entity-stats"><div><div className="entity-stat-value">{project.topics}</div><div className="entity-stat-label">追踪规则</div></div><div><div className="entity-stat-value">{project.accountIds.length}</div><div className="entity-stat-label">绑定账号</div></div><div><div className="entity-stat-value">{project.assetCount ?? 0}</div><div className="entity-stat-label">项目资产</div></div></div>{project.status === "active" && <div className="card-actions"><Button size="small" icon={<RadioTower size={13} />} onClick={() => openProject(project.id, "/topics")}>追踪规则</Button><Button size="small" icon={<FolderOpen size={13} />} onClick={() => openProject(project.id, "/assets")}>查看资产</Button></div>}</article>)}</div>
  </>;
}
