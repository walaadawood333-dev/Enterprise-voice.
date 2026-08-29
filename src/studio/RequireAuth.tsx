import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Route protection. The client guard is a UX boundary; the API independently refuses protected
 * reads without a valid session — that is where the real enforcement lives.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, refresh } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (status === "unknown") void refresh(false);
  }, [status, refresh]);

  if (status === "unknown" || status === "checking") {
    return (
      <div className="grain relative flex min-h-dvh items-center justify-center bg-mist">
        <div className="w-full max-w-[520px] space-y-4 px-6">
          <p className="font-display text-[10px] font-bold tracking-[0.22em] text-black/40 uppercase">
            CenterAI Studio
          </p>
          <div className="shimmer h-9 w-2/3 rounded-full" />
          <div className="shimmer h-4 w-1/2 rounded-full" />
          <div className="space-y-2.5 pt-2">
            {[0, 1, 2].map((row) => (
              <div key={row} className="shimmer h-16 rounded-2xl" style={{ animationDelay: `${row * 110}ms` }} />
            ))}
          </div>
          <p className="sr-only" role="status">
            Checking your session
          </p>
        </div>
      </div>
    );
  }

  if (status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
