import { Button } from "antd";
import { ArrowRight, CalendarCheck, RadioTower } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router";
import { trendData } from "../data/demoData";
import { useDemoState } from "../state/demoStateContext";
import { PageHeader, Panel, PlatformBadge } from "../components/Shared";

const platformShare = [
  { name: "TikTok", value: 29, color: "#28312b" }, { name: "小红书", value: 24, color: "#a85b57" },
  { name: "抖音", value: 21, color: "#625c89" }, { name: "Reddit", value: 15, color: "#b47a39" },
  { name: "X", value: 11, color: "#4c7d98" },
];

export function OverviewPage() {
  const { sourcePosts } = useDemoState();
  const topPosts = [...sourcePosts].sort((a, b) => b.score - a.score).slice(0, 3);

  return <>
    <PageHeader title="今日总览" meta="Project Atlas · 2026 年 8 月 14 日" actions={<Button type="primary" icon={<CalendarCheck size={15} />}>新建审核批次</Button>} />
    <div className="kpi-grid">
      <div className="kpi"><div className="kpi-label">监控话题</div><div className="kpi-value">12</div><div className="kpi-foot"><span className="delta-up">6 个运行中</span> · 6 个待接入</div></div>
      <div className="kpi"><div className="kpi-label">今日采集</div><div className="kpi-value">94</div><div className="kpi-foot"><span className="delta-up">+19%</span> 对比昨日</div></div>
      <div className="kpi"><div className="kpi-label">待审核 Idea</div><div className="kpi-value">3</div><div className="kpi-foot">1 条已经批准</div></div>
      <div className="kpi"><div className="kpi-label">待发布内容</div><div className="kpi-value">3</div><div className="kpi-foot">2 个平台版本待确认</div></div>
    </div>
    <div className="dashboard-grid">
      <Panel title="今日爆帖" caption="按项目话题内表现排序" action={<Link to="/source-posts"><Button type="link" size="small">全部 <ArrowRight size={13} /></Button></Link>}>
        {topPosts.map((post) => <div className="post-row" key={post.id}>
          <img className="post-thumb" src={post.image} alt="Demo Seed 内容缩略图" />
          <div><PlatformBadge platform={post.platform} /><div className="post-title">{post.title}</div><div className="post-meta">{post.author} · {post.published} · {post.topic}</div></div>
          <div className="post-score"><div className="score-value">{post.score}</div><div className="score-label">Hot score</div></div>
        </div>)}
      </Panel>
      <Panel title="管线状态" caption="当前工作项">
        <div className="pipeline-item"><div className="pipeline-line"><span className="pipeline-name">抓取与标准化</span><span className="pipeline-count">94 / 120</span></div><div className="pipeline-track"><div className="pipeline-fill" style={{ width: "78%" }} /></div></div>
        <div className="pipeline-item"><div className="pipeline-line"><span className="pipeline-name">视觉拆解</span><span className="pipeline-count">12 / 21</span></div><div className="pipeline-track"><div className="pipeline-fill blue" style={{ width: "57%" }} /></div></div>
        <div className="pipeline-item"><div className="pipeline-line"><span className="pipeline-name">Idea 审核</span><span className="pipeline-count">1 / 4</span></div><div className="pipeline-track"><div className="pipeline-fill amber" style={{ width: "25%" }} /></div></div>
        <div className="pipeline-item"><div className="pipeline-line"><span className="pipeline-name">生成与验收</span><span className="pipeline-count">2 / 4</span></div><div className="pipeline-track"><div className="pipeline-fill red" style={{ width: "50%" }} /></div></div>
        <Link to="/topics"><Button block style={{ marginTop: 20 }} icon={<RadioTower size={15} />}>查看抓取计划</Button></Link>
      </Panel>
    </div>
    <div className="analytics-grid">
      <Panel title="7 日采集质量" caption="采集量与入选量">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trendData} margin={{ top: 8, right: 8, left: -25, bottom: 0 }}>
          <defs><linearGradient id="capturedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5f876d" stopOpacity={0.28} /><stop offset="100%" stopColor="#5f876d" stopOpacity={0.02} /></linearGradient></defs>
          <CartesianGrid stroke="#e9ece8" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#7b837d" }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#7b837d" }} />
          <Tooltip contentStyle={{ border: "1px solid #dfe3dd", borderRadius: 5, fontSize: 11 }} /><Area type="monotone" dataKey="captured" name="采集" stroke="#3f6f52" strokeWidth={2} fill="url(#capturedFill)" /><Area type="monotone" dataKey="qualified" name="入选" stroke="#b47a39" strokeWidth={2} fill="transparent" />
        </AreaChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="来源分布" caption="今日入选内容">
        <div className="legend-list">{platformShare.map((item) => <div className="legend-row" key={item.name}><span className="legend-dot" style={{ background: item.color }} /><span className="legend-name">{item.name}</span><span className="legend-value">{item.value}%</span></div>)}</div>
      </Panel>
    </div>
  </>;
}
