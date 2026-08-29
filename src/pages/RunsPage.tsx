import { Alert, Button, Descriptions, Divider, Drawer, Space, Table, Tag, message } from "antd";
import { Eye, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/Shared";
import { controlApi } from "../services/controlApi";
import type { RunRecord } from "../types";

const statusMap: Record<RunRecord["status"], [string, string]> = { running: ["运行中", "blue"], completed: ["已完成", "green"], failed: ["失败", "red"], waiting_review: ["待人工确认", "gold"] };
export function RunsPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [detail, setDetail] = useState<RunRecord | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const refresh = () => void controlApi.listRuns().then(setRuns).catch((error: Error) => messageApi.error(error.message));
  useEffect(refresh, [messageApi]);
  const viewAudit = async (record: RunRecord) => {
    try { setDetail(await controlApi.getRun(record.id)); } catch (error) { messageApi.error(error instanceof Error ? error.message : "运行日志读取失败"); }
  };
  const columns = [{ title: "任务", dataIndex: "kind", key: "kind" }, { title: "Provider", dataIndex: "provider", key: "provider" }, { title: "状态", key: "status", render: (_: unknown, record: RunRecord) => <Tag color={statusMap[record.status][1]}>{statusMap[record.status][0]}</Tag> }, { title: "输入 / 输出", key: "counts", render: (_: unknown, record: RunRecord) => `${record.inputCount} / ${record.outputCount}` }, { title: "开始时间", dataIndex: "startedAt", key: "startedAt" }, { title: "操作", key: "action", align: "right" as const, render: (_: unknown, record: RunRecord) => <Button size="small" icon={<Eye size={13} />} onClick={() => void viewAudit(record)}>查看审计</Button> }];
  return <>{contextHolder}<PageHeader title="任务与审计" meta="读取数据库中的真实运行记录" actions={<Button icon={<RefreshCw size={15} />} onClick={refresh}>刷新状态</Button>} /><Alert className="section-alert" type="info" showIcon message="无数据库连接或无真实任务时显示空状态，不使用 Demo 运行记录填充页面。" /><section className="panel"><Table rowKey="id" columns={columns} dataSource={runs} pagination={false} /></section><Drawer title="运行审计" width={620} open={Boolean(detail)} onClose={() => setDetail(null)}>{detail && <div className="detail-stack"><Descriptions column={1} bordered size="small"><Descriptions.Item label="任务类型">{detail.kind}</Descriptions.Item><Descriptions.Item label="Run ID">{detail.id}</Descriptions.Item><Descriptions.Item label="Provider">{detail.provider}</Descriptions.Item><Descriptions.Item label="状态"><Tag color={statusMap[detail.status][1]}>{statusMap[detail.status][0]}</Tag></Descriptions.Item><Descriptions.Item label="输入 / 输出">{detail.inputCount} / {detail.outputCount}</Descriptions.Item><Descriptions.Item label="开始时间">{detail.startedAt}</Descriptions.Item><Descriptions.Item label="完成时间">{detail.completedAt ?? "—"}</Descriptions.Item></Descriptions><Divider orientation="left">任务说明</Divider><p className="drawer-copy">{detail.note || "—"}</p><Divider orientation="left">抓取日志</Divider>{detail.events?.length ? <div className="run-event-list">{detail.events.map((event) => <div className={`run-event run-event-${event.level}`} key={event.id}><span>{new Date(event.createdAt).toLocaleTimeString()}</span><strong>{event.message}</strong></div>)}</div> : <p className="drawer-copy">暂无逐步日志。新运行会记录搜索词、排序切换、候选检查、跳过原因和结束原因。</p>}<Space className="audit-event-line"><span className={detail.status === "waiting_review" ? "health-dot audit-dot-warning" : "health-dot"} />{statusMap[detail.status][0]}</Space></div>}</Drawer></>;
}
