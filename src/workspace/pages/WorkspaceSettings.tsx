import { useEffect, useState } from "react";
import { Building2, Loader2, Save } from "lucide-react";
import { apiFetch } from "@/api";
import { useAuth } from "@/hooks/useAuth";

interface OrganizationView { id: string; name: string; slug: string; status: string }

export function WorkspaceSettings() {
  const { session } = useAuth();
  const [organization, setOrganization] = useState<OrganizationView | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canEdit = session?.role === "owner" || session?.role === "admin";

  const load = async () => {
    const response = await apiFetch("/api/organizations");
    if (response.ok) {
      const payload = await response.json() as OrganizationView;
      setOrganization(payload);
      setName(payload.name);
    } else {
      setMessage("Organization settings could not be loaded.");
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!canEdit || name.trim().length < 2) return;
    setSaving(true);
    setMessage(null);
    const response = await apiFetch("/api/organizations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (response.ok) {
      const updated = await response.json() as OrganizationView;
      setOrganization(updated);
      setName(updated.name);
      setMessage("Organization name saved.");
    } else {
      const payload = await response.json().catch(() => null);
      setMessage(payload?.error?.message ?? "Organization update failed.");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 p-8">
      <div>
        <p className="font-display text-[10px] uppercase tracking-[0.2em] text-black/35">Tenant administration</p>
        <h2 className="mt-1 font-display text-2xl font-bold">Organization settings</h2>
      </div>
      <section className="max-w-3xl rounded-xl border border-hair bg-white p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-mist"><Building2 size={18} /></span>
          <div>
            <h3 className="font-display font-bold">Workspace identity</h3>
            <p className="text-xs text-black/45">Resolved from the authenticated user's organization.</p>
          </div>
        </div>
        {loading ? (
          <p className="mt-6 inline-flex items-center gap-2 text-sm text-black/45"><Loader2 size={14} className="animate-spin" /> Loading…</p>
        ) : organization ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-black/55">
              Organization name
              <input value={name} disabled={!canEdit} maxLength={80} onChange={(event) => setName(event.target.value)} className="mt-2 block w-full rounded-lg border border-hair px-3 py-2.5 text-sm disabled:bg-mist" />
            </label>
            <label className="text-xs font-semibold text-black/55">
              Tenant slug
              <input value={organization.slug} disabled className="mt-2 block w-full rounded-lg border border-hair bg-mist px-3 py-2.5 text-sm" />
            </label>
            <div className="text-xs text-black/50">Lifecycle: <strong>{organization.status}</strong></div>
            <div className="text-xs text-black/50">Your role: <strong>{session?.role}</strong></div>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {canEdit ? (
            <button type="button" disabled={saving || name.trim().length < 2} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
            </button>
          ) : (
            <p className="text-xs text-black/45">Only tenant owners and administrators can change workspace identity.</p>
          )}
          {message ? <p role="status" className="text-sm text-black/55">{message}</p> : null}
        </div>
      </section>
    </div>
  );
}
