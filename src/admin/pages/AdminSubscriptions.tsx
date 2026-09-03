import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

type Organization = { id: string; name: string; status: string };
type Plan = { id: string; name: string; status: string };
type Subscription = {
  id: string; organizationId: string; organizationName: string; planId: string; planName: string;
  status: "active" | "trial" | "suspended" | "cancelled" | "past_due"; trialEndsAt: string | null;
  startedAt: string;
};

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include", headers: { "content-type": "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}

export function AdminSubscriptions() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState<Subscription["status"]>("active");
  const [trialEndsAt, setTrialEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePlans = useMemo(() => plans.filter((plan) => plan.status === "active"), [plans]);
  const load = async () => {
    setError(null);
    try {
      const [orgRows, planRows, subscriptionRows] = await Promise.all([
        get<Organization[]>("/api/admin/organizations"), get<Plan[]>("/api/admin/plans"), get<Subscription[]>("/api/admin/subscriptions"),
      ]);
      setOrganizations(orgRows); setPlans(planRows); setSubscriptions(subscriptionRows);
      setOrganizationId((value) => value || orgRows[0]?.id || "");
      setPlanId((value) => value || planRows.find((plan) => plan.status === "active")?.id || "");
    } catch (reason) { setError((reason as Error).message); }
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!organizationId || !planId) return;
    setSaving(true); setError(null);
    try {
      await get(`/api/admin/subscriptions/${encodeURIComponent(organizationId)}`, {
        method: "PUT",
        body: JSON.stringify({ planId, status, trialEndsAt: status === "trial" ? trialEndsAt : null }),
      });
      await load();
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  };

  return <div className="p-8 space-y-6">
    <div className="flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-white/40">Commercial control plane</p><h2 className="mt-1 text-2xl font-bold">Subscriptions</h2><p className="mt-1 text-sm text-white/40">Assign one active plan to each organization.</p></div><button onClick={() => void load()} className="rounded-lg border border-white/10 p-2 text-white/50" aria-label="Refresh"><RefreshCw size={15} /></button></div>

    <section className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-5 md:grid-cols-4">
      <label className="text-xs text-white/40">Organization<select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-white">{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
      <label className="text-xs text-white/40">Plan<select value={planId} onChange={(e) => setPlanId(e.target.value)} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-white">{activePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
      <label className="text-xs text-white/40">Status<select value={status} onChange={(e) => setStatus(e.target.value as Subscription["status"])} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-white"><option value="active">Active</option><option value="trial">Trial</option><option value="suspended">Suspended</option><option value="cancelled">Cancelled</option></select></label>
      {status === "trial" ? <label className="text-xs text-white/40">Trial ends<input type="datetime-local" value={trialEndsAt} onChange={(e) => setTrialEndsAt(e.target.value)} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-white" /></label> : <div className="flex items-end"><button onClick={save} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-black disabled:opacity-50">{saving ? <Loader2 size={13} className="animate-spin" /> : null} Save subscription</button></div>}
      {status === "trial" ? <button onClick={save} disabled={saving} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-black">Save subscription</button> : null}
    </section>

    {error ? <p className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p> : null}
    <div className="overflow-hidden rounded-xl border border-white/10"><table className="w-full text-sm"><thead className="bg-white/5 text-left text-[10px] uppercase tracking-widest text-white/40"><tr><th className="px-4 py-3">Organization</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Started</th></tr></thead><tbody className="divide-y divide-white/5">{subscriptions.map((subscription) => <tr key={subscription.id}><td className="px-4 py-3 font-medium">{subscription.organizationName}</td><td className="px-4 py-3 text-white/60">{subscription.planName}</td><td className="px-4 py-3"><span className="rounded-full bg-white/5 px-2 py-1 text-xs">{subscription.status}</span></td><td className="px-4 py-3 text-xs text-white/35">{new Date(subscription.startedAt).toLocaleDateString()}</td></tr>)}</tbody></table>{subscriptions.length === 0 ? <p className="p-6 text-sm text-white/35">No subscriptions configured.</p> : null}</div>
    <p className="text-xs text-white/35"><strong className="text-white/55">Payment provider:</strong> Not configured. Subscription access is managed here without fake billing records.</p>
  </div>;
}
