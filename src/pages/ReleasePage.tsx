import { Button, Checkbox, message } from "antd";
import { CalendarClock, Send } from "lucide-react";
import { useState } from "react";
import { PageHeader, Panel, PlatformBadge } from "../components/Shared";
import type { Platform } from "../types";

const items = [
  { id: "release-01", title: "机制误读时间轴", type: "视频 · 00:18", image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=480&q=80", defaults: ["TikTok", "抖音"] as Platform[] },
  { id: "release-02", title: "第一屏信息层级", type: "图文 · 6 张", image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=480&q=80", defaults: ["小红书", "X"] as Platform[] },
  { id: "release-03", title: "命中反馈前后对比", type: "视频 · 00:24", image: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?auto=format&fit=crop&w=480&q=80", defaults: ["Reddit"] as Platform[] },
];
const platforms: Platform[] = ["TikTok", "抖音", "小红书", "Reddit", "X", "Instagram"];

export function ReleasePage() {
  const [selected, setSelected] = useState<Record<string, Platform[]>>(Object.fromEntries(items.map((item) => [item.id, item.defaults])));
  const [messageApi, contextHolder] = message.useMessage();
  const versions = Object.values(selected).reduce((sum, values) => sum + values.length, 0);
  return <>{contextHolder}<PageHeader title="发布中心" meta="批量验收平台版本并创建 Release" actions={<Button icon={<CalendarClock size={15} />}>排期视图</Button>} />
    <div className="release-layout"><Panel title="Release Batch #DEMO-014" caption={`${items.length} 条内容 · ${versions} 个平台版本`}><div className="release-list">{items.map((item) => <div className="release-row" key={item.id}><img className="release-preview" src={item.image} alt="Demo Seed 发布预览" /><div><div className="job-name">{item.title}</div><div className="job-sub">{item.type}</div></div><Checkbox.Group value={selected[item.id]} onChange={(values) => setSelected((state) => ({ ...state, [item.id]: values as Platform[] }))}><div className="platform-checks">{platforms.map((platform) => <Checkbox key={platform} value={platform}><PlatformBadge platform={platform} /></Checkbox>)}</div></Checkbox.Group></div>)}</div></Panel>
      <Panel title="批次摘要" caption="提交前核对"><div className="summary-list"><div className="summary-row"><span className="muted">内容</span><strong>{items.length}</strong></div><div className="summary-row"><span className="muted">平台版本</span><strong>{versions}</strong></div><div className="summary-row"><span className="muted">中文版本</span><strong>4</strong></div><div className="summary-row"><span className="muted">English 版本</span><strong>{Math.max(0, versions - 4)}</strong></div><div className="summary-divider" /><div className="summary-row"><span className="muted">Publisher</span><strong>未接入</strong></div><Button type="primary" size="large" block icon={<Send size={15} />} onClick={() => messageApi.warning("Publisher 尚未接入；批次已保留在本地 Demo 状态")}>批准 Release</Button></div></Panel>
    </div>
  </>;
}
