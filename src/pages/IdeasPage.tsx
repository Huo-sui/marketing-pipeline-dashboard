import { Alert, Button, Checkbox, Descriptions, Divider, Drawer, Form, Input, List, Select, Space, Tag, message } from "antd";
import { Check, CheckCheck, ClipboardCopy, Edit3, FilePlus2, Lightbulb, Plus, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { PageHeader, Panel, PlatformBadge } from "../components/Shared";
import { controlApi } from "../services/controlApi";
import { useDemoState } from "../state/demoStateContext";
import type { IdeaFormat, IdeaRecord, IdeaStatus, InsightEvidenceType, InsightKind, InsightRecord, Platform } from "../types";

const columns: { status: IdeaStatus; title: string }[] = [{ status: "candidate", title: "待终审" }, { status: "approved", title: "已通过" }, { status: "rejected", title: "已退回" }];
const formats: { value: IdeaFormat; label: string }[] = [{ value: "视频", label: "视频（预留生成位）" }, { value: "图文", label: "图文" }, { value: "纯文本", label: "纯文本" }, { value: "评论", label: "评论方向" }];
const platforms: Platform[] = ["TikTok", "小红书", "抖音", "Reddit", "X", "Instagram"];
const assetOptions = [
  { value: "pending", label: "待判断" },
  { value: "matched", label: "直接使用项目资产" },
  { value: "needs_generation", label: "按爆款结构生成新图" },
  { value: "not_applicable", label: "不需要图片/视频资产" },
];
const insightLabels: Record<InsightKind, { title: string; color: string }> = {
  inspiration: { title: "灵感", color: "blue" },
  pain_point: { title: "痛点", color: "red" },
  feedback: { title: "真实反馈", color: "green" },
};

type TopicForm = Pick<IdeaRecord, "title" | "hook" | "format" | "copy" | "videoPrompt" | "imageBrief" | "assetMatch"> & { sourcePostIds: string[]; platforms: Platform[] };
type InsightForm = Pick<InsightRecord, "kind" | "title" | "detail" | "evidenceType" | "status"> & { sourcePostId?: string };

export function IdeasPage() {
  const { selectedProject, ideas, addIdeas, updateIdeaStatus, updateIdea, sourcePosts } = useDemoState();
  const [topicForm] = Form.useForm<TopicForm>();
  const [editForm] = Form.useForm<Partial<IdeaRecord>>();
  const [insightForm] = Form.useForm<InsightForm>();
  const [topicOpen, setTopicOpen] = useState(false);
  const [detailIdea, setDetailIdea] = useState<IdeaRecord | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [insights, setInsights] = useState<InsightRecord[]>([]);
  const [insightOpen, setInsightOpen] = useState(false);
  const [editingInsight, setEditingInsight] = useState<InsightRecord | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const eligibleSources = sourcePosts;
  const sourceTitle = useMemo(() => new Map(sourcePosts.map((post) => [post.id, post.title])), [sourcePosts]);

  const refreshInsights = () => { if (!selectedProject) return; void controlApi.listInsights(selectedProject).then(setInsights).catch((error: Error) => messageApi.error(error.message)); };
  useEffect(() => {
    let active = true;
    setSelected([]); setDetailIdea(null); setEditingInsight(null); setInsightOpen(false); setTopicOpen(false); setInsights([]);
    if (selectedProject) void controlApi.listInsights(selectedProject).then((records) => { if (active) setInsights(records); }).catch((error: Error) => { if (active) messageApi.error(error.message); });
    return () => { active = false; };
  }, [selectedProject, messageApi]);

  const openTopic = () => {
    topicForm.setFieldsValue({ title: "", hook: "", format: "图文", copy: "", sourcePostIds: eligibleSources.slice(0, 1).map((source) => source.id), platforms: ["小红书"], assetMatch: "pending", imageBrief: "" });
    setTopicOpen(true);
  };

  const createTopic = async (values: TopicForm) => {
    const generated = await controlApi.createIdeas(selectedProject, { count: 1, sourcePostIds: values.sourcePostIds, platforms: values.platforms, ideas: [values], createdBy: "dashboard" });
    addIdeas(generated);
    setTopicOpen(false);
    messageApi.success("选题已进入人工终审");
  };

  const openDetail = (idea: IdeaRecord) => {
    setDetailIdea(idea);
    editForm.setFieldsValue({ title: idea.title, hook: idea.hook, format: idea.format, videoPrompt: idea.videoPrompt, imageBrief: idea.imageBrief, assetMatch: idea.assetMatch, assetIds: idea.assetIds, copy: idea.copy });
  };

  const saveDetail = async (values: Partial<IdeaRecord>) => {
    if (!detailIdea) return;
    await updateIdea(detailIdea.id, values);
    setDetailIdea(null);
    messageApi.success("选题修改已保存为新版本");
  };

  const approveSelected = async () => {
    await Promise.all(selected.map((id) => updateIdeaStatus(id, "approved")));
    messageApi.success(`${selected.length} 条选题已通过终审`);
    setSelected([]);
  };

  const createReviewDraft = async (idea: IdeaRecord) => {
    await controlApi.createContentDraft({ projectId: selectedProject, ideaId: idea.id, title: idea.title, format: idea.format, copy: idea.copy ?? "", assetStrategy: idea.assetMatch, assetIds: idea.assetIds ?? [], imageBrief: idea.imageBrief ?? "", videoBrief: idea.format === "视频" ? { status: "reserved", prompt: idea.videoPrompt ?? "" } : undefined, createdBy: "dashboard" });
    messageApi.success("已创建待审草稿，来源选题与原帖快照已锁定");
  };

  const copySkillPrompt = async () => {
    await navigator.clipboard.writeText("请使用 $viral-topic-analysis 分析当前项目爆帖收件箱中的规则合格来源，结合项目方向与资产，生成可终审选题，并把痛点、反馈和灵感保存到灵感箱。不要自动批准、生成媒体或发布。");
    messageApi.success("已复制 Codex Skill 指令");
  };

  const openInsight = (record?: InsightRecord) => {
    setEditingInsight(record ?? null);
    insightForm.setFieldsValue(record ? { kind: record.kind, title: record.title, detail: record.detail, evidenceType: record.evidenceType, sourcePostId: record.sourcePostId, status: record.status } : { kind: "inspiration", title: "", detail: "", evidenceType: "inference", status: "pending" });
    setInsightOpen(true);
  };

  const saveInsight = async (values: InsightForm) => {
    if (editingInsight) await controlApi.patchInsight(selectedProject, editingInsight.id, values);
    else await controlApi.createInsight({ projectId: selectedProject, kind: values.kind, title: values.title, detail: values.detail, evidenceType: values.evidenceType, sourcePostId: values.sourcePostId, commentIds: [], status: values.status, createdBy: "dashboard" });
    setInsightOpen(false);
    refreshInsights();
    messageApi.success(editingInsight ? "灵感记录已更新" : "已加入灵感箱");
  };

  return <>{contextHolder}
    <PageHeader title="选题箱" meta="Agent 将爆帖证据转化为可编辑选题；人工终审从这里开始" actions={<Space wrap><Button icon={<ClipboardCopy size={15} />} onClick={copySkillPrompt}>复制 Codex 分析指令</Button><Button icon={<CheckCheck size={15} />} disabled={selected.length === 0} onClick={approveSelected}>批量通过</Button><Button type="primary" icon={<Plus size={15} />} disabled={eligibleSources.length === 0} onClick={openTopic}>新增人工选题</Button></Space>} />
    <Alert className="section-alert" type="info" showIcon message={<span>爆帖收件箱中有 <strong>{eligibleSources.length}</strong> 条规则合格来源，可直接交给仓库级 <code>$viral-topic-analysis</code> Skill 生成选题；人工通过或退回只作用于选题。</span>} />
    <div className="idea-config-strip"><div><span className="muted">来源门槛</span><strong>TopicWatch 硬门槛</strong></div><div><span className="muted">图片策略</span><strong>项目资产 / 结构化生图</strong></div><div><span className="muted">视频</span><strong>仅预留生成位</strong></div><div><span className="muted">项目资产</span><Link to="/assets">查看资产库</Link></div></div>
    <div className="kanban">{columns.map((column) => { const items = ideas.filter((idea) => idea.status === column.status); return <section className="kanban-column" key={column.status}><header className="kanban-header"><span>{column.title}</span><span>{items.length}</span></header>{items.length === 0 ? <div className="empty-state">暂无内容</div> : items.map((idea) => <article className="idea-card" key={idea.id}><div className="idea-card-select"><Checkbox checked={selected.includes(idea.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, idea.id])] : current.filter((id) => id !== idea.id))} /><button className="idea-card-button" onClick={() => openDetail(idea)}><h3 className="entity-title">{idea.title}</h3><div className="entity-subtitle">{idea.format} · {idea.sourcePostIds?.length ?? 0} 条来源 · {idea.updatedAt ?? "—"}</div></button></div><p className="idea-hook">{idea.hook || "尚未填写 Hook"}</p><div className="topic-tags">{idea.platforms.map((platform) => <PlatformBadge key={platform} platform={platform} />)}{idea.assetMatch && <Tag color={idea.assetMatch === "matched" ? "green" : idea.assetMatch === "needs_generation" ? "orange" : "blue"}>{assetOptions.find((option) => option.value === idea.assetMatch)?.label}</Tag>}</div><div className="idea-provenance"><span>批次 {idea.generationBatchId ?? "手动"}</span>{idea.format === "视频" && <span>视频生成位已预留</span>}</div><div className="idea-actions" style={{ marginTop: 12 }}><Space wrap>{column.status !== "rejected" && <Button size="small" icon={<X size={13} />} onClick={() => updateIdeaStatus(idea.id, "rejected")}>退回</Button>}{column.status !== "approved" && <Button size="small" type="primary" icon={<Check size={13} />} onClick={() => updateIdeaStatus(idea.id, "approved")}>通过</Button>}{column.status === "approved" && <Button size="small" type="primary" icon={<FilePlus2 size={13} />} onClick={() => createReviewDraft(idea)}>进入待审草稿</Button>}</Space></div></article>)}</section>; })}</div>

    <Panel title="灵感箱" caption="单独保存与项目相关的灵感、痛点和真实反馈" action={<Button icon={<Lightbulb size={14} />} onClick={() => openInsight()}>新增记录</Button>}>
      {insights.length === 0 ? <div className="empty-state"><strong>还没有灵感记录</strong>可以人工添加，也可以让爆帖分析 Skill 从帖子与真实评论证据中提炼。</div> : <List dataSource={insights} renderItem={(record) => <List.Item actions={[<Button key="edit" size="small" icon={<Edit3 size={13} />} onClick={() => openInsight(record)}>编辑</Button>]}><List.Item.Meta title={<Space><Tag color={insightLabels[record.kind].color}>{insightLabels[record.kind].title}</Tag><strong>{record.title}</strong><Tag>{record.status === "approved" ? "已确认" : record.status === "rejected" ? "已排除" : "待确认"}</Tag></Space>} description={<><div>{record.detail}</div><div className="job-sub">证据：{record.evidenceType === "comment" ? "真实评论" : record.evidenceType === "post" ? "原帖" : "分析推断"}{record.sourcePostId && <> · <Link to="/source-posts">来源帖 {sourceTitle.get(record.sourcePostId) ?? record.sourcePostId}</Link></>}</div></>} /></List.Item>} />}
    </Panel>

    <Drawer title="选题详情与人工终审" width={600} open={Boolean(detailIdea)} onClose={() => setDetailIdea(null)} extra={<Button type="primary" icon={<Save size={14} />} onClick={() => editForm.submit()}>保存新版本</Button>}>
      {detailIdea && <Form form={editForm} layout="vertical" onFinish={saveDetail}><Descriptions column={1} size="small" bordered><Descriptions.Item label="选题 ID">{detailIdea.id}</Descriptions.Item><Descriptions.Item label="来源原帖">{detailIdea.sourcePostIds?.map((id) => <div key={id}><Link to="/source-posts">{sourceTitle.get(id) ?? id}</Link></div>) || "—"}</Descriptions.Item><Descriptions.Item label="目标平台">{detailIdea.platforms.join("、")}</Descriptions.Item></Descriptions><Divider orientation="left">可编辑内容</Divider><Form.Item name="title" label="选题标题" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="format" label="内容类型"><Select options={formats} /></Form.Item><Form.Item name="hook" label="Hook"><Input.TextArea rows={3} /></Form.Item><Form.Item name="copy" label="文案草稿（人工或 Codex 反复修改）"><Input.TextArea rows={6} /></Form.Item><Form.Item name="assetMatch" label="图片/资产策略"><Select options={assetOptions} /></Form.Item><Form.Item name="imageBrief" label="配图说明 / 生图 Brief"><Input.TextArea rows={5} placeholder="说明直接复用哪些项目资产，或描述要新生成的图片结构；不要默认复用原帖素材。" /></Form.Item>{detailIdea.format === "视频" && <Form.Item name="videoPrompt" label="视频生成预留位"><Input.TextArea rows={6} placeholder="当前只保存制作 Brief，不声称已经生成视频。" /></Form.Item>}</Form>}
    </Drawer>

    <Drawer title="新增人工选题" width={520} open={topicOpen} onClose={() => setTopicOpen(false)} extra={<Button type="primary" onClick={() => topicForm.submit()}>加入选题箱</Button>}><Form form={topicForm} layout="vertical" onFinish={createTopic}><Form.Item name="sourcePostIds" label="来源帖" rules={[{ required: true }]}><Select mode="multiple" options={eligibleSources.map((source) => ({ value: source.id, label: source.title }))} /></Form.Item><Form.Item name="title" label="选题标题" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item><Form.Item name="hook" label="Hook" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={3} /></Form.Item><Form.Item name="format" label="内容类型"><Select options={formats} /></Form.Item><Form.Item name="platforms" label="目标平台"><Select mode="multiple" options={platforms.map((platform) => ({ value: platform, label: platform }))} /></Form.Item><Form.Item name="copy" label="初稿"><Input.TextArea rows={5} /></Form.Item><Form.Item name="assetMatch" label="图片/资产策略"><Select options={assetOptions} /></Form.Item><Form.Item name="imageBrief" label="配图说明"><Input.TextArea rows={4} /></Form.Item><Alert type="info" showIcon message="这里保存你明确填写的选题，不会复制占位内容凑数量。批量生成请使用仓库级爆帖分析 Skill。" /></Form></Drawer>

    <Drawer title={editingInsight ? "编辑灵感记录" : "新增灵感记录"} width={500} open={insightOpen} onClose={() => setInsightOpen(false)} extra={<Button type="primary" icon={<Save size={14} />} onClick={() => insightForm.submit()}>保存</Button>}><Form form={insightForm} layout="vertical" onFinish={saveInsight}><Form.Item name="kind" label="类型"><Select options={(Object.entries(insightLabels) as Array<[InsightKind, { title: string; color: string }]>).map(([value, item]) => ({ value, label: item.title }))} /></Form.Item><Form.Item name="title" label="标题" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item><Form.Item name="detail" label="详情" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={7} /></Form.Item><Form.Item name="evidenceType" label="证据类型"><Select options={([{ value: "inference", label: "分析推断" }, { value: "post", label: "原帖证据" }, { value: "comment", label: "真实评论证据" }] satisfies Array<{ value: InsightEvidenceType; label: string }>)} /></Form.Item><Form.Item name="sourcePostId" label="关联来源帖（可选）"><Select allowClear showSearch optionFilterProp="label" options={sourcePosts.map((source) => ({ value: source.id, label: source.title }))} /></Form.Item><Form.Item name="status" label="确认状态"><Select options={[{ value: "pending", label: "待确认" }, { value: "approved", label: "已确认" }, { value: "rejected", label: "已排除" }]} /></Form.Item></Form></Drawer>
  </>;
}
