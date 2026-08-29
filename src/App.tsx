import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/react-router";
import { ConfigProvider } from "antd";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { controlDataProvider } from "./data/controlDataProvider";
import { DemoStateProvider } from "./state/DemoState";

const AccountsPage = lazy(() => import("./pages/AccountsPage").then((module) => ({ default: module.AccountsPage })));
const AccountSetupPage = lazy(() => import("./pages/AccountSetupPage").then((module) => ({ default: module.AccountSetupPage })));
const AssetsPage = lazy(() => import("./pages/AssetsPage").then((module) => ({ default: module.AssetsPage })));
const GenerationPage = lazy(() => import("./pages/GenerationPage").then((module) => ({ default: module.GenerationPage })));
const IdeasPage = lazy(() => import("./pages/IdeasPage").then((module) => ({ default: module.IdeasPage })));
const OverviewPage = lazy(() => import("./pages/OverviewPage").then((module) => ({ default: module.OverviewPage })));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage").then((module) => ({ default: module.ProjectsPage })));
const ProjectSetupPage = lazy(() => import("./pages/ProjectSetupPage").then((module) => ({ default: module.ProjectSetupPage })));
const ReleasePage = lazy(() => import("./pages/ReleasePage").then((module) => ({ default: module.ReleasePage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const SourcePostsPage = lazy(() => import("./pages/SourcePostsPage").then((module) => ({ default: module.SourcePostsPage })));
const TopicRadarPage = lazy(() => import("./pages/TopicRadarPage").then((module) => ({ default: module.TopicRadarPage })));
const RunsPage = lazy(() => import("./pages/RunsPage").then((module) => ({ default: module.RunsPage })));

const resources = [
  { name: "overview", list: "/overview", meta: { label: "总览" } },
  { name: "projects", list: "/projects", meta: { label: "项目" } },
  { name: "topics", list: "/topics", meta: { label: "话题雷达" } },
  { name: "source-posts", list: "/source-posts", meta: { label: "爆帖收件箱" } },
  { name: "ideas", list: "/ideas", meta: { label: "Idea 审核" } },
  { name: "generation", list: "/generation", meta: { label: "生成队列" } },
  { name: "release", list: "/release", meta: { label: "发布中心" } },
  { name: "accounts", list: "/accounts", meta: { label: "账号" } },
  { name: "assets", list: "/assets", meta: { label: "项目资产" } },
  { name: "runs", list: "/runs", meta: { label: "任务与审计" } },
  { name: "settings", list: "/settings", meta: { label: "设置" } },
];

function App() {
  return (
    <BrowserRouter>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: "#3f6f52",
            colorInfo: "#3f6f52",
            colorBorder: "#dfe3dd",
            colorBgLayout: "#f4f6f3",
            colorText: "#202520",
            borderRadius: 6,
            fontFamily: 'Inter, "Segoe UI", "Microsoft YaHei", sans-serif',
          },
          components: {
            Button: { controlHeight: 36, fontWeight: 600 },
            Card: { borderRadiusLG: 6 },
            Table: { headerBg: "#f6f7f5", headerColor: "#58605a" },
          },
        }}
      >
        <DemoStateProvider>
          <Refine
            routerProvider={routerProvider}
            dataProvider={controlDataProvider}
            resources={resources}
            options={{ syncWithLocation: true, warnWhenUnsavedChanges: false }}
          >
            <Suspense fallback={<div className="route-loading">正在加载工作区...</div>}><Routes>
              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/overview" replace />} />
                <Route path="/overview" element={<OverviewPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/new" element={<ProjectSetupPage />} />
                <Route path="/projects/:projectId/edit" element={<ProjectSetupPage />} />
                <Route path="/topics" element={<TopicRadarPage />} />
                <Route path="/source-posts" element={<SourcePostsPage />} />
                <Route path="/ideas" element={<IdeasPage />} />
                <Route path="/generation" element={<GenerationPage />} />
                <Route path="/release" element={<ReleasePage />} />
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/accounts/new" element={<AccountSetupPage />} />
                <Route path="/accounts/:accountId/edit" element={<AccountSetupPage />} />
                <Route path="/assets" element={<AssetsPage />} />
                <Route path="/runs" element={<RunsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/overview" replace />} />
            </Routes></Suspense>
          </Refine>
        </DemoStateProvider>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
