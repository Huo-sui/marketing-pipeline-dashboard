import { Alert, Button, Divider, Drawer, Form, Input, InputNumber, Modal, Select, Switch, Tag, message } from "antd";
import { CheckCircle2, Pencil, Plus, RefreshCw, Save, XCircle } from "lucide-react";
import { useState } from "react";
import { PageHeader, Panel, PlatformBadge } from "../components/Shared";
import { controlApi } from "../services/controlApi";
import { useDemoState } from "../state/demoStateContext";
import type { Platform, TopicPreflightResult, TopicWatch } from "../types";

const platforms: Platform[] = ["TikTok", "小红书", "抖音", "Reddit", "X", "Instagram"];

type WatchForm = {
  name: string;
  platform: Platform;
  terms: string[];
  excludeTerms: string[];
  minLikes: number;
  minComments: number;
  maxAgeHours: number;
  minScore: number;
  cadence: string;
  collectorAccountId?: string;
  anomalyEnabled: boolean;
  anomalyBaselineDays: number;
  anomalyMinSamples: number;
  anomalyZThreshold: number;
};

export function TopicRadarPage() {
  const { selectedProject, projects, topicWatches, accounts, automationProfiles, accountBindings, addTopicWatch, updateTopicWatch, refreshProjectContent } = useDemoState();
  const [form] = Form.useForm<WatchForm>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<TopicWatch | null>(null);
  const [checkingId, setCheckingId] = useState<string>();
  const [runningId, setRunningId] = useState<string>();
  const [runningAll, setRunningAll] = useState(false);
  const [preflight, setPreflight] = useState<{ watch: TopicWatch; result: TopicPreflightResult }>();
  const [messageApi, contextHolder] = message.useMessage();
  const watches = topicWatches.filter((watch) => watch.projectId === selectedProject);
  const currentProject = projects.find((project) => project.id === selectedProject);
  const anomalyEnabled = Form.useWatch("anomalyEnabled", form);
  const selectedPlatform = Form.useWatch("platform", form) ?? "TikTok";
  const discoveryBindings = accountBindings.filter((binding) => binding.projectId === selectedProject && binding.roles.includes("discovery"));
  const collectorOptions = accounts.filter((account) => account.lifecycleStatus === "active").map((account) => {
    const profile = automationProfiles.find((item) => item.accountId === account.id);
    return {
      value: account.id,
      label: `${account?.displayName || account?.handle || account?.label || "未知账号"} · ${profile?.sessionStatus || "未配置"}`,
      disabled: account?.platform !== selectedPlatform,
    };
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      name: "Smoke",
      platform: "小红书",
      terms: ["独立游戏", "游戏开发"],
      excludeTerms: [],
      minLikes: 10_000,
      minComments: 100,
      maxAgeHours: 72,
      minScore: 80,
      cadence: "每日 10:00",
      collectorAccountId: accounts.find((account) => account.platform === "小红书" && account.lifecycleStatus === "active")?.id,
      anomalyEnabled: true,
      anomalyBaselineDays: 30,
      anomalyMinSamples: 30,
      anomalyZThreshold: 3.5,
    });
    setDrawerOpen(true);
  };

  const openEdit = (watch: TopicWatch) => {
    setEditing(watch);
    const binding = accountBindings.find((item) => item.id === watch.collectorAccountBindingId);
    form.setFieldsValue({ ...watch, terms: watch.terms, excludeTerms: watch.excludeTerms, collectorAccountId: binding?.accountId });
    setDrawerOpen(true);
  };

  const saveWatch = async (values: WatchForm) => {
    try {
      const terms = (values.terms ?? []).map((item) => item.trim()).filter(Boolean);
      const excludeTerms = (values.excludeTerms ?? []).map((item) => item.trim()).filter(Boolean);
      let collectorAccountBindingId: string | undefined;
      if (values.collectorAccountId) {
        const existingBinding = discoveryBindings.find((binding) => binding.accountId === values.collectorAccountId);
        collectorAccountBindingId = existingBinding?.id;
        if (!collectorAccountBindingId) {
          const created = await controlApi.createAccountBinding(selectedProject, { accountId: values.collectorAccountId, roles: ["discovery"], isPrimaryDiscovery: discoveryBindings.length === 0, isPrimaryPublishing: false });
          collectorAccountBindingId = created.id;
        }
      }
      const next: TopicWatch = {
        id: editing?.id ?? `topic-${Date.now()}`,
        projectId: selectedProject,
        name: values.name?.trim() || terms[0] || "未命名追踪词",
        platform: values.platform,
        terms,
        excludeTerms,
        searchMode: "sequential",
        cadence: values.cadence,
        state: editing?.state ?? "running",
        minLikes: values.minLikes,
        minComments: values.minComments,
        maxAgeHours: values.maxAgeHours,
        minScore: values.minScore,
        anomalyEnabled: values.anomalyEnabled,
        anomalyMethod: "robust_mad",
        anomalyBaselineDays: values.anomalyBaselineDays,
        anomalyMinSamples: values.anomalyMinSamples,
        anomalyZThreshold: values.anomalyZThreshold,
        posts: editing?.posts ?? 0,
        qualified: editing?.qualified ?? 0,
        lastRun: editing?.lastRun,
        collectorAccountBindingId,
      };
      if (editing) await updateTopicWatch(editing.id, next);
      else await addTopicWatch(next);
      setDrawerOpen(false);
      messageApi.success("追踪规则已保存到 PostgreSQL");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "追踪规则保存失败");
    }
  };

  const checkWatch = async (watch: TopicWatch) => {
    setCheckingId(watch.id);
    try {
      const result = await controlApi.preflightTopic(watch.id);
      setPreflight({ watch, result });
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "运行条件检查失败");
    } finally {
      setCheckingId(undefined);
    }
  };

  const runWatch = async (watch: TopicWatch) => {
    setRunningId(watch.id);
    try {
      const result = await controlApi.runTopic(watch.id);
      setPreflight({ watch, result: result.preflight });
      await refreshProjectContent();
      if (result.ok) messageApi.success("话题雷达运行已完成");
      else messageApi.warning(`运行未执行：${result.run.errorMessage}`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "话题雷达运行失败");
    } finally {
      setRunningId(undefined);
    }
  };

  const runAllWatches = async () => {
    const p0 = watches.filter((watch) => watch.state === "running" && /^P0\s*[·:：-]/i.test(watch.name));
    const runnable = p0.length ? p0 : watches.filter((watch) => watch.state === "running");
    if (!runnable.length) { messageApi.warning("当前项目没有运行中的追踪规则"); return; }
    setRunningAll(true);
    let completed = 0;
    let failed = 0;
    try {
      for (const watch of runnable) {
        const result = await controlApi.runTopic(watch.id);
        if (result.ok) completed += 1;
        else failed += 1;
      }
      await refreshProjectContent();
      if (failed) messageApi.warning(`批量运行结束：成功 ${completed} 条，失败 ${failed} 条；可在运行中心查看逐步日志`);
      else messageApi.success(`批量运行完成：${completed} 条规则均已执行`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "项目话题雷达批量运行失败");
    } finally {
      setRunningAll(false);
    }
  };

  return <>{contextHolder}
    <PageHeader title="话题雷达" meta="按项目、账号和固定追踪词收集近期高表现帖子" actions={<><Button loading={runningAll} icon={<RefreshCw size={15} />} onClick={runAllWatches}>运行 P0 规则</Button><Button icon={<RefreshCw size={15} />} onClick={() => messageApi.info("候选 Topic 研究 Agent 尚未接入")}>研究候选</Button><Button type="primary" icon={<Plus size={15} />} onClick={openCreate}>添加追踪规则</Button></>} />
    <Panel title="项目追踪规则" caption={`${watches.length} 条规则 · ${currentProject?.name ?? selectedProject}`}>
      <Alert type="info" showIcon message="每个追踪词是一个独立搜索步骤；硬阈值决定能否入选，MAD 异常分只判断它相对同类帖子是否显著突出。" />
    </Panel>
    {watches.length === 0 ? <div className="panel topic-grid-spaced"><div className="empty-state"><Plus size={28} /><strong>当前项目还没有追踪规则</strong><div>可以直接添加规则，或返回项目设置一次配置多条规则。</div><Button type="primary" icon={<Plus size={15} />} onClick={openCreate}>添加第一条规则</Button></div></div> : <div className="topic-grid topic-grid-spaced">{watches.map((watch) => {
      const rate = watch.posts ? Math.round(watch.qualified / watch.posts * 100) : 0;
      const binding = accountBindings.find((item) => item.id === watch.collectorAccountBindingId);
      const account = accounts.find((item) => item.id === binding?.accountId);
      return <article className="entity-card" key={watch.id}>
        <div className="entity-card-header"><div><PlatformBadge platform={watch.platform} /><h2 className="entity-title" style={{ marginTop: 10 }}>{watch.name}</h2><div className="entity-subtitle">{watch.cadence} · {watch.lastRun ? `上次 ${watch.lastRun}` : "尚未运行"}</div></div><Switch size="small" checked={watch.state === "running"} onChange={(checked) => updateTopicWatch(watch.id, { state: checked ? "running" : "paused" })} /></div>
        <div className="search-sequence">{watch.terms.map((term, index) => <span key={`${term}-${index}`}><b>{index + 1}</b>{term}</span>)}</div>
        {watch.excludeTerms.length > 0 && <div className="topic-tags"><Tag color="red">排除 {watch.excludeTerms.join("、")}</Tag></div>}
        <div className="rule-thresholds"><span>最低点赞 <strong>{watch.minLikes.toLocaleString()}</strong></span><span>最低评论 <strong>{watch.minComments.toLocaleString()}</strong></span><span>发布时间 <strong>{watch.maxAgeHours}h</strong></span><span>最低评分 <strong>{watch.minScore}</strong></span><span>异常边界 <strong>{watch.anomalyEnabled ? `MAD z ≥ ${watch.anomalyZThreshold}` : "关闭"}</strong></span><span>采集账号 <strong>{account?.handle || account?.label || "未指定"}</strong></span></div>
        <div className="entity-stats"><div><div className="entity-stat-value">{watch.posts}</div><div className="entity-stat-label">近 7 日帖子</div></div><div><div className="entity-stat-value">{watch.qualified}</div><div className="entity-stat-label">入选</div></div><div><div className="entity-stat-value">{rate}%</div><div className="entity-stat-label">入选率</div></div></div>
        <div className="card-actions"><Button size="small" icon={<Pencil size={13} />} onClick={() => openEdit(watch)}>编辑规则</Button><Button size="small" loading={checkingId === watch.id} icon={<RefreshCw size={13} />} onClick={() => checkWatch(watch)}>检查运行条件</Button><Button size="small" type="primary" loading={runningId === watch.id} icon={<RefreshCw size={13} />} onClick={() => runWatch(watch)}>运行一次</Button></div>
      </article>;
    })}</div>}

    <Drawer title={editing ? "编辑追踪规则" : "添加追踪规则"} width={500} open={drawerOpen} onClose={() => setDrawerOpen(false)} extra={<Button type="primary" icon={<Save size={14} />} onClick={() => form.submit()}>保存</Button>}>
      <Form form={form} layout="vertical" onFinish={saveWatch} requiredMark="optional">
        <Form.Item name="name" label="规则名称" rules={[{ required: true, message: "请输入规则名称" }]}><Input placeholder="例如：Smoke" /></Form.Item>
        <div className="form-grid-2"><Form.Item name="platform" label="平台" rules={[{ required: true }]}><Select options={platforms.map((platform) => ({ value: platform, label: platform }))} /></Form.Item><Form.Item name="collectorAccountId" label="采集账号"><Select allowClear placeholder="选择已验证账号" options={collectorOptions} /></Form.Item></div>
        <Form.Item name="terms" label="追踪词（按标签顺序分别搜索）" rules={[{ required: true, message: "至少填写一个追踪词" }]}><Select mode="tags" tokenSeparators={[","]} placeholder="依次输入 reading、book 并按 Enter" /></Form.Item>
        <Form.Item name="excludeTerms" label="排除词"><Select mode="tags" tokenSeparators={[","]} placeholder="可选，输入后按 Enter" /></Form.Item>

        <Divider orientation="left" plain>硬阈值</Divider>
        <div className="form-grid-2"><Form.Item name="minLikes" label="最低点赞" rules={[{ required: true }]}><InputNumber min={0} className="full-width" /></Form.Item><Form.Item name="minComments" label="最低评论" rules={[{ required: true }]}><InputNumber min={0} className="full-width" /></Form.Item></div>
        <div className="form-grid-2"><Form.Item name="maxAgeHours" label="最大发布时间（小时）" rules={[{ required: true }]}><InputNumber min={1} className="full-width" /></Form.Item><Form.Item name="minScore" label="最低入选评分"><InputNumber min={0} max={100} className="full-width" /></Form.Item></div>

        <Divider orientation="left" plain>数据异常</Divider>
        <Form.Item name="anomalyEnabled" label="启用相对异常判定" valuePropName="checked"><Switch /></Form.Item>
        {anomalyEnabled && <>
          <Alert className="form-inline-alert" type="info" showIcon message="比较同平台、同追踪词、相近发布时间的历史帖子。点赞/小时与评论/小时经过 log1p 后，用中位数和 MAD 计算 robust z-score。" />
          <div className="form-grid-2"><Form.Item name="anomalyBaselineDays" label="历史基线（天）" rules={[{ required: true }]}><InputNumber min={7} max={365} className="full-width" /></Form.Item><Form.Item name="anomalyMinSamples" label="最小基线样本"><InputNumber min={10} max={10_000} className="full-width" /></Form.Item></div>
          <Form.Item name="anomalyZThreshold" label="正向异常边界（modified z-score）" extra="默认 3.5；低于边界属于正常波动。样本不足时只使用硬阈值，不生成异常分。"><InputNumber min={1} max={10} step={0.1} className="full-width" /></Form.Item>
        </>}
        <Form.Item name="cadence" label="运行计划"><Input placeholder="例如：每日 10:00" /></Form.Item>
      </Form>
    </Drawer>

    <Modal title={`${preflight?.watch.name ?? "规则"} · 运行条件`} open={Boolean(preflight)} footer={<Button type="primary" onClick={() => setPreflight(undefined)}>关闭</Button>} onCancel={() => setPreflight(undefined)}>
      {preflight && <><Alert type={preflight.result.ready ? "success" : "warning"} showIcon message={preflight.result.ready ? "规则、智谱 Provider、采集账号和手机会话均已就绪" : "存在阻断项，当前不会创建抓取任务"} /><div className="preflight-list">{preflight.result.checks.map((check) => <div className="preflight-row" key={check.key}>{check.ok ? <CheckCircle2 size={17} /> : <XCircle size={17} />}<div><strong>{check.label}</strong><span>{check.detail}</span></div></div>)}</div></>}
    </Modal>
  </>;
}
