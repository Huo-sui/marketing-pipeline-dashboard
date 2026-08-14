import { Button, Input, Select, message } from "antd";
import { Filter, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader, PlatformBadge, PostActions } from "../components/Shared";
import { useDemoState } from "../state/demoStateContext";
import type { ReviewAction } from "../types";

const actionLabels: Record<ReviewAction, string> = { unreviewed: "待审核", engage: "评论机会", adapt: "同款机会", ignored: "已忽略" };

export function SourcePostsPage() {
  const { sourcePosts, updatePostAction } = useDemoState();
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [messageApi, contextHolder] = message.useMessage();
  const rows = useMemo(() => sourcePosts.filter((post) => (platform === "all" || post.platform === platform) && `${post.title}${post.topic}${post.author}`.toLowerCase().includes(query.toLowerCase())), [sourcePosts, query, platform]);
  const act = (id: string, action: ReviewAction) => { updatePostAction(id, action); messageApi.success(`已标记为${actionLabels[action]}`); };

  return <>{contextHolder}<PageHeader title="爆帖收件箱" meta="固定 Topic 中最近表现最好的内容" actions={<Button icon={<Filter size={15} />}>保存视图</Button>} />
    <section className="panel">
      <div className="panel-body">
        <div className="toolbar">
          <Input style={{ width: 280 }} prefix={<Search size={14} />} placeholder="搜索标题、作者或话题" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Select style={{ width: 150 }} value={platform} onChange={setPlatform} options={["all", "TikTok", "小红书", "Reddit", "X", "抖音"].map((value) => ({ value, label: value === "all" ? "全部平台" : value }))} />
          <Button onClick={() => { setQuery(""); setPlatform("all"); }}>重置</Button>
        </div>
      </div>
      <div className="data-table"><table className="table-main"><thead><tr><th>来源内容</th><th>平台</th><th>话题</th><th>互动</th><th>评分</th><th>状态</th><th style={{ textAlign: "right" }}>操作</th></tr></thead><tbody>
        {rows.map((post) => <tr key={post.id}><td><div className="table-title">{post.title}</div><div className="table-sub">{post.author} · {post.published}<br />{post.reason}</div></td><td><PlatformBadge platform={post.platform} /></td><td>{post.topic}</td><td>{post.likes.toLocaleString()} 赞<br /><span className="muted">{post.comments.toLocaleString()} 评论</span></td><td><strong>{post.score}</strong></td><td><span className={`status-badge ${post.action === "adapt" ? "status-ready" : post.action === "engage" ? "status-review" : "status-disconnected"}`}>{actionLabels[post.action]}</span></td><td><PostActions post={post} onAction={(action) => act(post.id, action)} /></td></tr>)}
      </tbody></table></div>
    </section>
  </>;
}
