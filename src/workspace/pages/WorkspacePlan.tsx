import { useEffect, useState } from "react";
import {
  Ban,
  Bot,
  Check,
  Gauge,
  Loader2,
  Megaphone,
  PhoneCall,
  RefreshCw,
  Timer,
} from "lucide-react";
import { api } from "@/api";
import type { TenantUsageFoundationDto, UsageLimitKey } from "../../../shared/contracts";

const LIMIT_LABELS: Record<UsageLimitKey, string> = {
  maxUsers: "Users",
  maxAgents: "AI agents",
  maxMonthlyMinutes: "Voice minutes this month",
  maxCampaigns: "Campaigns",
  maxConnectors: "Connectors",
};

export function WorkspacePlan() {
  const [data, setData] = useState<TenantUsageFoundationDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    const result = await api.usageFoundation();
    if (result.ok) setData(result.data);
    else setError(result.error.message);
  };

  useEffect(() => { void load(); }, []);

  if (error) return <div className="p-8"><div className="rounded-xl border border-amber-300/30 bg-amber-50 p-5 text-sm text-amber-900">{error}</div></div>;
  if (!data) return <div className="grid min-h-[50vh] place-items-center text-black/40"><Loader2 className="animate-spin" /></div>;

  const cards = [
    { label: "Voice usage", value: `${data.usage.voice.minutes} min`, note: `${data.usage.voice.audioSeconds} persisted audio seconds`, icon: Timer },
    { label: "Sessions", value: data.usage.sessions.total, note: `${data.usage.sessions.completed} completed · ${data.usage.sessions.failed} failed`, icon: Bot },
    { label: "Calls", value: data.usage.calls.total, note: `${data.usage.calls.inbound} inbound · ${data.usage.calls.outbound} outbound`, icon: PhoneCall },
    { label: "Campaign usage", value: data.usage.campaigns.total, note: `${data.usage.campaigns.processedContacts} contacts processed`, icon: Megaphone },
  ];

  return <div className="space-y-6 p-6 lg:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/35">Usage, limits & billing</p><h1 className="mt-1 font-display text-2xl font-bold">Plan foundation</h1><p className="mt-1 text-sm text-black/45">Persisted tenant usage and limits enforced by the backend.</p></div>
      <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-hair bg-white px-3 py-2 text-xs font-semibold text-black/55"><RefreshCw size={13} /> Refresh</button>
    </div>

    <section className="grid gap-4 lg:grid-cols-3">
      <article className="rounded-2xl border border-hair bg-white p-5 lg:col-span-2"><p className="text-[10px] font-bold uppercase tracking-widest text-black/35">Current plan</p>{data.subscription ? <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-3xl font-bold">{data.subscription.planName}</h2><p className="mt-1 text-sm capitalize text-black/45">Subscription {data.subscription.status}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Backend enforced</span></div> : <div className="mt-3"><h2 className="font-display text-xl font-bold text-amber-800">Not configured</h2><p className="mt-1 text-sm text-black/50">Capabilities and limits fail closed until a platform administrator assigns a subscription.</p></div>}</article>
      <article className="rounded-2xl border border-hair bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-widest text-black/35">Billing provider</p><h2 className="mt-3 font-display text-xl font-bold">{data.billing.status.replace("_", " ")}</h2><p className="mt-1 text-sm text-black/45">Invoice generation and payment processing are unavailable. No fake financial records are shown.</p></article>
    </section>

    <section>
      <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-display text-lg font-bold">Actual usage</h2><p className="mt-1 text-xs text-black/40">UTC · {new Date(data.period.start).toLocaleDateString()}–{new Date(data.period.end).toLocaleDateString()}</p></div></div>
      {data.empty ? <div className="mt-3 rounded-2xl border border-dashed border-black/15 bg-white p-8 text-center text-sm text-black/45">No persisted voice, session, call, or campaign usage exists for this period.</div> : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, note, icon: Icon }) => <article key={label} className="rounded-2xl border border-hair bg-white p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-black/[0.045] text-black/50"><Icon size={15} /></span><p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-black/35">{label}</p><p className="mt-1 font-display text-2xl font-bold">{value}</p><p className="mt-1 text-[11px] text-black/40">{note}</p></article>)}</div>
    </section>

    <section><h2 className="font-display text-lg font-bold">Usage limits</h2><p className="mt-1 text-xs text-black/40">Current authoritative counts are read by the backend before every limited create operation.</p><div className="mt-3 overflow-hidden rounded-2xl border border-hair bg-white">{Object.values(data.limits).map((state) => {
      const percent = state.limit > 0 ? Math.min(100, Math.round((state.used / state.limit) * 100)) : 100;
      return <div key={state.key} className="grid gap-3 border-b border-hair p-4 last:border-0 sm:grid-cols-[1fr_2fr_auto] sm:items-center"><div className="flex items-center gap-2 text-sm font-medium"><Gauge size={15} className="text-black/35" />{LIMIT_LABELS[state.key]}</div><div className="h-2 overflow-hidden rounded-full bg-black/[0.05]"><div className={`h-full rounded-full ${state.reached ? "bg-red-500" : "bg-black/70"}`} style={{ width: `${percent}%` }} /></div><p className="numeral min-w-24 text-right text-xs text-black/50"><strong className="text-black">{state.used}</strong> / {state.limit}</p></div>;
    })}</div></section>

    <section><h2 className="font-display text-lg font-bold">Effective entitlements</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.entitlements.map((capability) => <article key={capability.feature} className="flex items-center gap-3 rounded-2xl border border-hair bg-white p-4"><span className={`grid h-9 w-9 place-items-center rounded-full ${capability.enabled ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{capability.enabled ? <Check size={16} /> : <Ban size={16} />}</span><div><p className="text-sm font-semibold capitalize">{capability.feature.replace(/_/g, " ")}</p><p className="text-[11px] text-black/35">{capability.enabled ? "Available" : "Unavailable"} · {capability.source}</p></div></article>)}</div></section>
  </div>;
}
