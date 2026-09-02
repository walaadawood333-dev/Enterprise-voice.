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

export function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/overview" replace />} />
        <Route path="overview" element={<AdminOverview />} />
        <Route path="organizations" element={<AdminOrganizations />} />
        <Route path="organizations/:id" element={<AdminOrganizations />} />
        <Route path="plans" element={<AdminPlans />} />
        <Route path="*" element={<Navigate to="/admin/overview" replace />} />
      </Route>
    </Routes>
  );
}
