import { apiFetch } from "@/api";
import { useEffect, useState } from "react";
import { Ban, Check, Loader2, RotateCcw } from "lucide-react";

type Organization = { id: string; name: string };
type Capability = { feature: string; enabled: boolean; source: "plan" | "override" | "unavailable" };
type Payload = {
  organizationId: string;
  subscription: { planName: string; status: string } | null;
  capabilities: Capability[];
  overrides: Array<{ feature: string; enabled: boolean; reason: string | null }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, { ...init, credentials: "include", headers: { "content-type": "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}

export function AdminEntitlements() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEntitlements = async (id: string) => {
    if (!id) return;
    setError(null);
    try { setData(await request<Payload>(`/api/admin/entitlements?organizationId=${encodeURIComponent(id)}`)); }
    catch (reason) { setError((reason as Error).message); }
  };

  useEffect(() => {
    void request<Organization[]>("/api/admin/organizations")
      .then((rows) => { setOrganizations(rows); setOrganizationId(rows[0]?.id ?? ""); })
      .catch((reason) => setError(reason.message));
  }, []);
  useEffect(() => { void loadEntitlements(organizationId); }, [organizationId]);

  const setOverride = async (feature: string, enabled: boolean) => {
    setBusy(feature); setError(null);
    try {
      await request(`/api/admin/entitlements/${encodeURIComponent(organizationId)}/${feature}`, {
        method: "PUT", body: JSON.stringify({ enabled, reason: enabled ? "Platform admin grant" : "Platform admin restriction" }),
      });
      await loadEntitlements(organizationId);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(null); }
  };
  const inherit = async (feature: string) => {
    setBusy(feature); setError(null);
    try {
      await request(`/api/admin/entitlements/${encodeURIComponent(organizationId)}/${feature}`, { method: "DELETE" });
      await loadEntitlements(organizationId);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(null); }
  };

  return <div className="p-8 space-y-6">
    <div><p className="text-xs uppercase tracking-widest text-white/40">Commercial control plane</p><h2 className="mt-1 text-2xl font-bold">Entitlements</h2><p className="mt-1 text-sm text-white/40">Explicit grants and revocations override the subscribed plan and take effect in the backend immediately.</p></div>
    <label className="block max-w-md text-xs text-white/40">Organization<select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-white">{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
    {data ? <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm"><span className="text-white/40">Subscription: </span>{data.subscription ? <><strong>{data.subscription.planName}</strong><span className="ml-2 text-white/35">{data.subscription.status}</span></> : <strong className="text-amber-200">Not configured — all capabilities fail closed</strong>}</div> : null}
    {error ? <p className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p> : null}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data?.capabilities.map((capability) => {
      const working = busy === capability.feature;
      return <article key={capability.feature} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">{capability.feature.replace(/_/g, " ")}</h3><p className="mt-1 text-[10px] uppercase tracking-widest text-white/30">Source: {capability.source}</p></div><span className={`grid h-7 w-7 place-items-center rounded-full ${capability.enabled ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300"}`}>{working ? <Loader2 size={13} className="animate-spin" /> : capability.enabled ? <Check size={13} /> : <Ban size={13} />}</span></div>
        <div className="mt-4 flex gap-1.5"><button disabled={working} onClick={() => void setOverride(capability.feature, true)} className="rounded-md border border-emerald-400/20 px-2 py-1 text-[10px] text-emerald-200">Grant</button><button disabled={working} onClick={() => void setOverride(capability.feature, false)} className="rounded-md border border-red-400/20 px-2 py-1 text-[10px] text-red-200">Block</button>{capability.source === "override" ? <button disabled={working} onClick={() => void inherit(capability.feature)} className="ml-auto inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/45"><RotateCcw size={10} /> Inherit</button> : null}</div>
      </article>;
    })}</div>
  </div>;
}
