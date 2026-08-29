import { Alert, Button, Checkbox, Descriptions, Divider, Drawer, Form, Input, InputNumber, Select, Space, Tag, message } from "antd";
import { Check, CheckCheck, Plus, Save, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { PageHeader, PlatformBadge } from "../components/Shared";
import { useDemoState } from "../state/demoStateContext";
import { controlApi } from "../services/controlApi";
import type { IdeaFormat, IdeaRecord, IdeaStatus } from "../types";

const columns: { status: IdeaStatus; title: string }[] = [{ status: "candidate", title: "待审核" }, { status: "approved", title: "已批准" }, { status: "rejected", title: "已拒绝" }];
const formats: { value: IdeaFormat; label: string }[] = [{ value: "视频", label: "视频 + 文案" }, { value: "图文", label: "图文" }, { value: "评论", label: "评论" }, { value: "纯文本", label: "纯文本" }];

type GenerationForm = { count: number; format: IdeaFormat; platforms: string[]; instruction?: string };

export function IdeasPage() {
  const { selectedProject, ideas, addIdeas, updateIdeaStatus, updateIdea, sourcePosts } = useDemoState();
  const [generateForm] = Form.useForm<GenerationForm>();
  const [editForm] = Form.useForm<Pick<IdeaRecord, "hook" | "videoPrompt" | "assetMatch" | "copy">>();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [detailIdea, setDetailIdea] = useState<IdeaRecord | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [messageApi, contextHolder] = message.useMessage();
  const approvedSources = sourcePosts.filter((post) => post.reviewState === "approved");

  const openGenerate = () => {
    generateForm.setFieldsValue({ count: 5, format: "视频", platforms: ["TikTok"], instruction: "保留结构，不复制原帖素材；优先匹配项目现有资产。" });
    setGenerateOpen(true);
  };

  const generateIdeas = async (values: GenerationForm) => {
    if (approvedSources.length === 0) {
      messageApi.warning("还没有人工通过的帖子，Idea 层不会越过审核门生成内容");
      return;
    }
    const count = Math.max(1, Math.min(values.count, 50));
    const generated = await controlApi.createIdeas(selectedProject, { count, format: values.format, platforms: values.platforms, sourcePostIds: approvedSources.map((source) => source.id), instruction: values.instruction });
    addIdeas(generated);
    setGenerateOpen(false);
    messageApi.info(`${generated.length} 条 Idea 已写入数据库；当前未调用外部 Agent`);
  };

  const openDetail = (idea: IdeaRecord) => {
    setDetailIdea(idea);
    editForm.setFieldsValue({ hook: idea.hook, videoPrompt: idea.videoPrompt, assetMatch: idea.assetMatch, copy: idea.copy });
  };

  const saveDetail = async (values: Pick<IdeaRecord, "hook" | "videoPrompt" | "assetMatch" | "copy">) => {
    if (!detailIdea) return;
    await updateIdea(detailIdea.id, values);
    setDetailIdea(null);
    messageApi.success("Idea 草稿已保存为新版本");
  };

  const approveSelected = async () => {
    await Promise.all(selected.map((id) => updateIdeaStatus(id, "approved")));
    messageApi.success(`${selected.length} 条 Idea 已批准`);
    setSelected([]);
  };

  return <>{contextHolder}
    <PageHeader title="Idea 工作台" meta="只使用人工通过的帖子；在这里决定数量、类型、资产和 Prompt" actions={<Space wrap><Button icon={<CheckCheck size={15} />} disabled={selected.length === 0} onClick={approveSelected}>批量批准</Button><Button type="primary" icon={<Plus size={15} />} onClick={openGenerate}>生成 N 个 Idea</Button></Space>} />
    <Alert className="section-alert" type="info" showIcon message={<span>当前已通过来源帖 <strong>{approvedSources.length}</strong> 条。Idea 生成不会自动抓取新内容；来源不足时会明确阻止生成。</span>} />
    <div className="idea-config-strip"><div><span className="muted">默认输出</span><strong>5 条</strong></div><div><span className="muted">视频 Idea 必须携带</span><strong>VideoSpec / Prompt</strong></div><div><span className="muted">项目资产</span><Link to="/assets">查看资产库</Link></div></div>
    <div className="kanban">{columns.map((column) => { const items = ideas.filter((idea) => idea.status === column.status); return <section className="kanban-column" key={column.status}><header className="kanban-header"><span>{column.title}</span><span>{items.length}</span></header>{items.length === 0 ? <div className="empty-state">暂无内容</div> : items.map((idea) => <article className="idea-card" key={idea.id}><div className="idea-card-select"><Checkbox checked={selected.includes(idea.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, idea.id] : current.filter((id) => id !== idea.id))} /><button className="idea-card-button" onClick={() => openDetail(idea)}><h3 className="entity-title">{idea.title}</h3><div className="entity-subtitle">{idea.format} · 来源 {idea.source} · {idea.updatedAt ?? "—"}</div></button></div><p className="idea-hook">{idea.hook}</p><div className="topic-tags">{idea.platforms.map((platform) => <PlatformBadge key={platform} platform={platform} />)}{idea.assetMatch && <Tag color={idea.assetMatch === "matched" ? "green" : idea.assetMatch === "needs_generation" ? "orange" : "blue"}>{idea.assetMatch === "matched" ? "已有资产" : idea.assetMatch === "needs_generation" ? "需要生图" : "待匹配"}</Tag>}</div><div className="idea-provenance"><span>批次 {idea.generationBatchId ?? "手动"}</span>{idea.format === "视频" && <span>Prompt 已携带</span>}</div><div className="idea-actions" style={{ marginTop: 12 }}>{column.status !== "rejected" && <Button size="small" icon={<X size={13} />} onClick={() => updateIdeaStatus(idea.id, "rejected")}>拒绝</Button>}{column.status !== "approved" && <Button size="small" type="primary" icon={<Check size={13} />} onClick={() => updateIdeaStatus(idea.id, "approved")}>批准</Button>}</div></article>)}</section>; })}</div>
    <Drawer title="Idea 详情与可编辑 Prompt" width={560} open={Boolean(detailIdea)} onClose={() => setDetailIdea(null)} extra={<Button type="primary" icon={<Save size={14} />} onClick={() => editForm.submit()}>保存版本</Button>}>
      {detailIdea && <Form form={editForm} layout="vertical" onFinish={saveDetail}><Descriptions column={1} size="small" bordered><Descriptions.Item label="Idea ID">{detailIdea.id}</Descriptions.Item><Descriptions.Item label="来源帖"><Link to="/source-posts">{detailIdea.source}</Link></Descriptions.Item><Descriptions.Item label="类型">{detailIdea.format}</Descriptions.Item><Descriptions.Item label="目标平台">{detailIdea.platforms.join("、")}</Descriptions.Item></Descriptions><Divider orientation="left">Idea 内容</Divider><Form.Item name="hook" label="Hook"><Input.TextArea rows={3} /></Form.Item><Form.Item name="copy" label="文案（由 Gemini Agent 生成，可人工改）"><Input.TextArea rows={4} /></Form.Item>{detailIdea.format === "视频" && <Form.Item name="videoPrompt" label="VideoSpec / 视频 Prompt"><Input.TextArea rows={7} /></Form.Item>}<Form.Item name="assetMatch" label="资产决策"><Select options={[{ value: "pending", label: "待判断" }, { value: "matched", label: "匹配现有资产" }, { value: "needs_generation", label: "交给生图管线" }, { value: "not_applicable", label: "不需要资产" }]} /></Form.Item></Form>}
    </Drawer>
    <Drawer title="生成 Idea 批次" width={440} open={generateOpen} onClose={() => setGenerateOpen(false)} extra={<Button type="primary" onClick={() => generateForm.submit()}>创建数据库批次</Button>}><Form form={generateForm} layout="vertical" onFinish={generateIdeas}><Form.Item name="count" label="输出数量 N" rules={[{ required: true }]}><InputNumber min={1} max={50} className="full-width" /></Form.Item><Form.Item name="format" label="Idea 类型"><Select options={formats} /></Form.Item><Form.Item name="platforms" label="目标平台"><Select mode="multiple" options={["TikTok", "小红书", "抖音", "Reddit", "X", "Instagram"].map((platform) => ({ value: platform, label: platform }))} /></Form.Item><Form.Item name="instruction" label="本批次额外要求"><Input.TextArea rows={5} /></Form.Item><Alert type="info" showIcon message="当前只写入 Idea、Revision、Source 和平台目标记录，未调用外部 Agent。" /></Form></Drawer>
  </>;
}
