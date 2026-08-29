import { useSyncExternalStore } from "react";
import { api, setSessionToken } from "@/api";
import type { AuthSessionDto } from "../../shared/contracts";

export type AuthStatus = "unknown" | "checking" | "authenticated" | "anonymous";

interface AuthStore {
  status: AuthStatus;
  session: AuthSessionDto | null;
  /** Short, human copy. Server messages are already sanitised of internals. */
  error: string | null;
  fields: Record<string, string>;
  busy: boolean;
}

let store: AuthStore = {
  status: "unknown",
  session: null,
  error: null,
  fields: {},
  busy: false,
};

const listeners = new Set<() => void>();

function publish(patch: Partial<AuthStore>) {
  store = { ...store, ...patch };
  listeners.forEach((notify) => notify());
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};

const snapshot = () => store;

let probing: Promise<void> | null = null;

/** Ask the server who we are. Never inferred on the client — no `isLoggedIn` shortcuts. */
export function refreshSession(force = false): Promise<void> {
  if (probing && !force) return probing;
  probing = (async () => {
    publish({ status: "checking" });
    const result = await api.me();
    if (result.ok) {
      publish({ status: "authenticated", session: result.data, error: null, fields: {} });
    } else {
      // Only an explicit invalid-session answer means anonymous; a transport failure keeps the
      // error visible so the user is not silently bounced to a login wall they cannot beat.
      const unreachable =
        result.error.code === "NETWORK_ERROR" || result.error.code === "TIMEOUT";
      publish({
        status: "anonymous",
        session: null,
        error: unreachable
          ? "We could not reach the CenterAI API. You can still explore the demo workspace."
          : null,
      });
    }
    probing = null;
  })();
  return probing;
}

export async function login(email: string, password: string): Promise<boolean> {
  publish({ busy: true, error: null, fields: {} });
  const result = await api.login({ email, password });
  if (!result.ok) {
    publish({ busy: false, error: result.error.message, fields: result.error.fields ?? {} });
    return false;
  }
  if ("bearerToken" in result.data && typeof result.data.bearerToken === "string") {
    setSessionToken(result.data.bearerToken);
  }
  publish({ status: "authenticated", session: result.data.session, busy: false, error: null });
  return true;
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
  organizationName: string;
}): Promise<boolean> {
  publish({ busy: true, error: null, fields: {} });
  const result = await api.register(input);
  if (!result.ok) {
    publish({ busy: false, error: result.error.message, fields: result.error.fields ?? {} });
    return false;
  }
  publish({ status: "authenticated", session: result.data.session, busy: false, error: null });
  // The workspace now has a real owner; refresh so the studio shows the freshly issued session.
  void refreshSession(true);
  return true;
}

export async function logout(): Promise<void> {
  await api.logout();
  setSessionToken(null);
  publish({ status: "anonymous", session: null, error: null, fields: {} });
}

export function useAuth() {
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  return {
    ...state,
    refresh: refreshSession,
    login,
    register,
    logout,
    signOut: logout,
  };
}
