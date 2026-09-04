import { useEffect, useState } from "react";
import { Database, Loader2, Plug, Settings, Users } from "lucide-react";
import { apiFetch } from "@/api";

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };

function useAdminData<T>(path: string): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ loading: true, data: null, error: null });
  useEffect(() => {
    void apiFetch(path).then(async (response) => {
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setState({ loading: false, data: null, error: payload?.error?.message ?? "Request failed." });
      } else {
        setState({ loading: false, data: await response.json() as T, error: null });
      }
    });
  }, [path]);
  return state;
}

function AdminFrame({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <div className="space-y-6 p-8"><div><p className="text-xs font-display uppercase tracking-widest text-white/40">{eyebrow}</p><h2 className="mt-1 text-2xl font-display font-bold">{title}</h2></div>{children}</div>;
}
function Loading() { return <p className="inline-flex items-center gap-2 text-sm text-white/45"><Loader2 size={14} className="animate-spin" /> Loading persisted data…</p>; }
function Failure({ message }: { message: string }) { return <p className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">{message}</p>; }

interface AdminUser { id: string; name: string; email: string; role: string; status: string; organizationName?: string }
export function AdminUsers() {
  const state = useAdminData<{ users: AdminUser[]; total: number }>("/api/admin/v2/users?limit=100");
  return <AdminFrame eyebrow="Identity control plane" title="Users">{state.loading ? <Loading /> : state.error ? <Failure message={state.error} /> : <div className="overflow-hidden rounded-xl border border-white/10"><table className="w-full text-sm"><thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-white/40"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Organization</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-white/5">{state.data?.users.map((user) => <tr key={user.id}><td className="px-4 py-3"><strong>{user.name}</strong><span className="block text-xs text-white/40">{user.email}</span></td><td className="px-4 py-3 text-white/60">{user.organizationName ?? "Platform"}</td><td className="px-4 py-3">{user.role}</td><td className="px-4 py-3">{user.status}</td></tr>)}</tbody></table>{state.data?.users.length === 0 ? <p className="p-8 text-center text-sm text-white/40">No users found.</p> : null}</div>}</AdminFrame>;
}

export function AdminHealth() {
  const state = useAdminData<{ database: string; providers: unknown[]; connectors: { total: number; healthy: number; degraded: number; unhealthy: number }; generatedAt: string }>("/api/admin/v2/health");
  return <AdminFrame eyebrow="Runtime status" title="Platform health">{state.loading ? <Loading /> : state.error ? <Failure message={state.error} /> : <div className="grid gap-4 md:grid-cols-3"><StatusCard icon={Database} label="Database" value={state.data?.database ?? "unknown"} /><StatusCard icon={Plug} label="Providers" value={String(state.data?.providers.length ?? 0)} /><StatusCard icon={Plug} label="Connectors" value={String(state.data?.connectors.total ?? 0)} /></div>}</AdminFrame>;
}

export function AdminConnectors() {
  const state = useAdminData<{ connectorProviders?: Array<{ id: string; name: string; status: string; type: string }> }>("/api/admin/providers");
  const connectors = state.data?.connectorProviders ?? [];
  return <AdminFrame eyebrow="Provider registry" title="Connectors">{state.loading ? <Loading /> : state.error ? <Failure message={state.error} /> : connectors.length === 0 ? <p className="rounded-xl border border-white/10 p-6 text-sm text-white/45">No connector adapters are registered.</p> : <div className="grid gap-3 md:grid-cols-2">{connectors.map((connector) => <article key={connector.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-5"><h3 className="font-display font-bold">{connector.name}</h3><p className="mt-2 text-xs text-white/45">{connector.type} · {connector.status}</p></article>)}</div>}</AdminFrame>;
}

interface AuditEvent { id: string; organizationId: string | null; action: string; actorEmail: string | null; createdAt: string }
export function AdminAudit() {
  const state = useAdminData<{ events: AuditEvent[]; total: number }>("/api/admin/v2/audit?limit=100");
  return <AdminFrame eyebrow="Immutable activity" title="Audit">{state.loading ? <Loading /> : state.error ? <Failure message={state.error} /> : <div className="space-y-2">{state.data?.events.map((event) => <article key={event.id} className="flex flex-wrap justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4"><span><strong className="text-sm">{event.action}</strong><span className="mt-1 block text-xs text-white/40">{event.organizationId ?? "platform"} · {event.actorEmail ?? "system"}</span></span><time className="text-xs text-white/40">{new Date(event.createdAt).toLocaleString()}</time></article>)}{state.data?.events.length === 0 ? <p className="rounded-xl border border-white/10 p-6 text-sm text-white/45">No audit events recorded.</p> : null}</div>}</AdminFrame>;
}

export function AdminSettings() {
  return <AdminFrame eyebrow="Platform configuration" title="Settings"><div className="max-w-2xl rounded-xl border border-amber-400/20 bg-amber-400/5 p-6"><Settings className="text-amber-200" /><h3 className="mt-4 font-display font-bold text-amber-100">Not configured</h3><p className="mt-2 text-sm leading-relaxed text-amber-100/60">There is no general platform-settings write API. Runtime secrets and deployment configuration remain server-side, so this route intentionally exposes no fake toggles.</p></div></AdminFrame>;
}

function StatusCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return <article className="rounded-xl border border-white/10 bg-white/[0.02] p-5"><Icon className="text-white/35" size={18} /><p className="mt-4 text-xs uppercase tracking-wider text-white/40">{label}</p><p className="mt-2 font-display text-2xl font-bold">{value}</p></article>;
}
