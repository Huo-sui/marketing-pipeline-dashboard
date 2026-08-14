import { Button, Progress } from "antd";
import { Play, SlidersHorizontal } from "lucide-react";
import { PageHeader, Panel } from "../components/Shared";
import { generationJobs } from "../data/demoData";

const statusMap = { running: ["生成中", "status-running"], review: ["待验收", "status-review"], ready: ["已就绪", "status-ready"], queued: ["等待中", "status-disconnected"] } as const;

export function GenerationPage() {
  return <><PageHeader title="生成队列" meta="已批准 Idea 的图文与视频任务" actions={<Button icon={<SlidersHorizontal size={15} />}>Worker 配置</Button>} />
    <Panel title="当前任务" caption="Demo Seed Provider">
      <div className="progress-stack">{generationJobs.map((job) => <div className="job-row" key={job.id}><div><div className="job-name">{job.title}</div><div className="job-sub">{job.provider} · {job.updated}</div></div><div>{job.type}</div><Progress percent={job.progress} showInfo={false} strokeColor="#3f6f52" /><span className={`status-badge ${statusMap[job.status][1]}`}>{statusMap[job.status][0]}</span><Button size="small" icon={<Play size={13} />} disabled={job.status === "queued"}>预览</Button></div>)}</div>
    </Panel>
  </>;
}
