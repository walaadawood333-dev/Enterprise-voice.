/**
 * CenterAI Admin — Platform Control Plane
 *
 * Administrative application for CenterAI platform operators.
 * Manages organizations, subscriptions, plans, and platform health.
 */

import { Route, Routes, Navigate } from "react-router-dom";
import { AdminLayout } from "./components/AdminLayout";
import { AdminOverview } from "./pages/AdminOverview";
import { AdminOrganizations } from "./pages/AdminOrganizations";
import { AdminPlans } from "./pages/AdminPlans";
import { AdminSubscriptions } from "./pages/AdminSubscriptions";
import { AdminEntitlements } from "./pages/AdminEntitlements";
import { AdminProviders } from "./pages/AdminProviders";
import { AdminUsage } from "./pages/AdminUsage";
import { RequirePlatformRole } from "@/auth/RouteGuards";
import { AdminAudit, AdminConnectors, AdminHealth, AdminSettings, AdminUsers } from "./pages/AdminOperationalPages";

export function AdminApp() {
  return (
    <RequirePlatformRole>
      <Routes>
        <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/overview" replace />} />
        <Route path="overview" element={<AdminOverview />} />
        <Route path="organizations" element={<AdminOrganizations />} />
        <Route path="organizations/:id" element={<AdminOrganizations />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="plans" element={<AdminPlans />} />
        <Route path="subscriptions" element={<AdminSubscriptions />} />
        <Route path="entitlements" element={<AdminEntitlements />} />
        <Route path="providers" element={<AdminProviders />} />
        <Route path="connectors" element={<AdminConnectors />} />
        <Route path="usage" element={<AdminUsage />} />
        <Route path="health" element={<AdminHealth />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="*" element={<Navigate to="/admin/overview" replace />} />
        </Route>
      </Routes>
    </RequirePlatformRole>
  );
}
