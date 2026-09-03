import { useEffect, useState } from "react";
import { Building2, Loader2, Megaphone, PhoneCall, RefreshCw, Timer } from "lucide-react";
import type { PlatformUsageFoundationDto } from "../../../shared/contracts";

async function request<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "include", headers: { "content-type": "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}

export function AdminUsage() {
  const [data, setData] = useState<PlatformUsageFoundationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try { setData(await request<PlatformUsageFoundationDto>("/api/admin/usage")); }
    catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  return <div className="space-y-7 p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-white/40">Platform control plane</p><h2 className="mt-1 text-2xl font-bold">Usage & billing foundation</h2><p className="mt-1 text-sm text-white/40">Aggregate persisted usage across authorized organizations. Financial processing remains explicit and fail-closed.</p></div><button type="button" disabled={loading} onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 disabled:opacity-35"><RefreshCw size={13} /> Refresh</button></div>

    {error ? <p className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p> : null}
    {loading && !data ? <p className="flex items-center gap-2 py-12 text-sm text-white/40"><Loader2 size={15} className="animate-spin" /> Loading persisted usage…</p> : null}
    {data ? <>
      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-xs text-white/45"><span className="font-semibold text-white/70">Billing: {data.billing.status}</span><span className="mx-2 text-white/15">|</span>No invoice generation or payment processing provider is connected.</div>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Timer} label="Voice usage" value={`${data.totals.voice.minutes} min`} note={`${data.totals.voice.audioSeconds} persisted seconds`} />
        <Metric icon={Building2} label="Sessions" value={data.totals.sessions.total} note={`${data.totals.sessions.completed} completed`} />
        <Metric icon={PhoneCall} label="Calls" value={data.totals.calls.total} note={`${data.totals.calls.inbound} inbound · ${data.totals.calls.outbound} outbound`} />
        <Metric icon={Megaphone} label="Campaign usage" value={data.totals.campaigns.total} note={`${data.totals.campaigns.processedContacts} contacts processed`} />
      </section>
      <p className="text-xs text-white/30">UTC period: {new Date(data.period.start).toLocaleString()} – {new Date(data.period.end).toLocaleString()}</p>
      {data.empty ? <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-white/35">No persisted platform usage exists for this period.</div> : null}
      <section className="overflow-hidden rounded-xl border border-white/10">
        <div className="grid grid-cols-[minmax(180px,1fr)_repeat(4,minmax(90px,auto))] gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/35"><span>Organization</span><span>Voice min</span><span>Sessions</span><span>Calls</span><span>Campaigns</span></div>
        {data.byOrganization.map((row) => <div key={row.organizationId} className="grid grid-cols-[minmax(180px,1fr)_repeat(4,minmax(90px,auto))] gap-3 border-b border-white/10 px-4 py-3 text-sm last:border-0"><span><strong className="block text-white/80">{row.organizationName}</strong><span className="text-[10px] text-white/25">{row.organizationId}</span></span><span className="text-white/55">{row.usage.voice.minutes}</span><span className="text-white/55">{row.usage.sessions.total}</span><span className="text-white/55">{row.usage.calls.total}</span><span className="text-white/55">{row.usage.campaigns.total}</span></div>)}
      </section>
      <p className="text-xs text-white/25">Generated {new Date(data.generatedAt).toLocaleString()}</p>
    </> : null}
  </div>;
}

function Metric({ icon: Icon, label, value, note }: { icon: typeof Timer; label: string; value: string | number; note: string }) {
  return <article className="rounded-xl border border-white/10 bg-white/[0.025] p-5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-white/[0.06] text-white/55"><Icon size={16} /></span><p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-white/30">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-white/35">{note}</p></article>;
}
