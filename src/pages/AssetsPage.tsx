import { Alert, Button, Descriptions, Drawer, Form, Image, Input, Select, Tag, message } from "antd";
import { FolderPlus, Images, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { PageHeader, Panel } from "../components/Shared";
import { controlApi } from "../services/controlApi";
import { useDemoState } from "../state/demoStateContext";
import type { AssetRecord } from "../types";

type AssetForm = Pick<AssetRecord, "name" | "type" | "usage"> & { tags: string };

export function AssetsPage() {
  const navigate = useNavigate();
  const { selectedProject, projects } = useDemoState();
  const [assetItems, setAssetItems] = useState<AssetRecord[]>([]);
  const [detailAsset, setDetailAsset] = useState<AssetRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm<AssetForm>();
  const [messageApi, contextHolder] = message.useMessage();
  const projectAssets = useMemo(() => assetItems.filter((asset) => asset.projectId === selectedProject), [assetItems, selectedProject]);
  const currentProject = projects.find((project) => project.id === selectedProject);
  useEffect(() => { if (!selectedProject) return; void controlApi.listAssets(selectedProject).then(setAssetItems).catch((error: Error) => messageApi.error(error.message)); }, [selectedProject, messageApi]);

  const openAssetForm = () => {
    form.resetFields();
    setDrawerOpen(true);
  };

  const addAsset = (values: AssetForm) => {
    void controlApi.createAsset({ projectId: selectedProject, name: values.name, type: values.type, usage: values.usage, tags: (values.tags ?? "").split(",").map((item) => item.trim()).filter(Boolean) }).then((next) => { setAssetItems((items) => [next, ...items]); setDrawerOpen(false); messageApi.success("资产元数据已保存"); }).catch((error: Error) => messageApi.error(error.message));
  };

  return <>{contextHolder}<PageHeader title="项目资产" meta="截图、录屏和品牌素材是 Idea 层的可复用输入" actions={<><Button icon={<FolderPlus size={15} />} onClick={() => navigate("/projects/new")}>新建项目</Button><Button type="primary" icon={<Plus size={15} />} onClick={openAssetForm}>登记资产</Button></>} />
    <Alert className="section-alert" type="info" showIcon message="资产匹配只决定复用现有素材还是交给生成管线，不会自动覆盖原始资产。每个资产都保留 ID、标签和使用范围。" />
    <Panel title="当前项目资产库" caption={`${projectAssets.length} 个资产 · ${currentProject?.name ?? selectedProject}`}>{projectAssets.length ? <div className="asset-grid">{projectAssets.map((asset) => <article className="asset-card" key={asset.id} onClick={() => setDetailAsset(asset)}><Image preview={false} className="asset-thumb" src={asset.image} alt={asset.name} /><div className="asset-card-body"><div className="entity-card-header"><div><h2 className="entity-title">{asset.name}</h2><div className="entity-subtitle">{asset.type} · {asset.id}</div></div><Tag color={asset.status === "可用" ? "green" : "gold"}>{asset.status}</Tag></div><div className="topic-tags">{asset.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div><div className="asset-usage">{asset.usage}</div></div></article>)}</div> : <div className="empty-state"><Images size={28} /><strong>当前项目还没有资产</strong><div>可以先完成项目配置，再登记截图、录屏、Logo 或音频元数据。</div><Button type="primary" icon={<Plus size={15} />} onClick={openAssetForm}>登记第一个资产</Button></div>}</Panel>
    <Drawer title="登记项目资产" width={440} open={drawerOpen} onClose={() => setDrawerOpen(false)} extra={<Button type="primary" onClick={() => form.submit()}>登记</Button>}><Form form={form} layout="vertical" onFinish={addAsset}><Form.Item name="name" label="资产名称" rules={[{ required: true }]}><Input placeholder="例如：战斗反馈录屏 02" /></Form.Item><Form.Item name="type" label="类型" rules={[{ required: true }]}><Select options={["截图", "录屏", "Logo", "音频", "其他"].map((type) => ({ value: type, label: type }))} /></Form.Item><Form.Item name="tags" label="标签"><Input placeholder="用逗号分隔，例如 combat, mobile, ui" /></Form.Item><Form.Item name="usage" label="使用范围"><Input.TextArea rows={3} placeholder="例如：可用于视频 Idea，不可作为原帖复刻素材" /></Form.Item><Alert type="info" showIcon message="当前登记的是数据库元数据。文件内容请通过 Artifact 上传接口保存。" /></Form></Drawer>
    <Drawer title="资产详情" width={520} open={Boolean(detailAsset)} onClose={() => setDetailAsset(null)}>{detailAsset && <div className="detail-stack"><Image className="detail-media" src={detailAsset.image} alt={detailAsset.name} /><Descriptions column={1} bordered size="small"><Descriptions.Item label="名称">{detailAsset.name}</Descriptions.Item><Descriptions.Item label="Asset ID">{detailAsset.id}</Descriptions.Item><Descriptions.Item label="类型">{detailAsset.type}</Descriptions.Item><Descriptions.Item label="状态">{detailAsset.status}</Descriptions.Item><Descriptions.Item label="使用范围">{detailAsset.usage}</Descriptions.Item><Descriptions.Item label="标签">{detailAsset.tags.join("、")}</Descriptions.Item></Descriptions><Button icon={<Search size={14} />} onClick={() => messageApi.info("视觉向量检索尚未连接")}>测试 Idea 匹配</Button></div>}</Drawer>
  </>;
}
