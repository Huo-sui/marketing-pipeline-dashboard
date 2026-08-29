import { Alert, Button, Descriptions, Spin, message } from "antd";
import { Cable, CheckCircle2, ExternalLink, FileJson2, KeyRound, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../components/Shared";
import { controlApi } from "../services/controlApi";
import type { AutoGlmProviderStatus, AutoGlmProviderTest } from "../types";
import type { PlatformAdapterStatus } from "../services/controlApi";

const connectors = [
  { capability: "Discovery", contract: "TopicQuery → SourcePost[]", providers: "0 / 6" },
  { capability: "Extraction", contract: "SourcePostRef → SourcePost", providers: "0 / 6" },
  { capability: "Media Fetch", contract: "SourcePostRef → MediaArtifact[]", providers: "0 / 6" },
  { capability: "Visual Analysis", contract: "MediaArtifact[] → PatternCard", providers: "0 / 1" },
  { capability: "Generation", contract: "CreativeSpec → Rendition[]", providers: "0 / 2" },
  { capability: "Publishing", contract: "PublicationDraft → Receipt", providers: "0 / 6" },
];

export function SettingsPage() {
  const [provider, setProvider] = useState<AutoGlmProviderStatus>();
  const [testResult, setTestResult] = useState<AutoGlmProviderTest>();
  const [testing, setTesting] = useState(false);
  const [platformAdapters, setPlatformAdapters] = useState<PlatformAdapterStatus[]>([]);
  const [messageApi, contextHolder] = message.useMessage();

  const loadProvider = useCallback(async () => {
    try { setProvider(await controlApi.autoGlmProvider()); }
    catch (error) { messageApi.error(error instanceof Error ? error.message : "Provider 状态读取失败"); }
  }, [messageApi]);

  useEffect(() => { void loadProvider(); }, [loadProvider]);
  useEffect(() => { void controlApi.platforms().then(setPlatformAdapters).catch((error) => messageApi.error(error instanceof Error ? error.message : "平台 Adapter 状态读取失败")); }, [messageApi]);

  const testProvider = async () => {
    setTesting(true);
    try {
      const result = await controlApi.testAutoGlmProvider();
      setTestResult(result);
      if (result.ok) messageApi.success("智谱 AutoGLM-Phone 连通性测试通过");
      else messageApi.warning(result.message);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "智谱 API 测试失败");
    } finally {
      setTesting(false);
      void loadProvider();
    }
  };

  return <>{contextHolder}<PageHeader title="设置" meta="Provider、接口合同与工作区配置" />
    <section className="panel provider-panel">
      <header className="panel-header"><div><h2 className="panel-title">手机视觉 Provider</h2><div className="panel-caption">OpenAI-compatible Chat Completions</div></div><Button type="primary" icon={<RefreshCw size={14} />} loading={testing} disabled={!provider?.configured} onClick={testProvider}>测试真实调用</Button></header>
      <div className="panel-body">
        {!provider ? <Spin size="small" /> : <>
          <div className="provider-heading"><div className="provider-icon"><Cable size={18} /></div><div><strong>{provider.label}</strong><span>{provider.model}</span></div><span className={`status-badge ${provider.configured ? "status-ready" : "status-disconnected"}`}>{provider.configured ? "已配置" : "缺少密钥"}</span></div>
          <Descriptions size="small" column={2} items={[
            { key: "endpoint", label: "Endpoint", children: provider.baseUrl },
            { key: "credential", label: "凭据来源", children: provider.credentialSource || "ZHIPU_API_KEY" },
            { key: "pricing", label: "当前计费", children: "官方限时免费" },
            { key: "contract", label: "合同", children: "Screenshot + Task → Phone Action" },
          ]} />
          {!provider.configured && <Alert type="warning" showIcon message="服务端尚未检测到 ZHIPU_API_KEY" description="密钥只从 Dashboard 服务进程环境读取，不会返回浏览器或写入 PostgreSQL。" action={<Button size="small" href="https://bigmodel.cn/usercenter/proj-mgmt/apikeys" target="_blank" icon={<ExternalLink size={13} />}>创建 API Key</Button>} />}
          {testResult && <Alert className="provider-test-result" type={testResult.ok ? "success" : "warning"} showIcon icon={testResult.ok ? <CheckCircle2 size={16} /> : undefined} message={testResult.message} description={testResult.ok ? `延迟 ${testResult.latencyMs ?? "-"}ms · Token ${testResult.usage?.totalTokens ?? "平台未返回"} · Request ${testResult.requestId ?? "-"}` : undefined} />}
        </>}
      </div>
    </section>
    <section className="panel" style={{ marginTop: 16 }}><header className="panel-header"><div><h2 className="panel-title">平台 Adapters</h2><div className="panel-caption">统一 Discovery / Identity / Publishing / Engagement 能力合同</div></div><Button icon={<RefreshCw size={14} />} onClick={() => void controlApi.platforms().then(setPlatformAdapters)}>刷新</Button></header><div className="panel-body"><div className="connector-grid">{platformAdapters.map((adapter) => <article className="entity-card" key={adapter.platform}><div className="entity-card-header"><div><strong>{adapter.platform}</strong><div className="entity-subtitle">{adapter.label} · {adapter.mode === "phone" ? "手机操控" : "HTTP 接口"}</div></div><span className={`status-badge ${adapter.configured ? "status-ready" : "status-disconnected"}`}>{adapter.configured ? "已配置" : "待配置"}</span></div><div className="connector-line"><span className="connector-name">{adapter.detail}</span></div><div className="topic-tags">{Object.entries(adapter.capabilities).filter(([, enabled]) => enabled).map(([capability]) => <span className="status-badge status-ready" key={capability}>{capability}</span>)}</div></article>)}</div></div></section>
    <div className="connector-grid settings-connectors">{connectors.map((item) => <article className="entity-card" key={item.capability}><div className="entity-card-header"><div><Cable size={17} color="#3f6f52" /><h2 className="entity-title" style={{ marginTop: 9 }}>{item.capability}</h2></div><span className="status-badge status-disconnected">{item.providers}</span></div><div className="connector-line"><span className="connector-name">{item.contract}</span><Button className="icon-button" size="small" icon={<FileJson2 size={13} />} /></div></article>)}</div>
    <section className="panel" style={{ marginTop: 16 }}><header className="panel-header"><h2 className="panel-title">Secrets</h2><span className="status-badge status-ready"><KeyRound size={12} />服务端环境</span></header><div className="panel-body muted" style={{ fontSize: 11 }}>Provider 密钥不会保存在浏览器 Local Storage、Demo Seed 或 PostgreSQL 中。</div></section>
  </>;
}
