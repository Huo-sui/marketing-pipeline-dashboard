import { Button } from "antd";
import { ArrowRight, CalendarCheck, RadioTower } from "lucide-react";
import { Link } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { controlApi } from "../services/controlApi";
import { useDemoState } from "../state/demoStateContext";
import { PageHeader, Panel, PlatformBadge } from "../components/Shared";

const platformColors: Record<string, string> = { TikTok: "#28312b", "小红书": "#a85b57", "抖音": "#625c89", Reddit: "#b47a39", X: "#4c7d98", Instagram: "#8a6b55" };

export function OverviewPage() {
  const { selectedProject, projects, topicWatches, sourcePosts, ideas } = useDemoState();
  const [drafts, setDrafts] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => { void controlApi.listPublicationDrafts().then(setDrafts).catch(() => setDrafts([])); }, [selectedProject]);
  const currentProject = projects.find((project) => project.id === selectedProject);
  const topPosts = [...sourcePosts].sort((a, b) => b.score - a.score).slice(0, 3);
  const currentTopics = topicWatches.filter((topic) => topic.projectId === selectedProject);
  const pendingIdeas = ideas.filter((idea) => idea.status === "candidate").length;
  const pendingDrafts = drafts.filter((draft) => draft.status === "draft" || draft.status === "approved").length;
  const platformShare = useMemo(() => { const counts = new Map<string, number>(); for (const post of sourcePosts) counts.set(post.platform, (counts.get(post.platform) || 0) + 1); const total = sourcePosts.length || 1; return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5).map(([name, count]) => ({ name, value: Math.round((count / total) * 100), color: platformColors[name] || "#6c746e" })); }, [sourcePosts]);

  return <>
    <PageHeader title="今日总览" meta={`${currentProject?.name || "未选择项目"} · 服务端实时数据`} actions={<Button type="primary" icon={<CalendarCheck size={15} />} disabled>新建审核批次</Button>} />
    <div className="kpi-grid">
      <div className="kpi"><div className="kpi-label">监控话题</div><div className="kpi-value">{currentTopics.length}</div><div className="kpi-foot"><span className="delta-up">{currentTopics.filter((topic) => topic.state === "running").length} 个运行中</span> · 服务端配置</div></div>
      <div className="kpi"><div className="kpi-label">项目帖子</div><div className="kpi-value">{sourcePosts.length}</div><div className="kpi-foot">Control API 查询结果</div></div>
      <div className="kpi"><div className="kpi-label">待审核 Idea</div><div className="kpi-value">{pendingIdeas}</div><div className="kpi-foot">来源帖子必须先人工通过</div></div>
      <div className="kpi"><div className="kpi-label">待发布内容</div><div className="kpi-value">{pendingDrafts}</div><div className="kpi-foot">PublicationDraft</div></div>
    </div>
    <div className="dashboard-grid">
      <Panel title="今日爆帖" caption="按项目话题内表现排序" action={<Link to="/source-posts"><Button type="link" size="small">全部 <ArrowRight size={13} /></Button></Link>}>
        {topPosts.length === 0 ? <div className="empty-state">当前项目还没有来自 Control API 的帖子</div> : topPosts.map((post) => <div className="post-row" key={post.id}>
          <img className="post-thumb" src={post.image} alt="Demo Seed 内容缩略图" />
          <div><PlatformBadge platform={post.platform} /><div className="post-title">{post.title}</div><div className="post-meta">{post.author} · {post.published} · {post.topic}</div></div>
          <div className="post-score"><div className="score-value">{post.score}</div><div className="score-label">Hot score</div></div>
        </div>)}
      </Panel>
      <Panel title="管线状态" caption="当前工作项">
        <div className="pipeline-item"><div className="pipeline-line"><span className="pipeline-name">抓取与标准化</span><span className="pipeline-count">{sourcePosts.length}</span></div></div>
        <div className="pipeline-item"><div className="pipeline-line"><span className="pipeline-name">Idea 审核</span><span className="pipeline-count">{ideas.length}</span></div></div>
        <div className="pipeline-item"><div className="pipeline-line"><span className="pipeline-name">生成与验收</span><span className="pipeline-count">数据库任务</span></div></div>
        <div className="pipeline-item"><div className="pipeline-line"><span className="pipeline-name">发布草稿</span><span className="pipeline-count">{drafts.length}</span></div></div>
        <Link to="/topics"><Button block style={{ marginTop: 20 }} icon={<RadioTower size={15} />}>查看抓取计划</Button></Link>
      </Panel>
    </div>
    <div className="analytics-grid">
      <Panel title="7 日采集质量" caption="采集量与入选量">
        <div className="empty-state">历史趋势尚未接入服务端聚合数据</div>
      </Panel>
      <Panel title="来源分布" caption="今日入选内容">
        <div className="legend-list">{platformShare.map((item) => <div className="legend-row" key={item.name}><span className="legend-dot" style={{ background: item.color }} /><span className="legend-name">{item.name}</span><span className="legend-value">{item.value}%</span></div>)}</div>
      </Panel>
    </div>
  </>;
}
