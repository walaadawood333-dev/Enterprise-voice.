import { apiFetch } from "@/api";
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, Save, X } from "lucide-react";

const FEATURES = [
  "ai_agents", "voice_calls", "inbound_calls", "outbound_calls", "campaigns",
  "live_call_monitoring", "analytics", "advanced_analytics", "reporting", "data_connectors",
  "knowledge_base", "compliance", "dnc_management", "audit_trail", "qa_evaluation",
  "custom_branding", "api_access", "custom_integrations", "contact_center_operations",
] as const;
const LIMITS = ["maxUsers", "maxAgents", "maxMonthlyMinutes", "maxCampaigns", "maxConnectors"] as const;

type Feature = (typeof FEATURES)[number];
type Limit = (typeof LIMITS)[number];
type Plan = {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
  features: Feature[];
  limits: Record<Limit, number>;
};

const emptyPlan: Omit<Plan, "id"> = {
  name: "",
  status: "draft",
  features: [],
  limits: { maxUsers: 0, maxAgents: 0, maxMonthlyMinutes: 0, maxCampaigns: 0, maxConnectors: 0 },
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}

function PlanEditor({ plan, onSaved }: { plan: Plan; onSaved: (plan: Plan) => void }) {
  const [draft, setDraft] = useState(plan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const saved = await request<Plan>(`/api/admin/plans/${encodeURIComponent(plan.id)}`, {
        method: "PATCH", body: JSON.stringify(draft),
      });
      setDraft(saved); onSaved(saved);
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <input aria-label="Plan name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            className="w-full bg-transparent font-display text-lg font-bold outline-none border-b border-transparent focus:border-white/20" />
          <p className="mt-1 text-[11px] uppercase tracking-widest text-white/30">Capability and limit policy</p>
        </div>
        <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Plan["status"] })}
          className="rounded-full border border-white/10 bg-[#111] px-2.5 py-1 text-xs text-white/70">
          <option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option>
        </select>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/35">Capabilities</p>
        <div className="flex flex-wrap gap-1.5">
          {FEATURES.map((feature) => {
            const enabled = draft.features.includes(feature);
            return <button key={feature} type="button" onClick={() => setDraft({ ...draft, features: enabled ? draft.features.filter((item) => item !== feature) : [...draft.features, feature] })}
              className={`rounded-full border px-2 py-1 text-[10px] transition ${enabled ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-white/10 text-white/30"}`}>
              {enabled ? <Check size={10} className="mr-1 inline" /> : null}{feature.replace(/_/g, " ")}
            </button>;
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {LIMITS.map((key) => <label key={key} className="text-[10px] text-white/35">
          {key.replace(/^max/, "Max ").replace(/([A-Z])/g, " $1")}
          <input type="number" min={0} value={draft.limits[key]} onChange={(event) => setDraft({ ...draft, limits: { ...draft.limits, [key]: Number(event.target.value) } })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs text-white outline-none focus:border-white/25" />
        </label>)}
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-black disabled:opacity-50">
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save plan
      </button>
    </article>
  );
}

export function AdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyPlan);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => [...plans].sort((a, b) => a.name.localeCompare(b.name)), [plans]);
  const load = () => request<Plan[]>("/api/admin/plans").then(setPlans).catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);

  const create = async () => {
    setError(null);
    try {
      const plan = await request<Plan>("/api/admin/plans", { method: "POST", body: JSON.stringify(draft) });
      setPlans((current) => [...current, plan]); setDraft(emptyPlan); setCreating(false);
    } catch (reason) { setError((reason as Error).message); }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-display uppercase tracking-widest text-white/40 mb-1">Commercial control plane</p><h2 className="text-2xl font-display font-bold">Plans</h2><p className="mt-1 text-sm text-white/40">Plan capabilities and limits are enforced by the backend.</p></div>
        <button onClick={() => setCreating((value) => !value)} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold"><Plus size={14} /> New plan</button>
      </div>
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-100/70"><strong>Billing provider:</strong> Not configured. No invoices, payments, or transactions are generated.</div>
      {creating ? <div className="rounded-xl border border-white/15 bg-white/[0.03] p-5 space-y-3">
        <div className="flex justify-between"><h3 className="font-bold">Create draft plan</h3><button onClick={() => setCreating(false)}><X size={15} /></button></div>
        <input placeholder="Plan name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm" />
        <button onClick={create} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-black">Create plan</button>
      </div> : null}
      {error ? <p className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p> : null}
      {loading ? <p className="text-white/40">Loading plans…</p> : <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{sorted.map((plan) => <PlanEditor key={plan.id} plan={plan} onSaved={(saved) => setPlans((current) => current.map((item) => item.id === saved.id ? saved : item))} />)}</div>}
    </div>
  );
}
