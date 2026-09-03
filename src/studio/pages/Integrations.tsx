import { useEffect, useMemo, useState } from "react";
import {
  Cable,
  CheckCircle2,
  KeyRound,
  Loader2,
  Play,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import type {
  ConnectorControlDto,
  ConnectorProviderControlDto,
  ConnectorTestResult,
  ControlCenterStatus,
  TenantConnectorControlCenterDto,
} from "../../../shared/contracts";
import { api } from "@/api";
import { Panel, PanelHeader } from "../components/primitives";

const statusTone: Record<ControlCenterStatus, string> = {
  CONNECTED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  NOT_CONFIGURED: "border-amber-200 bg-amber-50 text-amber-700",
  DEGRADED: "border-orange-200 bg-orange-50 text-orange-700",
  UNAVAILABLE: "border-red-200 bg-red-50 text-red-700",
  UNKNOWN: "border-black/10 bg-black/[0.035] text-black/50",
};

function Status({ value }: { value: ControlCenterStatus }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 font-display text-[10px] font-bold tracking-wide ${statusTone[value]}`}>
      {value.replace("_", " ")}
    </span>
  );
}

export function IntegrationsPage() {
  const [data, setData] = useState<TenantConnectorControlCenterDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newProvider, setNewProvider] = useState("");
  const [credentialConnector, setCredentialConnector] = useState<ConnectorControlDto | null>(null);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [lastTest, setLastTest] = useState<{ connectorId: string; result: ConnectorTestResult } | null>(null);

  const load = async () => {
    setError(null);
    const result = await api.connectorControlCenter();
    if (!result.ok) return setError(result.error.message);
    setData(result.data);
    setNewProvider((current) => current || result.data.providers[0]?.id || "");
  };

  useEffect(() => {
    void load();
  }, []);

  const providerById = useMemo(
    () => new Map(data?.providers.map((provider) => [provider.id, provider]) ?? []),
    [data]
  );

  const create = async () => {
    if (!newName.trim() || !newProvider) return;
    setBusy("create");
    setError(null);
    const result = await api.createConnector({ name: newName.trim(), provider: newProvider });
    if (!result.ok) setError(result.error.message);
    else {
      setNewName("");
      await load();
    }
    setBusy(null);
  };

  const updateEnabled = async (connector: ConnectorControlDto) => {
    setBusy(connector.id);
    setError(null);
    const result = await api.updateConnector(connector.id, { enabled: !connector.enabled });
    if (!result.ok) setError(result.error.message);
    await load();
    setBusy(null);
  };

  const test = async (connector: ConnectorControlDto) => {
    setBusy(`test:${connector.id}`);
    setError(null);
    const result = await api.testConnector(connector.id);
    if (!result.ok) setError(result.error.message);
    else setLastTest({ connectorId: connector.id, result: result.data });
    await load();
    setBusy(null);
  };

  const saveCredentials = async () => {
    if (!credentialConnector) return;
    setBusy(`credentials:${credentialConnector.id}`);
    setError(null);
    const result = await api.configureConnectorCredentials(credentialConnector.id, credentialValues);
    // Secret-bearing input is cleared immediately after the request and is never rehydrated.
    setCredentialValues({});
    if (!result.ok) setError(result.error.message);
    else setCredentialConnector(null);
    await load();
    setBusy(null);
  };

  const openCredentials = (connector: ConnectorControlDto) => {
    setCredentialValues({});
    setCredentialConnector(connector);
  };

  return (
    <div className="space-y-5">
      <Panel as="section" className="space-y-4">
        <PanelHeader
          eyebrow="Tenant connector control center"
          title="Providers registered by the backend"
          aside={
            <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 text-xs text-black/45 hover:text-black">
              <RefreshCw size={13} /> Refresh
            </button>
          }
        />
        <p className="max-w-3xl text-[13px] leading-relaxed text-black/50">
          This catalog is generated from the live connector registry. Platform telephony providers are managed
          separately by platform administrators and are never configured from a tenant workspace.
        </p>
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {!data ? (
          <div className="flex items-center gap-2 py-8 text-sm text-black/45"><Loader2 size={15} className="animate-spin" /> Loading registry…</div>
        ) : data.providers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/15 p-6 text-sm text-black/45">No connector adapters are registered.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.providers.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))}
          </div>
        )}
      </Panel>

      {data ? (
        <Panel as="section" className="space-y-4">
          <PanelHeader eyebrow="Connections" title="Tenant-owned connectors" />
          <div className="grid gap-2 sm:grid-cols-[1fr_220px_auto]">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Connection name"
              maxLength={80}
              className="rounded-xl border border-hair bg-white px-3.5 py-2.5 text-sm outline-none focus:border-black/30"
            />
            <select
              value={newProvider}
              onChange={(event) => setNewProvider(event.target.value)}
              className="rounded-xl border border-hair bg-white px-3.5 py-2.5 text-sm outline-none"
            >
              {data.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
            </select>
            <button
              type="button"
              disabled={!newName.trim() || !newProvider || busy === "create"}
              onClick={() => void create()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-35"
            >
              {busy === "create" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
            </button>
          </div>

          {data.credentialStorage === "SESSION_ONLY" ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              Demo mode uses session-only server memory for credentials. Values disappear when this runtime restarts.
            </p>
          ) : data.credentialStorage === "UNAVAILABLE" ? (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">
              Credential provisioning is unavailable until an encrypted production credential store is connected.
            </p>
          ) : (
            <p className="inline-flex items-center gap-2 text-xs text-emerald-700"><ShieldCheck size={14} /> Encrypted external credential storage is available.</p>
          )}

          {data.connectors.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/15 p-8 text-center text-sm text-black/45">
              No tenant connectors are configured yet.
            </div>
          ) : (
            <div className="space-y-3">
              {data.connectors.map((connector) => {
                const provider = providerById.get(connector.provider);
                const result = lastTest?.connectorId === connector.id ? lastTest.result : null;
                return (
                  <article key={connector.id} className="rounded-2xl border border-hair bg-white p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-black/[0.045] text-black/55"><Cable size={17} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-[15px] font-bold">{connector.name}</h3>
                          <Status value={connector.status} />
                        </div>
                        <p className="mt-1 text-xs text-black/45">
                          {connector.providerName} · {connector.type.replace(/_/g, " ")} · credentials {connector.hasCredentials ? "configured" : "not configured"}
                        </p>
                        {result ? (
                          <p className={`mt-2 text-xs ${result.success ? "text-emerald-700" : "text-red-700"}`}>
                            {result.message} · {result.latencyMs} ms
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={data.credentialStorage === "UNAVAILABLE"}
                          onClick={() => openCredentials(connector)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-hair px-3 py-2 text-xs font-semibold text-black/60 disabled:opacity-35"
                        ><KeyRound size={13} /> {connector.hasCredentials ? "Replace credentials" : "Configure"}</button>
                        <button
                          type="button"
                          disabled={!provider?.capabilities.connectionTesting || busy === `test:${connector.id}`}
                          onClick={() => void test(connector)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-hair px-3 py-2 text-xs font-semibold text-black/60 disabled:opacity-35"
                        >{busy === `test:${connector.id}` ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Test</button>
                        <button
                          type="button"
                          disabled={busy === connector.id}
                          onClick={() => void updateEnabled(connector)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-35"
                        >{busy === connector.id ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />} {connector.enabled ? "Disable" : "Enable"}</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
      ) : null}

      {credentialConnector && data ? (
        <CredentialDialog
          connector={credentialConnector}
          provider={providerById.get(credentialConnector.provider)}
          values={credentialValues}
          onChange={(key, value) => setCredentialValues((current) => ({ ...current, [key]: value }))}
          onClose={() => { setCredentialValues({}); setCredentialConnector(null); }}
          onSave={() => void saveCredentials()}
          busy={busy === `credentials:${credentialConnector.id}`}
        />
      ) : null}
    </div>
  );
}

function ProviderCard({ provider }: { provider: ConnectorProviderControlDto }) {
  const capabilities = Object.entries(provider.capabilities).filter(([, enabled]) => enabled).map(([name]) => name);
  return (
    <article className="rounded-2xl border border-hair bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-black/[0.045] text-black/55"><Cable size={17} /></span>
        <Status value={provider.status} />
      </div>
      <h3 className="mt-3 font-display text-[15px] font-bold">{provider.name}</h3>
      <p className="mt-1 min-h-10 text-xs leading-relaxed text-black/45">{provider.description}</p>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-black/35">Registered adapter · v{provider.version}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {capabilities.map((capability) => <span key={capability} className="rounded-full bg-black/[0.04] px-2 py-1 text-[10px] text-black/50">{capability}</span>)}
      </div>
    </article>
  );
}

function CredentialDialog({
  connector,
  provider,
  values,
  onChange,
  onClose,
  onSave,
  busy,
}: {
  connector: ConnectorControlDto;
  provider?: ConnectorProviderControlDto;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClose: () => void;
  onSave: () => void;
  busy: boolean;
}) {
  const valid = provider?.credentialFields.every((field) => !field.required || Boolean(values[field.key]?.trim())) ?? false;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Configure connector credentials">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-black/35">Server-only credentials</p><h2 className="mt-1 font-display text-xl font-bold">{connector.name}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-black/40 hover:bg-black/5"><X size={16} /></button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-black/50">
          Existing values are never returned. Saving replaces the credential set, and fields are cleared from this form immediately after submission.
        </p>
        <div className="mt-4 space-y-3">
          {provider?.credentialFields.map((field) => (
            <label key={field.key} className="block text-xs font-semibold text-black/60">
              {field.label}{field.required ? " *" : ""}
              <input
                type={field.input === "secret" ? "password" : field.input}
                autoComplete="off"
                value={values[field.key] ?? ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                className="mt-1.5 block w-full rounded-xl border border-hair px-3.5 py-2.5 text-sm font-normal outline-none focus:border-black/30"
              />
              {field.description ? <span className="mt-1 block text-[10px] font-normal text-black/35">{field.description}</span> : null}
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-hair px-4 py-2.5 text-sm font-semibold">Cancel</button>
          <button type="button" disabled={!valid || busy} onClick={onSave} className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-35">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Save securely
          </button>
        </div>
      </div>
    </div>
  );
}
