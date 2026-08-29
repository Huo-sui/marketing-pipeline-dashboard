import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  Progress,
  Space,
  Tag,
  message,
} from "antd";
import { CheckCheck, Eye, RotateCcw, Send, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { PageHeader, Panel, PlatformBadge } from "../components/Shared";
import { controlApi } from "../services/controlApi";
import { useDemoState } from "../state/demoStateContext";
import type { GenerationJob, Platform } from "../types";

const statusMap = {
  running: ["生成中", "status-running"],
  review: ["待审计", "status-review"],
  ready: ["已就绪", "status-ready"],
  queued: ["等待中", "status-disconnected"],
} as const;

const platforms: Platform[] = ["TikTok", "抖音", "小红书", "Reddit", "X", "Instagram"];
const previewImages: Record<string, string> = {
  "job-01": "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?auto=format&fit=crop&w=480&q=80",
  "job-02": "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=480&q=80",
  "job-03": "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=480&q=80",
};

export function GenerationPage() {
  const { selectedProject } = useDemoState();
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [detailJob, setDetailJob] = useState<GenerationJob | null>(null);
  const [selected, setSelected] = useState<Record<string, Platform[]>>(
    {},
  );
  const [editForm] = Form.useForm<Pick<GenerationJob, "prompt" | "copy">>();
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => { if (!selectedProject) return; void controlApi.listGenerationRuns(selectedProject).then(setJobs).catch((error: Error) => messageApi.error(error.message)); }, [selectedProject, messageApi]);

  const readyJobs = useMemo(() => jobs.filter((job) => job.status === "ready" && job.ideaId), [jobs]);
  const selectedFor = (jobId: string) => selected[jobId] ?? [];
  const versions = readyJobs.reduce((sum, job) => sum + selectedFor(job.id).length, 0);

  const openJob = (job: GenerationJob) => {
    setDetailJob(job);
    editForm.setFieldsValue({ prompt: job.prompt, copy: job.copy });
  };

  const saveJob = async (values: Pick<GenerationJob, "prompt" | "copy">) => {
    if (!detailJob) return;
    const updated = await controlApi.patchGenerationRun(detailJob.id, values);
    setJobs((items) => items.map((job) => job.id === detailJob.id ? { ...job, ...updated, ...values } : job));
    setDetailJob(null);
    messageApi.success("生成规格已保存");
  };

  const markReady = (job: GenerationJob) => {
    messageApi.info(`任务 ${job.id} 尚未有真实 Provider 输出，不能标记为已就绪`);
  };

  const createDrafts = () => {
    if (versions === 0) {
      messageApi.warning("至少选择一个目标平台后才能创建 PublicationDraft");
      return;
    }
    void Promise.all(readyJobs.flatMap((job) => selectedFor(job.id).map((platform) => controlApi.createPublicationDraft({ projectId: selectedProject, platform, ideaId: job.ideaId }))))
      .then(() => messageApi.success("PublicationDraft 已写入数据库"))
      .catch((error: Error) => messageApi.error(error.message));
  };

  return <>
    {contextHolder}
    <PageHeader
      title="生成、审计与发布决策"
      meta="批准内容后生成目标平台版本；账号与发布执行将在后续纵切中接入"
      actions={<Button icon={<SlidersHorizontal size={15} />} onClick={() => messageApi.info("Worker 配置将在 API 接入阶段迁移到 Provider 设置")}>Worker 配置</Button>}
    />
    <Alert className="section-alert" type="info" showIcon message="生成 Provider 尚未配置；页面只展示数据库中的真实任务，不会用 Demo 任务冒充执行结果。" />
    <Panel title="生成任务" caption="PostgreSQL GenerationRun">
      <div className="progress-stack">
        {jobs.map((job) => <div className="job-row generation-job-row" key={job.id}>
          <div>
            <div className="job-name">{job.title}</div>
            <div className="job-sub">{job.provider} · {job.updated}{job.ideaId && <> · <Link to="/ideas">Idea {job.ideaId}</Link></>}</div>
          </div>
          <div>{job.type}</div>
          <Progress percent={job.progress} showInfo={false} strokeColor="#3f6f52" />
          <span className={`status-badge ${statusMap[job.status][1]}`}>{statusMap[job.status][0]}</span>
          <Space>
            <Button size="small" icon={<Eye size={13} />} onClick={() => openJob(job)}>审计</Button>
            {job.status === "review" && <Button size="small" type="primary" icon={<CheckCheck size={13} />} onClick={() => markReady(job)}>通过</Button>}
          </Space>
        </div>)}
      </div>
    </Panel>

    <div className="release-layout generation-decision-layout">
      <Panel title="发布决策" caption="生成层 · 只显示审计通过的成果">
        {readyJobs.length === 0 ? <div className="empty-state"><strong>暂无可配置成果</strong>先通过生成审计，再选择目标平台。</div> : <div className="release-list">
          {readyJobs.map((job) => <div className="release-row release-row-expanded" key={job.id}>
            <img className="release-preview" src={previewImages[job.id]} alt={`${job.title} Demo 预览`} />
            <div>
              <div className="job-name">{job.title}</div>
              <div className="job-sub">{job.type} · Idea {job.ideaId} · {job.artifacts?.map((artifact) => artifact.id).join(" / ")}</div>
            </div>
            <div className="release-platform-config">
              <Checkbox.Group value={selectedFor(job.id)} onChange={(values) => setSelected((state) => ({ ...state, [job.id]: values as Platform[] }))}>
                <div className="platform-checks">
                  {platforms.map((platform) => <Checkbox key={platform} value={platform}><PlatformBadge platform={platform} /></Checkbox>)}
                </div>
              </Checkbox.Group>
            </div>
          </div>)}
        </div>}
      </Panel>
      <Panel title="决策摘要" caption="创建 Draft 前核对">
        <div className="summary-list">
          <div className="summary-row"><span className="muted">已通过成果</span><strong>{readyJobs.length}</strong></div>
          <div className="summary-row"><span className="muted">平台版本</span><strong>{versions}</strong></div>
          <div className="summary-row"><span className="muted">发布账号</span><strong>本轮不接入</strong></div>
          <div className="summary-divider" />
          <div className="summary-row"><span className="muted">Publisher</span><strong>未接入</strong></div>
          <Button type="primary" size="large" block icon={<Send size={15} />} onClick={createDrafts}>确认并创建 Draft</Button>
          <Space className="muted" size={5}>Draft 只携带已确认决策，发布层不得改写</Space>
        </div>
      </Panel>
    </div>

    <Drawer
      title="生成结果审计"
      width={560}
      open={Boolean(detailJob)}
      onClose={() => setDetailJob(null)}
      extra={<Button type="primary" icon={<RotateCcw size={14} />} onClick={() => editForm.submit()}>保存并返工</Button>}
    >
      {detailJob && <Form form={editForm} layout="vertical" onFinish={saveJob}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="任务">{detailJob.title}</Descriptions.Item>
          <Descriptions.Item label="Provider">{detailJob.provider}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag className={`status-badge ${statusMap[detailJob.status][1]}`}>{statusMap[detailJob.status][0]}</Tag></Descriptions.Item>
          <Descriptions.Item label="Idea"><Link to="/ideas">{detailJob.ideaId ?? "—"}</Link></Descriptions.Item>
        </Descriptions>
        <Divider orientation="left">文本和生成规格</Divider>
        <Form.Item name="copy" label="文案"><Input.TextArea rows={5} placeholder="纯文本也会有独立的 text Artifact ID" /></Form.Item>
        <Form.Item name="prompt" label="Prompt / CreativeSpec"><Input.TextArea rows={8} placeholder="视频、图像和文案的版本化规格" /></Form.Item>
        <Divider orientation="left">Artifacts</Divider>
        <div className="artifact-list">
          {(detailJob.artifacts ?? []).map((artifact) => <div className="artifact-row" key={artifact.id}>
            <div><strong>{artifact.label}</strong><div className="job-sub">{artifact.id} · {artifact.provider} · {artifact.version}</div></div>
            <Tag color={artifact.status === "ready" ? "green" : artifact.status === "review" ? "gold" : "red"}>{artifact.status}</Tag>
          </div>)}
        </div>
      </Form>}
    </Drawer>
  </>;
}
