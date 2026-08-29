import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "./components/DashboardLayout";
import { RequireAuth } from "./RequireAuth";
import { OverviewPage } from "./pages/Overview";
import { AgentsPage } from "./pages/Agents";
import { AgentDetailPage } from "./pages/AgentDetail";
import { AgentTestPage } from "./pages/AgentTest";
import { SessionsPage } from "./pages/Sessions";
import { CampaignsPage } from "./pages/Campaigns";
import { AnalyticsPage } from "./pages/Analytics";
import { IntegrationsPage } from "./pages/Integrations";
import { SettingsPage } from "./pages/Settings";
import { DEFAULT_STUDIO_PATH } from "./studioRoutes";

/**
 * Agent Studio routing. Everything under /studio sits behind the session guard; the guard is UX —
 * the API independently refuses these reads and writes without a verified session.
 */
export function StudioApp() {
  return (
    <RequireAuth>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route index element={<Navigate to={DEFAULT_STUDIO_PATH} replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="agents/:agentId" element={<AgentDetailPage />} />
          <Route path="agents/:agentId/test" element={<AgentTestPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to={DEFAULT_STUDIO_PATH} replace />} />
        </Route>
      </Routes>
    </RequireAuth>
  );
}
