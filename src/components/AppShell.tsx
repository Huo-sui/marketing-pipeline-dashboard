import { Button, Input, Select, Tooltip, message } from "antd";
import {
  Activity, Bot, Boxes, ChevronDown, CircleUserRound, FileText, FolderKanban,
  LayoutDashboard, Menu, RadioTower, RefreshCw, Search, Send, Settings, Sparkles, Users, X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { projects } from "../data/demoData";
import { useDemoState } from "../state/demoStateContext";

const nav = [
  { to: "/overview", label: "总览", icon: LayoutDashboard },
  { to: "/projects", label: "项目", icon: FolderKanban },
  { to: "/topics", label: "话题雷达", icon: RadioTower, count: "6" },
  { to: "/source-posts", label: "爆帖收件箱", icon: FileText, count: "21" },
  { to: "/ideas", label: "Idea 审核", icon: Sparkles, count: "3" },
  { to: "/generation", label: "生成队列", icon: Bot, count: "2" },
  { to: "/release", label: "发布中心", icon: Send, count: "3" },
];

const adminNav = [
  { to: "/accounts", label: "账号", icon: Users },
  { to: "/settings", label: "设置", icon: Settings },
];

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { selectedProject, setSelectedProject } = useDemoState();
  const [messageApi, contextHolder] = message.useMessage();

  const runScan = () => messageApi.success("已创建 Demo 抓取任务；Connector 接入后会替换此行为");

  return (
    <div className="app-shell">
      {contextHolder}
      {menuOpen && <button className="sidebar-overlay" aria-label="关闭导航" onClick={() => setMenuOpen(false)} />}
      <aside className={`app-sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">MP</div>
          <div><div className="brand-title">Marketing Pipeline</div><div className="brand-subtitle">Control Plane</div></div>
          {menuOpen && <Button className="mobile-menu" type="text" icon={<X size={18} />} onClick={() => setMenuOpen(false)} />}
        </div>
        <nav>
          <div className="nav-section">
            <div className="nav-label">Workspace</div>
            {nav.map(({ to, label, icon: Icon, count }) => (
              <NavLink key={to} to={to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{count && <span className="nav-count">{count}</span>}
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
          <div className="health-line"><span className="health-dot" />Control API · Demo</div>
          <div className="health-line"><Boxes size={14} />0 / 12 Connectors</div>
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
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
          />
          <Input className="top-search" style={{ maxWidth: 340 }} prefix={<Search size={15} color="#8a938c" />} placeholder="搜索帖子、Idea 或任务" />
          <div className="topbar-spacer" />
          <div className="demo-badge"><Activity size={13} />Demo Seed</div>
          <Button className="desktop-only" icon={<RefreshCw size={15} />} onClick={runScan}>运行抓取</Button>
          <Tooltip title="本地工作区"><Button className="icon-button" icon={<CircleUserRound size={17} />} /></Tooltip>
        </header>
        <div className="content"><Outlet /></div>
      </main>
    </div>
  );
}
