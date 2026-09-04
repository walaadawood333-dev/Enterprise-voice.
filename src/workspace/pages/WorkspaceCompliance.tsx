import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/api";

interface Policy { id: string; name: string; category: string; enabled: boolean; severity: string }

export function WorkspaceCompliance() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch("/api/workspace/compliance/policies").then(async (response) => {
      if (response.ok) {
        const payload = await response.json();
        setPolicies(Array.isArray(payload) ? payload : []);
      } else {
        const payload = await response.json().catch(() => null);
        setStatus(payload?.error?.message ?? "Compliance is not configured for this organization.");
      }
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6 p-8">
      <div><p className="font-display text-[10px] uppercase tracking-[0.2em] text-black/35">Governance</p><h2 className="mt-1 font-display text-2xl font-bold">Compliance</h2></div>
      {loading ? <p className="inline-flex items-center gap-2 text-sm text-black/45"><Loader2 size={14} className="animate-spin" /> Loading policies…</p> : null}
      {status ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h3 className="font-display font-bold text-amber-900">Not configured</h3><p className="mt-2 text-sm text-amber-800">{status}</p></div> : null}
      {!loading && !status && policies.length === 0 ? <div className="rounded-xl border border-dashed border-black/15 bg-white p-10 text-center"><ShieldCheck className="mx-auto text-black/15" /><p className="mt-3 text-sm text-black/45">Compliance is enabled, but no policies have been configured.</p></div> : null}
      {policies.length > 0 ? <div className="grid gap-3 md:grid-cols-2">{policies.map((policy) => <article key={policy.id} className="rounded-xl border border-hair bg-white p-5"><div className="flex justify-between gap-3"><h3 className="font-display font-bold">{policy.name}</h3><span className="rounded-full bg-mist px-2 py-1 text-[10px] font-semibold">{policy.enabled ? "Enabled" : "Disabled"}</span></div><p className="mt-3 text-xs text-black/45">{policy.category.replace(/_/g, " ")} · {policy.severity}</p></article>)}</div> : null}
    </div>
  );
}
