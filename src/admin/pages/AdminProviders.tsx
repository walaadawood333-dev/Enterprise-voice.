import { apiFetch } from "@/api";
import { useEffect, useState } from "react";
import { Cable, Loader2, Phone, Power, RefreshCw, ShieldCheck, TestTube2 } from "lucide-react";
import type {
  ConnectorProviderControlDto,
  ControlCenterStatus,
  PlatformProviderControlCenterDto,
  ProviderHealthControlResultDto,
  TelephonyProviderControlDto,
} from "../../../shared/contracts";

const tones: Record<ControlCenterStatus, string> = {
  CONNECTED: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  NOT_CONFIGURED: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  DEGRADED: "border-orange-400/25 bg-orange-400/10 text-orange-200",
  UNAVAILABLE: "border-red-400/25 bg-red-400/10 text-red-200",
  UNKNOWN: "border-white/10 bg-white/[0.04] text-white/45",
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

function Status({ value }: { value: ControlCenterStatus }) {
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide ${tones[value]}`}>{value.replace("_", " ")}</span>;
}

export function AdminProviders() {
  const [data, setData] = useState<PlatformProviderControlCenterDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastProbe, setLastProbe] = useState<ProviderHealthControlResultDto | null>(null);

  const load = async () => {
    setError(null);
    try { setData(await request<PlatformProviderControlCenterDto>("/api/admin/providers")); }
    catch (reason) { setError((reason as Error).message); }
  };

  useEffect(() => { void load(); }, []);

  const probe = async (provider: TelephonyProviderControlDto) => {
    setBusy(`test:${provider.id}`);
    setError(null);
    try {
      setLastProbe(await request<ProviderHealthControlResultDto>(`/api/admin/providers/${encodeURIComponent(provider.id)}/test`, { method: "POST", body: "{}" }));
      await load();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(null); }
  };

  const toggle = async (provider: TelephonyProviderControlDto) => {
    setBusy(provider.id);
    setError(null);
    try {
      await request(`/api/admin/providers/${encodeURIComponent(provider.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !provider.enabled }),
      });
      await load();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-7 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/40">Platform control plane</p>
          <h2 className="mt-1 text-2xl font-bold">Providers & connectors</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/40">
            Runtime registry state only. No marketplace placeholders, credential values, or tenant-owned secrets are exposed here.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5"><RefreshCw size={13} /> Refresh registry</button>
      </div>

      {error ? <p className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p> : null}
      {!data ? <p className="flex items-center gap-2 py-12 text-sm text-white/40"><Loader2 size={15} className="animate-spin" /> Loading provider registry…</p> : (
        <>
          <section className="space-y-3">
            <div><p className="text-[10px] uppercase tracking-widest text-white/30">Platform-scoped</p><h3 className="mt-1 text-lg font-semibold">Telephony providers</h3></div>
            {data.telephonyProviders.length === 0 ? <Empty label="No telephony providers are registered." /> : (
              <div className="grid gap-3 lg:grid-cols-2">
                {data.telephonyProviders.map((provider) => (
                  <article key={provider.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-5">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/[0.06] text-white/60"><Phone size={17} /></span>
                      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{provider.name}</h4><Status value={provider.status} /></div><p className="mt-1 text-xs text-white/35">{provider.transport} · {provider.simulation ? "simulation adapter" : "production adapter"}{provider.isDefault ? " · default" : ""}</p></div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-white/45">
                      <span>Credentials: {provider.credentialsConfigured ? "configured" : "not configured"}</span>
                      <span>Webhook: {provider.webhookConfigured ? "configured" : "not configured"}</span>
                      <span>Inbound: {provider.capabilities.inbound ? "yes" : "no"}</span>
                      <span>Outbound: {provider.capabilities.outbound ? "yes" : "no"}</span>
                    </div>
                    {lastProbe?.providerId === provider.id ? <p className="mt-3 text-xs text-white/45">Latest probe: {lastProbe.status} · {lastProbe.latencyMs} ms</p> : null}
                    <div className="mt-4 flex gap-2">
                      <button type="button" disabled={busy === `test:${provider.id}`} onClick={() => void probe(provider)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 disabled:opacity-35">{busy === `test:${provider.id}` ? <Loader2 size={13} className="animate-spin" /> : <TestTube2 size={13} />} Run availability probe</button>
                      <button type="button" disabled={busy === provider.id} onClick={() => void toggle(provider)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 disabled:opacity-35">{busy === provider.id ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />} {provider.enabled ? "Disable" : "Enable"}</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div><p className="text-[10px] uppercase tracking-widest text-white/30">Registered adapters</p><h3 className="mt-1 text-lg font-semibold">Connector providers</h3><p className="mt-1 text-xs text-white/35">Connection state is tenant-specific, so a platform adapter remains UNKNOWN until evaluated in a tenant connection.</p></div>
            {data.connectorProviders.length === 0 ? <Empty label="No connector providers are registered." /> : (
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {data.connectorProviders.map((provider) => <ConnectorProviderCard key={provider.id} provider={provider} />)}
              </div>
            )}
          </section>

          <p className="flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-white/30"><ShieldCheck size={13} /> Generated {new Date(data.generatedAt).toLocaleString()} · lifecycle operations are audited without secrets.</p>
        </>
      )}
    </div>
  );
}

function ConnectorProviderCard({ provider }: { provider: ConnectorProviderControlDto }) {
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.025] p-5">
      <div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-white/[0.06] text-white/60"><Cable size={17} /></span><Status value={provider.status} /></div>
      <h4 className="mt-3 font-semibold">{provider.name}</h4>
      <p className="mt-1 text-xs leading-relaxed text-white/35">{provider.description}</p>
      <p className="mt-3 text-[10px] uppercase tracking-widest text-white/25">{provider.type.replace(/_/g, " ")} · adapter v{provider.version}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">{Object.entries(provider.capabilities).filter(([, enabled]) => enabled).map(([capability]) => <span key={capability} className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] text-white/40">{capability}</span>)}</div>
    </article>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-white/35">{label}</div>;
}
