import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "@/components";
import { UIProvider } from "@/context/UIProvider";
import { PublicSite } from "@/site/PublicSite";
import { LoginPage, RegisterPage } from "@/auth/AuthScreen";
import { StudioApp } from "@/studio/StudioApp";

/**
 * Entry router.
 *
 * Three surfaces, one design system:
 *   /            → public marketing site (unchanged)
 *   /login, /register → CenterAI sign-in (server-validated identity)
 *   /studio/*    → Agent Studio, protected by a session guard
 * UIProvider is shared so the Book-a-Demo dialog works from any surface.
 */
export default function App() {
  return (
    <UIProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicSite />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/studio/*"
            element={
              <ErrorBoundary label="agent studio">
                <StudioApp />
              </ErrorBoundary>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </UIProvider>
  );
}
