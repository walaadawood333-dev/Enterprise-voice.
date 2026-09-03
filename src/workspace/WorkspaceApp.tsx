/**
 * CenterAI Workspace — Customer Operational Platform
 *
 * The daily workspace for subscribing organizations.
 * Navigation is dynamically configured based on entitlements.
 */

import { Route, Routes, Navigate } from "react-router-dom";
import { WorkspaceLayout } from "./components/WorkspaceLayout";
import { WorkspaceOverview } from "./pages/WorkspaceOverview";
import { CallsList } from "./pages/CallsList";
import { CallDetail } from "./pages/CallDetail";
import { LiveActivity } from "./pages/LiveActivity";
import { CampaignsList } from "./pages/CampaignsList";
import { CampaignDetail } from "./pages/CampaignDetail";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { AgentPerformance } from "./pages/AgentPerformance";
import { WorkspacePlan } from "./pages/WorkspacePlan";

export function WorkspaceApp() {
  return (
    <Routes>
      <Route element={<WorkspaceLayout />}>
        <Route index element={<Navigate to="/workspace/overview" replace />} />
        <Route path="overview" element={<WorkspaceOverview />} />
        <Route path="calls" element={<CallsList />} />
        <Route path="calls/:callId" element={<CallDetail />} />
        <Route path="live" element={<LiveActivity />} />
        <Route path="agents/performance" element={<AgentPerformance />} />
        <Route path="campaigns" element={<CampaignsList />} />
        <Route path="campaigns/:campaignId" element={<CampaignDetail />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="plan" element={<WorkspacePlan />} />
        <Route path="*" element={<Navigate to="/workspace/overview" replace />} />
      </Route>
    </Routes>
  );
}
