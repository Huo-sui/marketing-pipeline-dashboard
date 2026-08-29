import { Alert, Button, Checkbox, Descriptions, Divider, Drawer, Image, Input, List, Select, Space, Tag, message } from "antd";
import { CheckCheck, Filter, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { MediaTypeBadge, PageHeader, PlatformBadge, PostActions } from "../components/Shared";
import { useDemoState } from "../state/demoStateContext";
import type { ReviewAction, SourcePost, SourceReviewState } from "../types";

const actionLabels: Record<ReviewAction, string> = { unreviewed: "未指定", engage: "评论机会", adapt: "同款机会", ignored: "已忽略" };
const reviewLabels: Record<SourceReviewState, string> = { pending: "待筛选", approved: "已通过", rejected: "已拒绝" };

export function SourcePostsPage() {
  const { sourcePosts, updatePostAction, updatePostReview } = useDemoState();
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [reviewState, setReviewState] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [detailPost, setDetailPost] = useState<SourcePost | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
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

  return <>{contextHolder}
    <PageHeader title="爆帖收件箱" meta="抓取层保留事实、媒体证据和 Agent 解释；Idea 只读取人工通过的帖子" actions={<Space wrap><Button icon={<CheckCheck size={15} />} onClick={() => applyReview("approved", rows.map((post) => post.id))}>全部通过</Button><Button icon={<Filter size={15} />}>保存视图</Button></Space>} />
    <PanelNotice />
    <section className="panel">
      <div className="panel-body">
        <div className="toolbar"><Input style={{ width: 280 }} prefix={<Search size={14} />} placeholder="搜索标题、作者或话题" value={query} onChange={(event) => setQuery(event.target.value)} /><Select style={{ width: 150 }} value={platform} onChange={setPlatform} options={["all", "TikTok", "小红书", "Reddit", "X", "抖音"].map((value) => ({ value, label: value === "all" ? "全部平台" : value }))} /><Select style={{ width: 140 }} value={reviewState} onChange={setReviewState} options={[{ value: "all", label: "全部状态" }, ...Object.entries(reviewLabels).map(([value, label]) => ({ value, label }))]} /><Button onClick={() => { setQuery(""); setPlatform("all"); setReviewState("all"); }}>重置</Button></div>
        {selected.length > 0 && <div className="batch-bar"><span>已选 {selected.length} 条</span><Space><Button size="small" type="primary" onClick={() => applyReview("approved")}>通过</Button><Button size="small" danger onClick={() => applyReview("rejected")}>拒绝</Button><Button size="small" onClick={() => setSelected([])}>取消选择</Button></Space></div>}
      </div>
      <div className="data-table"><table className="table-main source-table"><thead><tr><th className="selection-col"><Checkbox checked={allVisibleSelected} indeterminate={selected.length > 0 && !allVisibleSelected} onChange={(event) => setSelected(event.target.checked ? rows.map((post) => post.id) : [])} /></th><th>来源内容</th><th>平台</th><th>话题</th><th>互动</th><th>评分</th><th>筛选状态</th><th style={{ textAlign: "right" }}>操作</th></tr></thead><tbody>
        {rows.map((post) => <tr key={post.id}><td className="selection-col"><Checkbox checked={selected.includes(post.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, post.id])] : current.filter((id) => id !== post.id))} /></td><td><div className="source-cell"><Image className="table-post-thumb" src={post.image} preview={{ mask: "预览" }} /><div><div className="table-title">{post.title}</div><div className="table-sub">{post.author} · {post.published} · {post.reason}</div><MediaTypeBadge type={post.mediaType} /></div></div></td><td><PlatformBadge platform={post.platform} /></td><td>{post.topic}</td><td>{post.likes.toLocaleString()} 赞<br /><span className="muted">{post.comments.toLocaleString()} 评论</span></td><td><strong>{post.score}</strong></td><td><span className={`status-badge ${post.reviewState === "approved" ? "status-ready" : post.reviewState === "rejected" ? "status-disconnected" : "status-review"}`}>{reviewLabels[post.reviewState]}</span></td><td><PostActions post={post} onOpen={() => setDetailPost(post)} onAction={(action) => act(post.id, action)} /></td></tr>)}
      </tbody></table></div>
      {rows.length === 0 && <div className="empty-state">没有符合条件的帖子</div>}
    </section>
    <Drawer title="帖子证据与抓取理由" width={540} open={Boolean(detailPost)} onClose={() => setDetailPost(null)} extra={detailPost && <Space><Button danger icon={<X size={14} />} onClick={() => { applyReview("rejected", [detailPost.id]); setDetailPost(null); }}>拒绝</Button><Button type="primary" icon={<CheckCheck size={14} />} onClick={() => { applyReview("approved", [detailPost.id]); setDetailPost(null); }}>通过</Button></Space>}>
      {detailPost && <div className="detail-stack"><Image src={detailPost.image} alt={detailPost.title} className="detail-media" /><Space wrap><PlatformBadge platform={detailPost.platform} /><MediaTypeBadge type={detailPost.mediaType} /><Tag color={detailPost.reviewState === "approved" ? "green" : detailPost.reviewState === "rejected" ? "default" : "gold"}>{reviewLabels[detailPost.reviewState]}</Tag></Space><h2 className="drawer-title">{detailPost.title}</h2><p className="drawer-copy">{detailPost.reason}</p><Button href={detailPost.canonicalUrl} target="_blank" rel="noreferrer" icon={<Filter size={14} />}>打开原帖溯源</Button><Descriptions column={1} size="small" bordered><Descriptions.Item label="作者">{detailPost.author}</Descriptions.Item><Descriptions.Item label="外部 ID">{detailPost.externalId}</Descriptions.Item><Descriptions.Item label="发布时间">{detailPost.published}</Descriptions.Item><Descriptions.Item label="抓取时间">{detailPost.capturedAt}</Descriptions.Item><Descriptions.Item label="互动">{detailPost.likes.toLocaleString()} 赞 · {detailPost.comments.toLocaleString()} 评论</Descriptions.Item></Descriptions><Divider orientation="left">Agent 为什么抓取</Divider><List size="small" dataSource={detailPost.evidence.signals} renderItem={(item) => <List.Item><CheckCheck size={14} color="#3f6f52" />{item}</List.Item>} /><div className="evidence-grid">{detailPost.evidence.scoreBreakdown.map((item) => <div className="evidence-metric" key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>{detailPost.patternCard && <><Divider orientation="left">视频 PatternCard</Divider><Descriptions column={1} size="small"><Descriptions.Item label="Hook">{detailPost.patternCard.hook}（{detailPost.patternCard.hookSeconds ?? "—"} 秒）</Descriptions.Item><Descriptions.Item label="结构">{detailPost.patternCard.structure}</Descriptions.Item><Descriptions.Item label="节奏">{detailPost.patternCard.shotRhythm}</Descriptions.Item><Descriptions.Item label="画面文字">{detailPost.patternCard.onScreenText}</Descriptions.Item><Descriptions.Item label="可替换元素">{detailPost.patternCard.replaceableElements.join("、")}</Descriptions.Item></Descriptions></>}</div>}
    </Drawer>
  </>;
}

function PanelNotice() {
  return <Alert className="section-alert" type="info" showIcon message={<span>审核是 Idea 层的硬门槛：<strong>只有“已通过”的帖子</strong>才能进入 Idea 生成。<Link to="/ideas">去 Idea 工作台</Link></span>} />;
}
