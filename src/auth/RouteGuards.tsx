import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { PublicSite } from "@/site/PublicSite";
import { authenticatedHome, isPlatformRole, useAuth } from "@/hooks/useAuth";

function SessionLoading() {
  return (
    <div className="grain grid min-h-dvh place-items-center bg-mist text-ink" role="status">
      <div className="text-center">
        <p className="font-display text-lg font-bold tracking-tight">CenterAI</p>
        <p className="mt-2 text-xs text-black/40">Resolving your session…</p>
      </div>
    </div>
  );
}

function useSessionProbe() {
  const auth = useAuth();
  useEffect(() => {
    if (auth.status === "unknown") void auth.refresh(false);
  }, [auth.status, auth.refresh]);
  return auth;
}

/** The public website is never painted underneath an already authenticated session. */
export function PublicEntry() {
  const { status, session } = useSessionProbe();
  if (status === "unknown" || status === "checking") return <SessionLoading />;
  if (status === "authenticated" && session) {
    return <Navigate to={authenticatedHome(session)} replace />;
  }
  return <PublicSite />;
}

/** Login and registration are guest-only; valid sessions go directly to their application. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { status, session } = useSessionProbe();
  if (status === "unknown" || status === "checking") return <SessionLoading />;
  if (status === "authenticated" && session) {
    return <Navigate to={authenticatedHome(session)} replace />;
  }
  return <>{children}</>;
}

/** Client-side UX guard; every admin API performs the authoritative role check again. */
export function RequirePlatformRole({ children }: { children: ReactNode }) {
  const { status, session } = useSessionProbe();
  const location = useLocation();
  if (status === "unknown" || status === "checking") return <SessionLoading />;
  if (status !== "authenticated" || !session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!isPlatformRole(session.role)) return <Navigate to="/workspace/overview" replace />;
  return <>{children}</>;
}

/** Platform identities and tenant identities have separate application surfaces. */
export function RequireTenantRole({ children }: { children: ReactNode }) {
  const { status, session } = useSessionProbe();
  const location = useLocation();
  if (status === "unknown" || status === "checking") return <SessionLoading />;
  if (status !== "authenticated" || !session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (isPlatformRole(session.role)) return <Navigate to="/admin/overview" replace />;
  return <>{children}</>;
}
