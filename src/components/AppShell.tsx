import { Alert, Button, Input, Select, Tooltip, message } from "antd";
import {
  Activity, Bot, Boxes, ChevronDown, CircleUserRound, ClipboardList, FileText, FolderKanban,
  Images, LayoutDashboard, Menu, RadioTower, RefreshCw, Search, Send, Settings, Sparkles, Users, X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { controlApi } from "../services/controlApi";
import { useDemoState } from "../state/demoStateContext";

const nav = [
  { to: "/overview", label: "总览", icon: LayoutDashboard },
  { to: "/projects", label: "项目", icon: FolderKanban },
  { to: "/assets", label: "项目资产", icon: Images },
  { to: "/topics", label: "话题雷达", icon: RadioTower },
  { to: "/source-posts", label: "爆帖分析", icon: FileText },
  { to: "/ideas", label: "选题箱", icon: Sparkles },
  { to: "/generation", label: "待审草稿", icon: Bot },
  { to: "/release", label: "发布队列", icon: Send },
  { to: "/runs", label: "任务与审计", icon: ClipboardList },
];

const adminNav = [
  { to: "/accounts", label: "账号", icon: Users },
  { to: "/settings", label: "设置", icon: Settings },
];

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { selectedProject, setSelectedProject, projects, topicWatches, error, loading } = useDemoState();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const activeProjects = projects.filter((project) => project.status === "active");
  const currentTopicCount = topicWatches.filter((watch) => watch.projectId === selectedProject).length;

  const runScan = async () => {
    const watch = topicWatches.find((item) => item.projectId === selectedProject && item.state === "running");
    if (!watch) { navigate("/topics"); messageApi.info("当前项目没有运行中的追踪规则"); return; }
    try {
      const result = await controlApi.runTopic(watch.id);
      navigate("/topics");
      messageApi[result.ok ? "success" : "warning"](result.ok ? "话题雷达运行已完成" : `运行未执行：${result.run.errorMessage}`);
    } catch (reason) { messageApi.error(reason instanceof Error ? reason.message : "话题雷达运行失败"); }
  };

  return (
    <div className="app-shell">
      {contextHolder}
      {menuOpen && <button className="sidebar-overlay" aria-label="关闭导航" onClick={() => setMenuOpen(false)} />}
      <aside className={`app-sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">1P</div>
          <div><div className="brand-title">一人公司营销管线</div><div className="brand-subtitle">Solo Company Pipeline</div></div>
          {menuOpen && <Button className="mobile-menu" type="text" icon={<X size={18} />} onClick={() => setMenuOpen(false)} />}
        </div>
        <nav>
          <div className="nav-section">
            <div className="nav-label">Workspace</div>
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{to === "/topics" && <span className="nav-count">{currentTopicCount}</span>}
              </NavLink>
            ))}
          </div>
          <div className="nav-section">
            <div className="nav-label">Administration</div>
            {adminNav.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="health-line"><span className="health-dot" />Control API · PostgreSQL</div>
          <div className="health-line"><Boxes size={14} />0 个 Connector 已配置</div>
        </div>
      </aside>
      <main className="app-main">
        <header className="topbar">
          <Tooltip title="打开导航"><Button className="mobile-menu icon-button" icon={<Menu size={18} />} onClick={() => setMenuOpen(true)} /></Tooltip>
          <Select
            className="project-picker"
            value={selectedProject}
            onChange={setSelectedProject}
            suffixIcon={<ChevronDown size={14} />}
            options={activeProjects.map((project) => ({ value: project.id, label: project.name }))}
          />
          <Input className="top-search" style={{ maxWidth: 340 }} prefix={<Search size={15} color="#8a938c" />} placeholder="搜索爆帖、选题、灵感或草稿" />
          <div className="topbar-spacer" />
          <div className="demo-badge"><Activity size={13} />{loading ? "连接中" : error ? "API 错误" : "PostgreSQL"}</div>
          <Button className="desktop-only" icon={<RefreshCw size={15} />} onClick={runScan}>运行抓取</Button>
          <Tooltip title="本地工作区"><Button className="icon-button" icon={<CircleUserRound size={17} />} /></Tooltip>
        </header>
        <div className="content">{error && <Alert className="section-alert" type="error" showIcon message={error} />}<Outlet /></div>
      </main>
    </div>
  );
}
