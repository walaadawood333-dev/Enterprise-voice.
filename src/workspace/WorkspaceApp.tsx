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
import { WorkspaceAgents } from "./pages/WorkspaceAgents";
import { WorkspaceContacts } from "./pages/WorkspaceContacts";
import { WorkspaceTeam } from "./pages/WorkspaceTeam";
import { WorkspaceSettings } from "./pages/WorkspaceSettings";
import { WorkspaceCompliance } from "./pages/WorkspaceCompliance";
import { IntegrationsPage } from "@/studio/pages/Integrations";
import { RequireTenantRole } from "@/auth/RouteGuards";
import { TenantBrandingProvider } from "@/branding/TenantBrandingProvider";

export function WorkspaceApp() {
  return (
    <RequireTenantRole>
      <TenantBrandingProvider>
        <Routes>
          <Route element={<WorkspaceLayout />}>
            <Route index element={<Navigate to="/workspace/overview" replace />} />
            <Route path="overview" element={<WorkspaceOverview />} />
            <Route path="calls" element={<CallsList />} />
            <Route path="calls/:callId" element={<CallDetail />} />
            <Route path="live" element={<LiveActivity />} />
            <Route path="agents" element={<WorkspaceAgents />} />
            <Route path="agents/performance" element={<AgentPerformance />} />
            <Route path="contacts" element={<WorkspaceContacts />} />
            <Route path="campaigns" element={<CampaignsList />} />
            <Route path="campaigns/:campaignId" element={<CampaignDetail />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="team" element={<WorkspaceTeam />} />
            <Route path="integrations" element={<div className="p-8"><IntegrationsPage /></div>} />
            <Route path="compliance" element={<WorkspaceCompliance />} />
            <Route path="settings" element={<WorkspaceSettings />} />
            <Route path="plan" element={<WorkspacePlan />} />
            <Route path="*" element={<Navigate to="/workspace/overview" replace />} />
          </Route>
        </Routes>
      </TenantBrandingProvider>
    </RequireTenantRole>
  );
}
