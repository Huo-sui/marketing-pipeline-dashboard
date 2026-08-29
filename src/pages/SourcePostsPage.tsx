import { Alert, Button, Checkbox, Descriptions, Divider, Drawer, Image, Input, List, Select, Space, Tag, message } from "antd";
import { CheckCheck, Copy, Filter, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { MediaTypeBadge, PageHeader, PlatformBadge, PostActions } from "../components/Shared";
import { useDemoState } from "../state/demoStateContext";
import type { ReviewAction, SourcePost, SourceReviewState } from "../types";

const actionLabels: Record<ReviewAction, string> = { unreviewed: "未指定", engage: "评论机会", adapt: "同款机会", ignored: "已忽略" };
const reviewLabels: Record<SourceReviewState, string> = { pending: "待筛选", approved: "已通过", rejected: "已拒绝" };

export function SourcePostsPage() {
  const { selectedProject, sourcePosts, updatePostAction, updatePostReview } = useDemoState();
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [reviewState, setReviewState] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [detailPost, setDetailPost] = useState<SourcePost | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  useEffect(() => { setSelected([]); setDetailPost(null); }, [selectedProject]);
  const rows = useMemo(() => sourcePosts.filter((post) => {
    const textMatches = `${post.title}${post.topic}${post.author}`.toLowerCase().includes(query.toLowerCase());
    const platformMatches = platform === "all" || post.platform === platform;
    const stateMatches = reviewState === "all" || post.reviewState === reviewState;
    return textMatches && platformMatches && stateMatches;
  }), [sourcePosts, query, platform, reviewState]);
  const allVisibleSelected = rows.length > 0 && rows.every((post) => selected.includes(post.id));

  const applyReview = async (state: SourceReviewState, ids = selected) => {
    if (ids.length === 0) return;
    await updatePostReview(ids, state);
    setSelected([]);
    messageApi.success(`${ids.length} 条帖子已标记为${reviewLabels[state]}`);
  };

  const act = async (id: string, action: ReviewAction) => {
    await updatePostAction(id, action);
    messageApi.success(`已标记为${actionLabels[action]}`);
  };

  const copyAnalysisPrompt = async (post: SourcePost) => {
    await navigator.clipboard.writeText(`请使用 $viral-topic-analysis 分析当前项目的来源帖 ${post.id}，保存爆帖拆解、可审核选题，以及与项目相关的灵感、痛点和真实反馈。不要生成或发布内容。`);
    messageApi.success("已复制 Codex 爆帖分析指令");
  };

  return <>{contextHolder}
    <PageHeader title="爆帖分析" meta="保留真实来源、指标与分析版本；通过后才可转成选题" actions={<Space wrap><Button icon={<CheckCheck size={15} />} onClick={() => applyReview("approved", rows.map((post) => post.id))}>全部通过</Button><Button icon={<Filter size={15} />}>保存视图</Button></Space>} />
    <PanelNotice />
    <section className="panel">
      <div className="panel-body">
        <div className="toolbar"><Input style={{ width: 280 }} prefix={<Search size={14} />} placeholder="搜索标题、作者或话题" value={query} onChange={(event) => setQuery(event.target.value)} /><Select style={{ width: 150 }} value={platform} onChange={setPlatform} options={["all", "TikTok", "小红书", "Reddit", "X", "抖音"].map((value) => ({ value, label: value === "all" ? "全部平台" : value }))} /><Select style={{ width: 140 }} value={reviewState} onChange={setReviewState} options={[{ value: "all", label: "全部状态" }, ...Object.entries(reviewLabels).map(([value, label]) => ({ value, label }))]} /><Button onClick={() => { setQuery(""); setPlatform("all"); setReviewState("all"); }}>重置</Button></div>
        {selected.length > 0 && <div className="batch-bar"><span>已选 {selected.length} 条</span><Space><Button size="small" type="primary" onClick={() => applyReview("approved")}>通过</Button><Button size="small" danger onClick={() => applyReview("rejected")}>拒绝</Button><Button size="small" onClick={() => setSelected([])}>取消选择</Button></Space></div>}
      </div>
      <div className="data-table"><table className="table-main source-table"><thead><tr><th className="selection-col"><Checkbox checked={allVisibleSelected} indeterminate={selected.length > 0 && !allVisibleSelected} onChange={(event) => setSelected(event.target.checked ? rows.map((post) => post.id) : [])} /></th><th>来源内容</th><th>平台</th><th>话题</th><th>互动</th><th>评分</th><th>筛选状态</th><th style={{ textAlign: "right" }}>操作</th></tr></thead><tbody>
        {rows.map((post) => <tr key={post.id}><td className="selection-col"><Checkbox checked={selected.includes(post.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, post.id])] : current.filter((id) => id !== post.id))} /></td><td><div className="source-cell">{post.image ? <Image className="table-post-thumb" src={post.image} preview={{ mask: "预览" }} /> : <div className="table-post-thumb empty-state">无封面</div>}<div><div className="table-title">{post.title}</div><div className="table-sub">{post.author} · {post.published} · {post.reason}</div><Space size={6}><MediaTypeBadge type={post.mediaType} />{post.patternCardVersion && <Tag color="green">分析 v{post.patternCardVersion}</Tag>}</Space></div></div></td><td><PlatformBadge platform={post.platform} /></td><td>{post.topic}</td><td>{post.likes.toLocaleString()} 赞<br /><span className="muted">{post.comments.toLocaleString()} 评论</span></td><td><strong>{post.score}</strong></td><td><span className={`status-badge ${post.reviewState === "approved" ? "status-ready" : post.reviewState === "rejected" ? "status-disconnected" : "status-review"}`}>{reviewLabels[post.reviewState]}</span></td><td><PostActions post={post} onOpen={() => setDetailPost(post)} onAction={(action) => act(post.id, action)} /></td></tr>)}
      </tbody></table></div>
      {rows.length === 0 && <div className="empty-state">没有符合条件的帖子</div>}
    </section>
    <Drawer title="帖子证据与抓取理由" width={540} open={Boolean(detailPost)} onClose={() => setDetailPost(null)} extra={detailPost && <Space><Button danger icon={<X size={14} />} onClick={() => { applyReview("rejected", [detailPost.id]); setDetailPost(null); }}>拒绝</Button><Button type="primary" icon={<CheckCheck size={14} />} onClick={() => { applyReview("approved", [detailPost.id]); setDetailPost(null); }}>通过</Button></Space>}>
      {detailPost && <div className="detail-stack">{detailPost.image && <Image src={detailPost.image} alt={detailPost.title} className="detail-media" />}<Space wrap><PlatformBadge platform={detailPost.platform} /><MediaTypeBadge type={detailPost.mediaType} /><Tag color={detailPost.reviewState === "approved" ? "green" : detailPost.reviewState === "rejected" ? "default" : "gold"}>{reviewLabels[detailPost.reviewState]}</Tag></Space><h2 className="drawer-title">{detailPost.title}</h2><p className="drawer-copy">{detailPost.reason}</p><Space wrap><Button href={detailPost.canonicalUrl} target="_blank" rel="noreferrer" icon={<Filter size={14} />}>打开原帖溯源</Button><Button icon={<Copy size={14} />} onClick={() => copyAnalysisPrompt(detailPost)}>复制 Codex 分析指令</Button></Space><Descriptions column={1} size="small" bordered><Descriptions.Item label="作者">{detailPost.author}</Descriptions.Item><Descriptions.Item label="外部 ID">{detailPost.externalId}</Descriptions.Item><Descriptions.Item label="发布时间">{detailPost.published}</Descriptions.Item><Descriptions.Item label="抓取时间">{detailPost.capturedAt}</Descriptions.Item><Descriptions.Item label="互动">{detailPost.likes.toLocaleString()} 赞 · {detailPost.comments.toLocaleString()} 评论</Descriptions.Item></Descriptions><Divider orientation="left">为什么被雷达选中</Divider><List size="small" dataSource={detailPost.evidence.signals} renderItem={(item) => <List.Item><CheckCheck size={14} color="#3f6f52" />{item}</List.Item>} /><div className="evidence-grid">{detailPost.evidence.scoreBreakdown.map((item) => <div className="evidence-metric" key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>{detailPost.patternCard ? <><Divider orientation="left">爆帖拆解 · v{detailPost.patternCardVersion}</Divider><p className="drawer-copy">{detailPost.patternCard.summary}</p><Descriptions column={1} size="small" bordered><Descriptions.Item label="复刻判断">{detailPost.patternCard.replicationDecision.verdict} · {detailPost.patternCard.replicationDecision.reason}</Descriptions.Item><Descriptions.Item label="Hook">{detailPost.patternCard.production.hook}</Descriptions.Item><Descriptions.Item label="结构">{detailPost.patternCard.production.structure.join(" → ") || "证据不足"}</Descriptions.Item><Descriptions.Item label="视频制作">{detailPost.patternCard.production.videoMethod.join("；") || "证据不足"}</Descriptions.Item><Descriptions.Item label="文章写法">{detailPost.patternCard.production.writingMethod.join("；") || "证据不足"}</Descriptions.Item><Descriptions.Item label="配图类型">{detailPost.patternCard.production.imageTypes.join("、") || "证据不足"}</Descriptions.Item><Descriptions.Item label="可迁移元素">{detailPost.patternCard.replicationDecision.portableElements.join("、") || "无"}</Descriptions.Item><Descriptions.Item label="必须替换">{detailPost.patternCard.replicationDecision.mustReplace.join("、") || "无"}</Descriptions.Item></Descriptions><Divider orientation="left">为什么会火</Divider><List size="small" dataSource={detailPost.patternCard.viralReasons} renderItem={(item) => <List.Item><div><strong>{item.claim}</strong><div className="job-sub">{item.confidence} · {item.evidence.join("；")}</div></div></List.Item>} />{detailPost.patternCard.limitations.length > 0 && <Alert type="warning" showIcon message={`证据限制：${detailPost.patternCard.limitations.join("；")}`} />}</> : <Alert type="info" showIcon message="尚未保存爆帖分析。复制上方指令并在 Codex 中调用仓库级 $viral-topic-analysis Skill。" />}</div>}
    </Drawer>
  </>;
}

function PanelNotice() {
  return <Alert className="section-alert" type="info" showIcon message={<span>这里保存来源事实与分析版本；<strong>只有“已通过”的帖子</strong>才能形成选题。<Link to="/ideas">去选题箱</Link></span>} />;
}
