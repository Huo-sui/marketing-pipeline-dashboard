import { Button, message } from "antd";
import { Check, Plus, X } from "lucide-react";
import { PageHeader, PlatformBadge } from "../components/Shared";
import { useDemoState } from "../state/demoStateContext";
import type { IdeaStatus } from "../types";

const columns: { status: IdeaStatus; title: string }[] = [{ status: "candidate", title: "待审核" }, { status: "approved", title: "已批准" }, { status: "rejected", title: "已拒绝" }];

export function IdeasPage() {
  const { ideas, updateIdeaStatus } = useDemoState();
  const [messageApi, contextHolder] = message.useMessage();
  const move = (id: string, status: IdeaStatus) => { updateIdeaStatus(id, status); messageApi.success(status === "approved" ? "Idea 已进入生成准备" : "Idea 状态已更新"); };
  return <>{contextHolder}<PageHeader title="Idea 审核" meta="评论机会与跨平台同款方向" actions={<Button type="primary" icon={<Plus size={15} />}>手动创建</Button>} />
    <div className="kanban">{columns.map((column) => { const items = ideas.filter((idea) => idea.status === column.status); return <section className="kanban-column" key={column.status}><header className="kanban-header"><span>{column.title}</span><span>{items.length}</span></header>
      {items.length === 0 ? <div className="empty-state">暂无内容</div> : items.map((idea) => <article className="idea-card" key={idea.id}><div className="entity-card-header"><div><h3 className="entity-title">{idea.title}</h3><div className="entity-subtitle">{idea.format} · 来源 {idea.source}</div></div></div><p className="idea-hook">{idea.hook}</p><div className="topic-tags">{idea.platforms.map((platform) => <PlatformBadge key={platform} platform={platform} />)}</div><div className="idea-actions" style={{ marginTop: 12 }}>
        {column.status !== "rejected" && <Button size="small" icon={<X size={13} />} onClick={() => move(idea.id, "rejected")}>拒绝</Button>}
        {column.status !== "approved" && <Button size="small" type="primary" icon={<Check size={13} />} onClick={() => move(idea.id, "approved")}>批准</Button>}
      </div></article>)}</section>; })}</div>
  </>;
}
