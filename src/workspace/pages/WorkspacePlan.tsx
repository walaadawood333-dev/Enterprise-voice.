import { useEffect, useState } from "react";
import { Ban, Check, Gauge, Loader2 } from "lucide-react";
import { api } from "@/api";
import type { TenantCommercialSummaryDto } from "../../../shared/contracts";

type Summary = TenantCommercialSummaryDto;

const LIMIT_ROWS = [
  ["Users", "users", "maxUsers"], ["AI agents", "agents", "maxAgents"],
  ["Voice minutes this month", "monthlyMinutes", "maxMonthlyMinutes"],
  ["Campaigns", "campaigns", "maxCampaigns"], ["Connectors", "connectors", "maxConnectors"],
] as const;

export function WorkspacePlan() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void api.tenantCommercialSummary().then((result) => {
      if (result.ok) setData(result.data);
      else setError(result.error.message);
    });
  }, []);

  if (error) return <div className="p-8"><div className="rounded-xl border border-amber-300/30 bg-amber-50 p-5 text-sm text-amber-900">{error}</div></div>;
  if (!data) return <div className="grid min-h-[50vh] place-items-center text-black/40"><Loader2 className="animate-spin" /></div>;

  return <div className="space-y-6 p-6 lg:p-8">
    <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/35">Subscription</p><h1 className="mt-1 font-display text-2xl font-bold">Plan & capabilities</h1><p className="mt-1 text-sm text-black/45">These are the capabilities and usage limits currently enforced by CenterAI.</p></div>
    <section className="grid gap-4 lg:grid-cols-3">
      <article className="rounded-2xl border border-hair bg-white p-5 lg:col-span-2"><p className="text-[10px] font-bold uppercase tracking-widest text-black/35">Current plan</p>{data.subscription ? <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-3xl font-bold">{data.subscription.planName}</h2><p className="mt-1 text-sm capitalize text-black/45">Subscription {data.subscription.status}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Backend enforced</span></div> : <div className="mt-3"><h2 className="font-display text-xl font-bold text-amber-800">Not configured</h2><p className="mt-1 text-sm text-black/50">Ask a platform administrator to assign a subscription. Capabilities fail closed until then.</p></div>}</article>
      <article className="rounded-2xl border border-hair bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-widest text-black/35">Billing provider</p><h2 className="mt-3 font-display text-xl font-bold">Not configured</h2><p className="mt-1 text-sm text-black/45">No fake invoices, payments, or transactions are shown.</p></article>
    </section>

    <section><h2 className="font-display text-lg font-bold">Available capabilities</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.capabilities.map((capability) => <article key={capability.feature} className="flex items-center gap-3 rounded-2xl border border-hair bg-white p-4"><span className={`grid h-9 w-9 place-items-center rounded-full ${capability.enabled ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{capability.enabled ? <Check size={16} /> : <Ban size={16} />}</span><div><p className="text-sm font-semibold capitalize">{capability.feature.replace(/_/g, " ")}</p><p className="text-[11px] text-black/35">{capability.enabled ? "Available" : "Unavailable"} · {capability.source}</p></div></article>)}</div></section>

    <section><h2 className="font-display text-lg font-bold">Usage limits</h2><div className="mt-3 overflow-hidden rounded-2xl border border-hair bg-white">{LIMIT_ROWS.map(([label, usageKey, limitKey]) => {
      const used = data.usage[usageKey]; const limit = data.limits[limitKey] ?? 0; const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
      return <div key={limitKey} className="grid gap-3 border-b border-hair p-4 last:border-0 sm:grid-cols-[1fr_2fr_auto] sm:items-center"><div className="flex items-center gap-2 text-sm font-medium"><Gauge size={15} className="text-black/35" />{label}</div><div className="h-2 overflow-hidden rounded-full bg-black/[0.05]"><div className={`h-full rounded-full ${percent >= 100 ? "bg-red-500" : "bg-black/70"}`} style={{ width: `${percent}%` }} /></div><p className="numeral min-w-24 text-right text-xs text-black/50"><strong className="text-black">{used}</strong> / {limit}</p></div>;
    })}</div></section>
  </div>;
}
