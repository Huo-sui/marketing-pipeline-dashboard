import { Alert, Button, Descriptions, Divider, Drawer, Form, Input, List, Select, Space, Tag, message } from "antd";
import { CheckCheck, ClipboardCopy, Edit3, ImagePlus, RefreshCw, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { PageHeader, Panel, PlatformBadge } from "../components/Shared";
import { controlApi } from "../services/controlApi";
import { useDemoState } from "../state/demoStateContext";
import type { ContentDraftRecord, Platform } from "../types";

const statusMap: Record<ContentDraftRecord["status"], { label: string; color: string }> = {
  pending_review: { label: "待人工审核", color: "gold" },
  approved: { label: "已批准", color: "green" },
  rejected: { label: "已退回", color: "red" },
};
const assetLabels: Record<string, string> = { pending: "待判断", matched: "直接使用项目资产", needs_generation: "按爆款结构生成新图", not_applicable: "不需要媒体资产" };

type DraftEditForm = { title: string; copy: string; assetStrategy: string; imageBrief?: string; videoPrompt?: string };
type ReleaseChoice = { platform?: Platform; accountId?: string };

export function GenerationPage() {
  const { selectedProject, accounts, accountBindings } = useDemoState();
  const [drafts, setDrafts] = useState<ContentDraftRecord[]>([]);
  const [detailDraft, setDetailDraft] = useState<ContentDraftRecord | null>(null);
  const [choices, setChoices] = useState<Record<string, ReleaseChoice>>({});
  const [editForm] = Form.useForm<DraftEditForm>();
  const [messageApi, contextHolder] = message.useMessage();

  const refresh = () => {
    if (!selectedProject) return;
    void controlApi.listContentDrafts(selectedProject).then(setDrafts).catch((error: Error) => messageApi.error(error.message));
  };
  useEffect(() => {
    let active = true;
    setDrafts([]); setDetailDraft(null); setChoices({});
    if (selectedProject) void controlApi.listContentDrafts(selectedProject).then((records) => { if (active) setDrafts(records); }).catch((error: Error) => { if (active) messageApi.error(error.message); });
    return () => { active = false; };
  }, [selectedProject, messageApi]);

  const publishingAccountIds = useMemo(() => new Set(accountBindings.filter((binding) => binding.projectId === selectedProject && binding.roles.includes("publishing")).map((binding) => binding.accountId)), [accountBindings, selectedProject]);
  const publishingAccounts = accounts.filter((account) => publishingAccountIds.has(account.id) && account.lifecycleStatus === "active");

  const openDraft = (draft: ContentDraftRecord) => {
    setDetailDraft(draft);
    editForm.setFieldsValue({ title: draft.revision.title, copy: draft.revision.copy, assetStrategy: draft.revision.assetStrategy, imageBrief: draft.revision.imageBrief, videoPrompt: typeof draft.revision.videoBrief?.prompt === "string" ? draft.revision.videoBrief.prompt : "" });
  };

  const saveDraft = async (values: DraftEditForm) => {
    if (!detailDraft) return;
    await controlApi.patchContentDraft(selectedProject, detailDraft.id, { title: values.title, copy: values.copy, assetStrategy: values.assetStrategy, imageBrief: values.imageBrief ?? "", videoBrief: detailDraft.revision.format === "视频" ? { status: "reserved", prompt: values.videoPrompt ?? "" } : undefined, createdBy: "dashboard" });
    setDetailDraft(null);
    refresh();
    messageApi.success("修改已保存为新的草稿版本，并重置为待审核");
  };

  const review = async (draft: ContentDraftRecord, status: ContentDraftRecord["status"]) => {
    await controlApi.reviewContentDraft(selectedProject, draft.id, status);
    refresh();
    messageApi.success(status === "approved" ? "草稿已批准，可配置发布平台与账号" : "草稿已退回");
  };

  const copyRewritePrompt = async (draft: ContentDraftRecord) => {
    await navigator.clipboard.writeText(`请使用 $content-draft-replication 修改 Marketing Pipeline 的待审草稿 ${draft.id}。读取其锁定的选题与原帖快照，保留来源溯源，按我的下一条要求重写文案；若涉及配图，只能复用已登记项目资产或生成新的结构化相似图片，不得复制原帖素材。保存为新草稿版本，不要批准或发布。`);
    messageApi.success("已复制 Codex 返工指令");
  };

  const copyImagePrompt = async (draft: ContentDraftRecord) => {
    await navigator.clipboard.writeText(`请使用 $content-draft-replication 为 Marketing Pipeline 的待审草稿 ${draft.id} 重新生成配图。先读取项目资产和 imageBrief；输出必须是原创图片或明确复用项目资产，保留模型/提示词/资产来源，并回写新的草稿版本。不要使用原帖图片，不要发布。`);
    messageApi.success("已复制 Codex 重新配图指令");
  };

  const createPublication = async (draft: ContentDraftRecord) => {
    const choice = choices[draft.id] ?? {};
    if (!choice.platform || !choice.accountId) { messageApi.warning("请先选择目标平台和项目内发布账号"); return; }
    await controlApi.createPublicationDraft({ projectId: selectedProject, contentDraftId: draft.id, platform: choice.platform, accountId: choice.accountId });
    messageApi.success("已创建可溯源的 PublicationDraft，请到发布队列做最后确认");
  };

  return <>{contextHolder}
    <PageHeader title="待审草稿" meta="文案、配图策略与来源快照均版本化；批准前可反复人工或 Codex 返工" actions={<Button icon={<RefreshCw size={15} />} onClick={refresh}>刷新</Button>} />
    <Alert className="section-alert" type="info" showIcon message="草稿是独立工作流记录，不等同于生成任务。视频目前只保留制作 Brief 和生成位置，不会创建伪视频成果。" />
    <Panel title="草稿审核" caption="ContentDraft + ContentDraftRevision">
      {drafts.length === 0 ? <div className="empty-state"><strong>还没有待审草稿</strong>先在选题箱批准选题，再将它送入这里。</div> : <div className="progress-stack">{drafts.map((draft) => <div className="job-row generation-job-row" key={draft.id}><div><div className="job-name">{draft.revision.title}</div><div className="job-sub">v{draft.revision.version} · 选题 {draft.ideaId} · {draft.revision.sourceSnapshot.sourcePosts.length} 条原帖来源</div></div><div>{draft.revision.format}</div><div className="job-sub">{assetLabels[draft.revision.assetStrategy] ?? draft.revision.assetStrategy}</div><Tag color={statusMap[draft.status].color}>{statusMap[draft.status].label}</Tag><Space wrap><Button size="small" icon={<Edit3 size={13} />} onClick={() => openDraft(draft)}>审核编辑</Button><Button size="small" icon={<ClipboardCopy size={13} />} onClick={() => copyRewritePrompt(draft)}>Codex 返工</Button>{draft.status !== "approved" && <Button size="small" type="primary" icon={<CheckCheck size={13} />} onClick={() => review(draft, "approved")}>批准</Button>}{draft.status !== "rejected" && <Button size="small" danger icon={<X size={13} />} onClick={() => review(draft, "rejected")}>退回</Button>}</Space></div>)}</div>}
    </Panel>

    <Panel title="发布决策" caption="只有已批准草稿可创建平台发布对象">
      {drafts.filter((draft) => draft.status === "approved").length === 0 ? <div className="empty-state">还没有已批准草稿</div> : <div className="release-list">{drafts.filter((draft) => draft.status === "approved").map((draft) => { const choice = choices[draft.id] ?? {}; const accountOptions = publishingAccounts.filter((account) => !choice.platform || account.platform === choice.platform); return <div className="release-row release-row-expanded" key={draft.id}><div><div className="job-name">{draft.revision.title}</div><div className="job-sub">草稿 v{draft.revision.version} · 原帖 {draft.revision.sourceSnapshot.sourcePosts.length} 条 · {assetLabels[draft.revision.assetStrategy] ?? draft.revision.assetStrategy}</div></div><div className="release-platform-config"><Space wrap><Select placeholder="目标平台" style={{ width: 150 }} value={choice.platform} options={Array.from(new Set(publishingAccounts.map((account) => account.platform))).map((platform) => ({ value: platform, label: platform }))} onChange={(platform) => setChoices((current) => ({ ...current, [draft.id]: { platform, accountId: undefined } }))} /><Select placeholder="发布账号" style={{ width: 200 }} value={choice.accountId} options={accountOptions.map((account) => ({ value: account.id, label: `${account.displayName || account.handle || account.label} · ${account.platform}` }))} onChange={(accountId) => setChoices((current) => ({ ...current, [draft.id]: { ...choice, accountId } }))} /><Button type="primary" icon={<Send size={14} />} onClick={() => createPublication(draft)}>创建发布对象</Button></Space></div></div>; })}</div>}
      {publishingAccounts.length === 0 && <Alert type="warning" showIcon message="当前项目没有带 Publishing 角色的有效账号；发布平台与账号不会在 Publisher 内部临时猜测。" />}
    </Panel>

    <Drawer title="草稿内容、素材与来源" width={650} open={Boolean(detailDraft)} onClose={() => setDetailDraft(null)} extra={<Button type="primary" onClick={() => editForm.submit()}>保存新版本</Button>}>
      {detailDraft && <><Descriptions column={1} size="small" bordered><Descriptions.Item label="草稿 ID">{detailDraft.id}</Descriptions.Item><Descriptions.Item label="来源选题"><Link to="/ideas">{detailDraft.revision.sourceSnapshot.idea.title} · v{detailDraft.revision.sourceSnapshot.idea.version}</Link></Descriptions.Item><Descriptions.Item label="草稿版本">v{detailDraft.revision.version}</Descriptions.Item><Descriptions.Item label="状态"><Tag color={statusMap[detailDraft.status].color}>{statusMap[detailDraft.status].label}</Tag></Descriptions.Item><Descriptions.Item label="资产来源">{assetLabels[detailDraft.revision.assetStrategy] ?? detailDraft.revision.assetStrategy}</Descriptions.Item><Descriptions.Item label="视频处理">{detailDraft.revision.format === "视频" ? "预留 Agent 生成位置，尚无视频成果" : "不适用"}</Descriptions.Item></Descriptions><Divider orientation="left">原帖溯源快照</Divider><List size="small" dataSource={detailDraft.revision.sourceSnapshot.sourcePosts} renderItem={(post) => <List.Item actions={[<Button key="source" href={post.canonicalUrl} target="_blank" rel="noreferrer">打开原帖</Button>]}><List.Item.Meta title={<Space><PlatformBadge platform={post.platform} /><strong>{post.title}</strong></Space>} description={`${post.author} · ${post.externalId}`} /></List.Item>} /><Divider orientation="left">编辑并返工</Divider><Form form={editForm} layout="vertical" onFinish={saveDraft}><Form.Item name="title" label="标题" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item><Form.Item name="copy" label="文案" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={8} /></Form.Item><Form.Item name="assetStrategy" label="图片/资产策略"><Select options={[{ value: "matched", label: "直接使用项目资产" }, { value: "needs_generation", label: "按爆款结构生成原创图片" }, { value: "not_applicable", label: "不需要媒体资产" }, { value: "pending", label: "待判断" }]} /></Form.Item><Form.Item name="imageBrief" label="配图 Brief"><Input.TextArea rows={5} /></Form.Item>{detailDraft.revision.format === "视频" && <Form.Item name="videoPrompt" label="视频生成预留 Brief"><Input.TextArea rows={5} /></Form.Item>}<Space wrap><Button icon={<ClipboardCopy size={14} />} onClick={() => copyRewritePrompt(detailDraft)}>复制 Codex 返工指令</Button><Button icon={<ImagePlus size={14} />} onClick={() => copyImagePrompt(detailDraft)}>复制重新配图指令</Button></Space></Form></>}
    </Drawer>
  </>;
}
