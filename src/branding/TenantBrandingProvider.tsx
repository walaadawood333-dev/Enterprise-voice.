import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/api";
import { useAuth } from "@/hooks/useAuth";
import type {
  OrganizationBrandingDto,
  WorkspaceBootstrapDto,
} from "../../shared/contracts";

const SAFE_COLOR = /^#[0-9A-F]{6}$/i;

const fallback = (name: string): OrganizationBrandingDto => ({
  displayName: name || "CenterAI Workspace",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#000000",
  accentColor: "#3b82f6",
  theme: "light",
  source: "fallback",
  assetStorage: { mode: "external_url", uploads: "not_configured" },
  customDomain: { status: "not_configured", hostname: null },
  loginBranding: { status: "not_configured" },
});

type BrandingPatch = Partial<
  Pick<
    OrganizationBrandingDto,
    "displayName" | "logoUrl" | "faviconUrl" | "primaryColor" | "accentColor" | "theme"
  >
>;

interface TenantBrandingValue {
  branding: OrganizationBrandingDto;
  bootstrap: WorkspaceBootstrapDto | null;
  loading: boolean;
  error: string | null;
  canCustomize: boolean;
  refresh(): Promise<void>;
  update(patch: BrandingPatch): Promise<{ ok: true } | { ok: false; message: string }>;
}

const TenantBrandingContext = createContext<TenantBrandingValue | null>(null);

function applyDocumentBranding(branding: OrganizationBrandingDto) {
  const root = document.documentElement;
  const primary = SAFE_COLOR.test(branding.primaryColor) ? branding.primaryColor : "#000000";
  const accent = SAFE_COLOR.test(branding.accentColor) ? branding.accentColor : "#3B82F6";
  root.style.setProperty("--tenant-primary", primary);
  root.style.setProperty("--tenant-accent", accent);
  root.dataset.tenantTheme = ["light", "dark", "auto"].includes(branding.theme)
    ? branding.theme
    : "light";
  document.title = `${branding.displayName} — Voice Workspace`;

  const selector = 'link[rel="icon"][data-tenant-favicon="true"]';
  const current = document.head.querySelector<HTMLLinkElement>(selector);
  if (branding.faviconUrl) {
    const link = current ?? document.createElement("link");
    link.rel = "icon";
    link.dataset.tenantFavicon = "true";
    link.href = branding.faviconUrl;
    if (!current) document.head.appendChild(link);
  } else {
    current?.remove();
  }
}

/**
 * Loads branding only after the server-authenticated organization is available. No hostname,
 * query parameter, or client-provided organization id participates in tenant resolution.
 */
export function TenantBrandingProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const organization = session?.organization;
  const [branding, setBranding] = useState<OrganizationBrandingDto>(() =>
    fallback(organization?.name ?? "CenterAI Workspace")
  );
  const [bootstrap, setBootstrap] = useState<WorkspaceBootstrapDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!organization) {
      setBranding(fallback("CenterAI Workspace"));
      setBootstrap(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await api.workspaceBootstrap();
    if (!result.ok) {
      setBranding(fallback(organization.name));
      setBootstrap(null);
      setError(result.error.message);
      setLoading(false);
      return;
    }
    if (result.data.organization.id !== organization.id) {
      setBranding(fallback(organization.name));
      setBootstrap(null);
      setError("The authenticated organization did not match the branding response.");
      setLoading(false);
      return;
    }
    setBootstrap(result.data);
    setBranding(result.data.organization.branding);
    setError(null);
    setLoading(false);
  }, [organization?.id, organization?.name]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    applyDocumentBranding(branding);
    return () => {
      document.documentElement.style.removeProperty("--tenant-primary");
      document.documentElement.style.removeProperty("--tenant-accent");
      delete document.documentElement.dataset.tenantTheme;
      document.head.querySelector('link[rel="icon"][data-tenant-favicon="true"]')?.remove();
      document.title = "CenterAI";
    };
  }, [branding]);

  const update = useCallback(async (patch: BrandingPatch) => {
    const result = await api.updateBranding(patch);
    if (!result.ok) return { ok: false as const, message: result.error.message };
    setBranding(result.data);
    setBootstrap((current) => current
      ? { ...current, organization: { ...current.organization, branding: result.data } }
      : current);
    return { ok: true as const };
  }, []);

  const value = useMemo<TenantBrandingValue>(() => ({
    branding,
    bootstrap,
    loading,
    error,
    canCustomize: bootstrap?.entitlements.includes("custom_branding") === true,
    refresh,
    update,
  }), [branding, bootstrap, loading, error, refresh, update]);

  return (
    <TenantBrandingContext.Provider value={value}>
      {loading ? (
        <div className="grain flex min-h-dvh items-center justify-center bg-mist px-6 text-ink">
          <div className="w-full max-w-md rounded-3xl border border-hair bg-white p-7 shadow-sm">
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-black/40">
              Authenticated tenant
            </p>
            <div className="mt-4 shimmer h-8 w-2/3 rounded-full" />
            <div className="mt-3 shimmer h-3 w-1/2 rounded-full" />
            <p className="sr-only" role="status">Resolving organization branding</p>
          </div>
        </div>
      ) : children}
    </TenantBrandingContext.Provider>
  );
}

export function useTenantBranding(): TenantBrandingValue {
  const value = useContext(TenantBrandingContext);
  if (!value) throw new Error("useTenantBranding must be used inside TenantBrandingProvider");
  return value;
}
