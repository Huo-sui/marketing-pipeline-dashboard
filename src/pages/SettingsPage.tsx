import { Button } from "antd";
import { Cable, FileJson2, KeyRound, Plus } from "lucide-react";
import { PageHeader } from "../components/Shared";

const connectors = [
  { capability: "Discovery", contract: "TopicQuery → SourcePost[]", providers: "0 / 6" },
  { capability: "Extraction", contract: "SourcePostRef → SourcePost", providers: "0 / 6" },
  { capability: "Media Fetch", contract: "SourcePostRef → MediaArtifact[]", providers: "0 / 6" },
  { capability: "Visual Analysis", contract: "MediaArtifact[] → PatternCard", providers: "0 / 1" },
  { capability: "Generation", contract: "CreativeSpec → Rendition[]", providers: "0 / 2" },
  { capability: "Publishing", contract: "PublicationDraft → Receipt", providers: "0 / 6" },
];

export function SettingsPage() {
  return <><PageHeader title="设置" meta="Provider、接口合同与工作区配置" actions={<Button type="primary" icon={<Plus size={15} />}>注册 Provider</Button>} />
    <div className="connector-grid">{connectors.map((item) => <article className="entity-card" key={item.capability}><div className="entity-card-header"><div><Cable size={17} color="#3f6f52" /><h2 className="entity-title" style={{ marginTop: 9 }}>{item.capability}</h2></div><span className="status-badge status-disconnected">{item.providers}</span></div><div className="connector-line"><span className="connector-name">{item.contract}</span><Button className="icon-button" size="small" icon={<FileJson2 size={13} />} /></div></article>)}</div>
    <section className="panel" style={{ marginTop: 16 }}><header className="panel-header"><h2 className="panel-title">Secrets</h2><Button size="small" icon={<KeyRound size={13} />}>打开凭据库</Button></header><div className="panel-body muted" style={{ fontSize: 11 }}>本地凭据库尚未配置。Provider 密钥不会保存在 Demo Seed 或浏览器 Local Storage 中。</div></section>
  </>;
}
