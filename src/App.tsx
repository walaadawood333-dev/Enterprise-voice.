import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "@/components";
import { UIProvider } from "@/context/UIProvider";
import { LoginPage, RegisterPage } from "@/auth/AuthScreen";
import { GuestOnly, PublicEntry } from "@/auth/RouteGuards";
import { StudioApp } from "@/studio/StudioApp";
import { AdminApp } from "@/admin/AdminApp";
import { WorkspaceApp } from "@/workspace/WorkspaceApp";

/**
 * Entry router.
 *
 * Multiple surfaces, one design system:
 *   /            → public marketing site
 *   /login, /register → CenterAI sign-in
 *   /studio/*    → Agent Studio (legacy, preserved)
 *   /admin/*     → Platform Control Plane (Phase 10A)
 *   /workspace/* → Customer Workspace (Phase 10A)
 */
export default function App() {
  return (
    <UIProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicEntry />} />
          <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
          <Route
            path="/studio/*"
            element={
              <ErrorBoundary label="agent studio">
                <StudioApp />
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin/*"
            element={
              <ErrorBoundary label="platform admin">
                <AdminApp />
              </ErrorBoundary>
            }
          />
          <Route
            path="/workspace/*"
            element={
              <ErrorBoundary label="customer workspace">
                <WorkspaceApp />
              </ErrorBoundary>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </UIProvider>
  );
}
