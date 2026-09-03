import { useEffect, useState } from "react";
import { Check, Image, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useTenantBranding } from "./TenantBrandingProvider";
import { Labeled, Panel, PanelHeader, fieldClass } from "@/studio/components/primitives";
import { cn } from "@/utils/cn";

export function TenantBrandingSettings() {
  const { branding, canCustomize, loading, update } = useTenantBranding();
  const [draft, setDraft] = useState({
    displayName: branding.displayName,
    logoUrl: branding.logoUrl ?? "",
    faviconUrl: branding.faviconUrl ?? "",
    primaryColor: branding.primaryColor,
    accentColor: branding.accentColor,
    theme: branding.theme,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setDraft({
      displayName: branding.displayName,
      logoUrl: branding.logoUrl ?? "",
      faviconUrl: branding.faviconUrl ?? "",
      primaryColor: branding.primaryColor,
      accentColor: branding.accentColor,
      theme: branding.theme,
    });
  }, [branding]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const result = await update({
      displayName: draft.displayName,
      logoUrl: draft.logoUrl || null,
      faviconUrl: draft.faviconUrl || null,
      primaryColor: draft.primaryColor,
      accentColor: draft.accentColor,
      theme: draft.theme,
    });
    setSaving(false);
    setMessage(result.ok
      ? { tone: "success", text: "Branding saved and applied to the authenticated tenant shell." }
      : { tone: "error", text: result.message });
  };

  const disabled = loading || saving || !canCustomize;

  return (
    <Panel as="section" className="space-y-5">
      <PanelHeader
        eyebrow="White label"
        title="Tenant branding"
        aside={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-mist px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.14em] text-black/50">
            <ShieldCheck size={11} /> Authenticated scope
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Labeled htmlFor="brand-display-name" label="Organization display name">
              <input id="brand-display-name" value={draft.displayName} disabled={disabled}
                onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
                className={fieldClass} maxLength={100} />
            </Labeled>
          </div>
          <div className="sm:col-span-2">
            <Labeled htmlFor="brand-logo-url" label="Logo HTTPS URL" hint="external reference">
              <input id="brand-logo-url" type="url" value={draft.logoUrl} disabled={disabled}
                placeholder="https://assets.example.com/logo.svg"
                onChange={(event) => setDraft((current) => ({ ...current, logoUrl: event.target.value }))}
                className={fieldClass} />
            </Labeled>
          </div>
          <div className="sm:col-span-2">
            <Labeled htmlFor="brand-favicon-url" label="Favicon HTTPS URL" hint="external reference">
              <input id="brand-favicon-url" type="url" value={draft.faviconUrl} disabled={disabled}
                placeholder="https://assets.example.com/favicon.png"
                onChange={(event) => setDraft((current) => ({ ...current, faviconUrl: event.target.value }))}
                className={fieldClass} />
            </Labeled>
          </div>
          <Labeled htmlFor="brand-primary" label="Primary color">
            <div className="flex gap-2">
              <input id="brand-primary" type="color" value={draft.primaryColor} disabled={disabled}
                onChange={(event) => setDraft((current) => ({ ...current, primaryColor: event.target.value.toUpperCase() }))}
                className="h-11 w-14 rounded-xl border border-hair bg-white p-1" />
              <input value={draft.primaryColor} readOnly className={cn(fieldClass, "numeral")} aria-label="Primary color value" />
            </div>
          </Labeled>
          <Labeled htmlFor="brand-accent" label="Accent color">
            <div className="flex gap-2">
              <input id="brand-accent" type="color" value={draft.accentColor} disabled={disabled}
                onChange={(event) => setDraft((current) => ({ ...current, accentColor: event.target.value.toUpperCase() }))}
                className="h-11 w-14 rounded-xl border border-hair bg-white p-1" />
              <input value={draft.accentColor} readOnly className={cn(fieldClass, "numeral")} aria-label="Accent color value" />
            </div>
          </Labeled>
          <div className="sm:col-span-2">
            <Labeled htmlFor="brand-theme" label="Shell theme">
              <select id="brand-theme" value={draft.theme} disabled={disabled}
                onChange={(event) => setDraft((current) => ({ ...current, theme: event.target.value as typeof current.theme }))}
                className={cn(fieldClass, "cursor-pointer appearance-none")}>
                <option value="light">Light</option><option value="dark">Dark</option><option value="auto">System</option>
              </select>
            </Labeled>
          </div>
        </div>

        <aside className="rounded-2xl border border-hair bg-mist/70 p-4">
          <p className="font-display text-[10px] font-bold uppercase tracking-[0.16em] text-black/40">Applied preview</p>
          <div className="mt-4 rounded-2xl border border-hair bg-white p-4">
            <div className="flex items-center gap-3">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="" referrerPolicy="no-referrer" className="h-10 w-10 rounded-lg object-contain" />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-lg text-white" style={{ backgroundColor: branding.primaryColor }}><Image size={16} /></span>
              )}
              <div className="min-w-0"><p className="truncate font-display text-base font-bold">{branding.displayName}</p><p className="text-[10px] text-black/40">Voice workspace</p></div>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/5"><div className="h-full w-2/3" style={{ backgroundColor: branding.accentColor }} /></div>
          </div>
        </aside>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Status title="Asset uploads" value="Not configured" detail="Use external HTTPS URLs. No production-ready file upload is claimed." />
        <Status title="Custom domain" value="Not configured" detail="DNS and certificate verification infrastructure is unavailable." />
        <Status title="Login branding" value="Not configured" detail="Pre-auth tenant discovery is unavailable; login keeps safe CenterAI fallback branding." />
      </div>

      {!canCustomize ? (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800">
          <LockKeyhole size={14} className="mt-0.5 shrink-0" /> Custom branding is not enabled for this subscription. Existing safe fallback branding remains active.
        </p>
      ) : null}
      {message ? <p role="status" className={cn("text-[12.5px]", message.tone === "success" ? "text-emerald-700" : "text-red-700")}>{message.text}</p> : null}
      <button type="button" onClick={() => void save()} disabled={disabled}
        className="btn-primary inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-display text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save branding
      </button>
    </Panel>
  );
}

function Status({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-hair bg-mist/60 p-4"><p className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-black/40">{title}</p><p className="mt-1.5 text-sm font-bold text-black/75">{value}</p><p className="mt-1 text-[11.5px] leading-relaxed text-black/45">{detail}</p></div>;
}
