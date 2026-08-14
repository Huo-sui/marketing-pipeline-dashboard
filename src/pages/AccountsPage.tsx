import { Button } from "antd";
import { Link2, Plus } from "lucide-react";
import { PageHeader, PlatformBadge } from "../components/Shared";
import { accounts } from "../data/demoData";

const status = { healthy: ["健康", "status-ready"], attention: ["需检查", "status-review"], disconnected: ["未连接", "status-disconnected"] } as const;

export function AccountsPage() {
  return <><PageHeader title="账号" meta="账号可以通过 Channel Binding 复用于多个项目" actions={<Button type="primary" icon={<Plus size={15} />}>连接账号</Button>} />
    <div className="account-grid">{accounts.map((account) => <article className="entity-card" key={account.id}><div className="entity-card-header"><div><PlatformBadge platform={account.platform} /><h2 className="entity-title" style={{ marginTop: 10 }}>{account.handle}</h2><div className="entity-subtitle">{account.connector}</div></div><span className={`status-badge ${status[account.status][1]}`}>{status[account.status][0]}</span></div><div className="entity-stats"><div><div className="entity-stat-value">{account.projects}</div><div className="entity-stat-label">绑定项目</div></div><div><div className="entity-stat-value">{account.lastCheck}</div><div className="entity-stat-label">最近检查</div></div><div><Button size="small" icon={<Link2 size={13} />}>配置</Button></div></div></article>)}</div>
  </>;
}
