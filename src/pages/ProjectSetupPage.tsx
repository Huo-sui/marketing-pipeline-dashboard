import { Alert, Button, Descriptions, Form, Input, InputNumber, Popconfirm, Select, Steps, Switch, Tag, Tooltip, message } from "antd";
import { Archive, ArrowLeft, ChevronLeft, ChevronRight, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { PageHeader } from "../components/Shared";
import { useDemoState } from "../state/demoStateContext";
import type { Platform, ProjectSetupInput } from "../types";

const allPlatforms: Platform[] = ["TikTok", "小红书", "抖音", "Reddit", "X", "Instagram"];
const projectTypes = ["独立游戏", "应用软件", "阅读应用", "语言学习", "其他"];
const projectStages = ["Research", "Pre-production", "Production", "Beta", "Live"];
const timezones = ["Asia/Shanghai", "America/Toronto", "America/Los_Angeles", "Europe/London", "UTC"];

type RuleFormValue = {
  id?: string;
  name?: string;
  platform: Platform;
  terms: string[];
  excludeTerms?: string[];
  cadence: string;
  enabled: boolean;
  minLikes: number;
  minComments: number;
  maxAgeHours: number;
  minScore: number;
  anomalyEnabled: boolean;
  anomalyBaselineDays: number;
  anomalyMinSamples: number;
  anomalyZThreshold: number;
};

type SetupFormValue = {
  name: string;
  type: string;
  stage: string;
  description?: string;
  targetMarkets: string[];
  languages: string[];
  platforms: Platform[];
  timezone: string;
  trackingRules: RuleFormValue[];
  promptPackVersion?: string;
};

const createDefaultRule = (): RuleFormValue => ({
  platform: "TikTok",
  terms: [],
  excludeTerms: [],
  cadence: "每日 10:00",
  enabled: true,
  minLikes: 5000,
  minComments: 100,
  maxAgeHours: 72,
  minScore: 80,
  anomalyEnabled: true,
  anomalyBaselineDays: 30,
  anomalyMinSamples: 30,
  anomalyZThreshold: 3.5,
});

const initialValues: SetupFormValue = {
  name: "",
  type: "独立游戏",
  stage: "Research",
  description: "",
  targetMarkets: ["中国大陆"],
  languages: ["中文"],
  platforms: ["TikTok", "抖音"],
  timezone: "Asia/Shanghai",
  trackingRules: [createDefaultRule()],
  promptPackVersion: "",
};

const stepItems = [
  { title: "项目信息" },
  { title: "市场与平台" },
  { title: "追踪规则" },
  { title: "可选配置" },
  { title: "确认创建" },
];

export function ProjectSetupPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { projects, topicWatches, createProjectBundle, updateProjectBundle, setProjectStatus, setSelectedProject } = useDemoState();
  const [form] = Form.useForm<SetupFormValue>();
  const [currentStep, setCurrentStep] = useState(0);
  const [messageApi, contextHolder] = message.useMessage();
  const project = projectId ? projects.find((item) => item.id === projectId) : undefined;
  const isEditing = Boolean(projectId);
  const selectedPlatforms = Form.useWatch("platforms", form) ?? [];

  useEffect(() => {
    if (!project) return;
    const rules = topicWatches.filter((watch) => watch.projectId === project.id).map((watch) => ({
      id: watch.id,
      name: watch.name,
      platform: watch.platform,
      terms: watch.terms,
      excludeTerms: watch.excludeTerms,
      cadence: watch.cadence,
      enabled: watch.state === "running",
      minLikes: watch.minLikes,
      minComments: watch.minComments,
      maxAgeHours: watch.maxAgeHours,
      minScore: watch.minScore,
      anomalyEnabled: watch.anomalyEnabled,
      anomalyBaselineDays: watch.anomalyBaselineDays,
      anomalyMinSamples: watch.anomalyMinSamples,
      anomalyZThreshold: watch.anomalyZThreshold,
    }));
    form.setFieldsValue({
      name: project.name,
      type: project.type,
      stage: project.stage,
      description: project.description,
      targetMarkets: project.targetMarkets,
      languages: project.languages,
      platforms: project.platforms,
      timezone: project.timezone,
      trackingRules: rules.length ? rules : [{ ...createDefaultRule(), platform: project.platforms[0] ?? "TikTok" }],
      promptPackVersion: project.promptPackVersion,
    });
  }, [form, project, topicWatches]);

  const platformOptions = (selectedPlatforms.length ? selectedPlatforms : allPlatforms).map((platform) => ({ value: platform, label: platform }));

  if (isEditing && !project) {
    return <>{contextHolder}<PageHeader title="项目不存在" meta="该项目可能已被移除，或当前 Demo 工作区已重置" actions={<Button icon={<ArrowLeft size={15} />} onClick={() => navigate("/projects")}>返回项目</Button>} /><Alert type="error" showIcon message="无法加载项目配置" /></>;
  }

  const nextStep = async () => {
    try {
      await form.validateFields();
      setCurrentStep((step) => Math.min(step + 1, stepItems.length - 1));
    } catch {
      messageApi.warning("请先完成当前步骤的必填项");
    }
  };

  const submitSetup = async () => {
    const values = form.getFieldsValue(true) as SetupFormValue;
    const input: ProjectSetupInput = {
      project: {
        name: values.name.trim(),
        type: values.type,
        stage: values.stage,
        description: values.description?.trim() ?? "",
        targetMarkets: values.targetMarkets,
        languages: values.languages,
        platforms: values.platforms,
        timezone: values.timezone,
        promptPackVersion: values.promptPackVersion?.trim() || undefined,
        accountIds: project?.accountIds ?? [],
      },
      trackingRules: values.trackingRules.map((rule) => ({
        id: rule.id,
        name: rule.name?.trim() || rule.terms[0] || "未命名追踪规则",
        platform: rule.platform,
        terms: rule.terms,
        excludeTerms: rule.excludeTerms ?? [],
        searchMode: "sequential",
        mediaTypeFilter: "any",
        cadence: rule.cadence,
        state: rule.enabled ? "running" : "paused",
        minLikes: rule.minLikes,
        minComments: rule.minComments,
        maxAgeHours: rule.maxAgeHours,
        minScore: rule.minScore,
        anomalyEnabled: rule.anomalyEnabled,
        anomalyMethod: "robust_mad",
        anomalyBaselineDays: rule.anomalyBaselineDays,
        anomalyMinSamples: rule.anomalyMinSamples,
        anomalyZThreshold: rule.anomalyZThreshold,
      })),
    };

    if (projectId) {
      await updateProjectBundle(projectId, input);
      setSelectedProject(projectId);
      messageApi.success("项目与追踪规则已保存");
    } else {
      await createProjectBundle(input);
      messageApi.success("项目与追踪规则已创建");
    }
    navigate("/projects");
  };

  const changeProjectStatus = async () => {
    if (!project) return;
    const nextStatus = project.status === "active" ? "archived" : "active";
    if (!await setProjectStatus(project.id, nextStatus)) {
      messageApi.error("至少需要保留一个活跃项目，当前项目不能归档");
      return;
    }
    messageApi.success(nextStatus === "active" ? "项目已恢复并设为当前项目" : "项目已归档，可随时从项目页恢复");
    navigate("/projects");
  };

  const renderStep = () => {
    if (currentStep === 0) return <section className="setup-section">
      <div className="setup-section-heading"><h2>项目基本信息</h2><p>这些字段定义所有后续内容、资产和任务的第一层上下文。</p></div>
      <div className="form-grid-2">
        <Form.Item name="name" label="项目名称" rules={[{ required: true, whitespace: true, message: "请输入项目名称" }]}><Input placeholder="例如：海外内容增长计划" /></Form.Item>
        <Form.Item name="type" label="项目类型" rules={[{ required: true }]}><Select options={projectTypes.map((value) => ({ value, label: value }))} /></Form.Item>
      </div>
      <Form.Item name="stage" label="当前阶段" rules={[{ required: true }]}><Select options={projectStages.map((value) => ({ value, label: value }))} /></Form.Item>
      <Form.Item name="description" label="项目简介"><Input.TextArea rows={5} maxLength={500} showCount placeholder="简要描述产品、用户和当前 Marketing 目标" /></Form.Item>
    </section>;

    if (currentStep === 1) return <section className="setup-section">
      <div className="setup-section-heading"><h2>市场、语言和目标平台</h2><p>平台 Adapter 后续可以替换，但项目边界和内容本地化配置保持不变。</p></div>
      <div className="form-grid-2">
        <Form.Item name="targetMarkets" label="目标市场" rules={[{ required: true, message: "至少选择一个目标市场" }]}><Select mode="tags" tokenSeparators={[","]} placeholder="输入市场后按 Enter" options={["中国大陆", "北美", "欧洲", "日本", "东南亚"].map((value) => ({ value, label: value }))} /></Form.Item>
        <Form.Item name="languages" label="内容语言" rules={[{ required: true, message: "至少选择一种语言" }]}><Select mode="tags" tokenSeparators={[","]} placeholder="输入语言后按 Enter" options={["中文", "English", "日本語", "한국어"].map((value) => ({ value, label: value }))} /></Form.Item>
      </div>
      <Form.Item name="platforms" label="目标平台" rules={[{ required: true, message: "至少选择一个目标平台" }]}><Select mode="multiple" options={allPlatforms.map((platform) => ({ value: platform, label: platform }))} /></Form.Item>
      <Form.Item name="timezone" label="默认时区" rules={[{ required: true }]}><Select showSearch options={timezones.map((value) => ({ value, label: value }))} /></Form.Item>
    </section>;

    if (currentStep === 2) return <section className="setup-section">
      <div className="setup-section-heading"><h2>项目追踪规则</h2><p>创建时至少配置一条规则，保存后仍可在话题雷达单独调整。</p></div>
      <Form.List name="trackingRules" rules={[{ validator: async (_, rules) => rules?.length ? Promise.resolve() : Promise.reject(new Error("至少添加一条追踪规则")) }]}>
        {(fields, { add, remove }, { errors }) => <div className="setup-rule-list">
          {fields.map((field, index) => <div className="setup-rule" key={field.key}>
            <div className="setup-rule-header"><div><strong>规则 {index + 1}</strong><span>每条规则只对应一个平台 Adapter</span></div><Tooltip title="删除规则"><Button className="icon-button" danger icon={<Trash2 size={14} />} onClick={() => remove(field.name)} disabled={fields.length === 1} /></Tooltip></div>
            <Form.Item name={[field.name, "id"]} hidden><Input /></Form.Item>
            <div className="form-grid-2">
              <Form.Item name={[field.name, "name"]} label="规则名称"><Input placeholder="例如：独立游戏开发日志" /></Form.Item>
              <Form.Item name={[field.name, "platform"]} label="平台" rules={[{ required: true }]}><Select options={platformOptions} /></Form.Item>
            </div>
            <Form.Item name={[field.name, "terms"]} label="追踪词（按标签顺序分别搜索）" rules={[{ required: true, message: "至少填写一个追踪词" }]}><Select mode="tags" tokenSeparators={[","]} placeholder="输入后按 Enter，例如 reading、book" /></Form.Item>
            <Form.Item name={[field.name, "excludeTerms"]} label="排除词"><Select mode="tags" tokenSeparators={[","]} placeholder="可选，例如 招聘、课程、广告" /></Form.Item>
            <div className="setup-threshold-grid">
              <Form.Item name={[field.name, "minLikes"]} label="最低点赞（硬门槛）" rules={[{ required: true }]}><InputNumber min={0} className="full-width" /></Form.Item>
              <Form.Item name={[field.name, "minComments"]} label="最低评论（硬门槛）" rules={[{ required: true }]}><InputNumber min={0} className="full-width" /></Form.Item>
              <Form.Item name={[field.name, "maxAgeHours"]} label="时间窗口（小时）" rules={[{ required: true }]}><InputNumber min={1} className="full-width" /></Form.Item>
              <Form.Item name={[field.name, "minScore"]} label="最低评分（硬门槛）" rules={[{ required: true }]}><InputNumber min={0} max={100} className="full-width" /></Form.Item>
            </div>
            <div className="setup-anomaly-grid">
              <Form.Item name={[field.name, "anomalyEnabled"]} label="相对异常判定" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item name={[field.name, "anomalyBaselineDays"]} label="基线天数"><InputNumber min={7} max={365} className="full-width" /></Form.Item>
              <Form.Item name={[field.name, "anomalyMinSamples"]} label="最小样本"><InputNumber min={10} max={10_000} className="full-width" /></Form.Item>
              <Form.Item name={[field.name, "anomalyZThreshold"]} label="MAD z 边界"><InputNumber min={1} max={10} step={0.1} className="full-width" /></Form.Item>
            </div>
            <div className="setup-rule-footer">
              <Form.Item name={[field.name, "cadence"]} label="运行计划" rules={[{ required: true }]}><Input placeholder="例如：每日 10:00" /></Form.Item>
              <Form.Item name={[field.name, "enabled"]} label="创建后启用" valuePropName="checked"><Switch /></Form.Item>
            </div>
          </div>)}
          <Button block type="dashed" icon={<Plus size={15} />} onClick={() => add({ ...createDefaultRule(), platform: selectedPlatforms[0] ?? "TikTok" })}>添加追踪规则</Button>
          <Form.ErrorList errors={errors} />
        </div>}
      </Form.List>
    </section>;

    if (currentStep === 3) return <section className="setup-section">
      <div className="setup-section-heading"><h2>可选配置</h2><p>这些字段不阻塞项目创建，可以等对应 Provider 接入后再补充。</p></div>
      <Form.Item name="promptPackVersion" label="Prompt Pack 版本"><Input placeholder="例如：v0.1；暂未配置可以留空" /></Form.Item>
      <Alert type="info" showIcon message="账号系统按平台 Adapter 确认连接身份；项目用途、抓取角色和发布角色会在对应管线阶段单独设计。" />
    </section>;

    const values = form.getFieldsValue(true) as SetupFormValue;
    return <section className="setup-section">
      <div className="setup-section-heading"><h2>确认项目配置</h2><p>提交会在同一个本地 Demo 快照中保存项目与全部追踪规则。</p></div>
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
        <Descriptions.Item label="项目名称">{values.name}</Descriptions.Item>
        <Descriptions.Item label="类型与阶段">{values.type} · {values.stage}</Descriptions.Item>
        <Descriptions.Item label="市场">{values.targetMarkets?.join("、")}</Descriptions.Item>
        <Descriptions.Item label="语言">{values.languages?.join("、")}</Descriptions.Item>
        <Descriptions.Item label="时区">{values.timezone}</Descriptions.Item>
        <Descriptions.Item label="Prompt Pack">{values.promptPackVersion || "创建后配置"}</Descriptions.Item>
        <Descriptions.Item label="目标平台" span={2}><div className="topic-tags setup-summary-tags">{values.platforms?.map((platform) => <Tag key={platform}>{platform}</Tag>)}</div></Descriptions.Item>
      </Descriptions>
      <div className="setup-summary-rules">
        <div className="setup-summary-title">追踪规则 · {values.trackingRules?.length ?? 0}</div>
        {values.trackingRules?.map((rule, index) => <div className="setup-summary-rule" key={rule.id ?? `${rule.platform}-${index}`}><div><strong>{rule.name || rule.terms?.[0] || `规则 ${index + 1}`}</strong><span>{rule.platform} · {rule.cadence}</span></div><div className="topic-tags">{rule.terms?.map((term) => <Tag key={term}>{term}</Tag>)}</div></div>)}
      </div>
      <Alert type="info" showIcon message="提交后保存到 PostgreSQL；外部抓取、生成和发布 Provider 尚未执行。" />
    </section>;
  };

  return <>{contextHolder}
    <PageHeader title={isEditing ? `编辑 ${project?.name}` : "新建项目"} meta="一次完成项目资料、目标平台、追踪规则和可选绑定" actions={<>{project && (project.status === "active" ? <Popconfirm title="归档这个项目？" description="项目会从顶部选择器移除，现有规则和配置仍会保留。" okText="归档" cancelText="取消" onConfirm={changeProjectStatus}><Button danger icon={<Archive size={15} />}>归档项目</Button></Popconfirm> : <Button icon={<RotateCcw size={15} />} onClick={changeProjectStatus}>恢复项目</Button>)}<Button icon={<ArrowLeft size={15} />} onClick={() => navigate("/projects")}>返回项目</Button></>} />
    <div className="setup-shell">
      <div className="setup-steps"><Steps current={currentStep} items={stepItems} /></div>
      <Form form={form} layout="vertical" initialValues={initialValues} requiredMark="optional" preserve>
        <div className="setup-surface">{renderStep()}</div>
        <div className="setup-actions">
          <Button icon={<ChevronLeft size={15} />} disabled={currentStep === 0} onClick={() => setCurrentStep((step) => Math.max(step - 1, 0))}>上一步</Button>
          <div className="topbar-spacer" />
          {currentStep < stepItems.length - 1 ? <Button type="primary" icon={<ChevronRight size={15} />} iconPosition="end" onClick={nextStep}>下一步</Button> : <Button type="primary" icon={<Save size={15} />} onClick={submitSetup}>{isEditing ? "保存项目" : "创建项目"}</Button>}
        </div>
      </Form>
    </div>
  </>;
}
