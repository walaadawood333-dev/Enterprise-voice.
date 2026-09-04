import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CircleCheck, Info, Loader2, RefreshCw, Users } from "lucide-react";
import { API_BASE_URL, api } from "@/api";
import { useAuth } from "@/hooks/useAuth";
import { DemoBadge, Labeled, Panel, PanelHeader, StatusChip, fieldClass } from "../components/primitives";
import { useStudio } from "../StudioProvider";
import { getVoiceMode } from "@/api";
import { DEMO_AGENTS } from "../data/demoWorkspace";
import { cn } from "@/utils/cn";
import { TenantBrandingSettings } from "@/branding/TenantBrandingSettings";

const ROLE_ROWS: Array<[string, string, string]> = [
  ["Owner", "Full workspace control, billing and integrations", "foundation"],
  ["Admin", "Agents, campaigns, integrations and members", "foundation"],
  ["Manager", "Publish agents and review every session", "foundation"],
  ["Agent Operator", "Live sessions and handover queues only", "foundation"],
  ["Viewer", "Read-only reporting", "enforced"],
];

export function SettingsPage() {
  const { origin, originNote, pushToast, resetWorkspace, demoNotice } = useStudio();
  const { session, signOut } = useAuth();
  const mode = getVoiceMode();
  const [org, setOrg] = useState({ name: "", slug: "", status: "trial" });
  const [savingOrg, setSavingOrg] = useState(false);

  useEffect(() => {
    if (session?.organization) {
      setOrg({
        name: session.organization.name,
        slug: session.organization.slug,
        status: session.organization.status,
      });
    }
  }, [session]);

  const rows = [
    ["Data source", origin === "live" ? "CenterAI API" : "Demo workspace (in-browser)", origin === "live"],
    ["Origin note", originNote, false],
    ["Voice engine", mode.state === "connected" && mode.mode === "production" ? "Realtime (WebRTC)" : "Demo Mode", mode.mode === "production"],
    ["Voice engine message", mode.message, false],
    ["API base URL", mode.transport === "http" ? "configured" : "not set — handlers run locally", mode.transport === "http"],
    ["Database", origin === "live" ? "repository behind the API" : "in-memory (nothing persisted)", false],
    [
      "Agents available",
      `${DEMO_AGENTS.length} seeded (en, ar, jo variants) + ${origin === "live" ? "API rows" : "workspace drafts"}`,
      false,
    ],
  ] as const;

  return (
    <div className="space-y-4 sm:space-y-5">
      <Panel as="section" className="space-y-5">
        <PanelHeader
          eyebrow="Organization"
          title="Workspace identity"
          aside={<DemoBadge live={origin === "live"} />}
        />
        <div className="grid gap-5 sm:grid-cols-3">
          <Labeled htmlFor="org-name" label="Workspace name">
            <input
              id="org-name"
              value={org.name}
              onChange={(event) => setOrg((prev) => ({ ...prev, name: event.target.value }))}
              className={fieldClass}
            />
          </Labeled>
          <Labeled htmlFor="org-slug" label="Slug" hint="used in URLs and tenant keys">
            <input
              id="org-slug"
              value={org.slug}
              onChange={(event) =>
                setOrg((prev) => ({
                  ...prev,
                  slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                }))
              }
              className={cn(fieldClass, "numeral")}
            />
          </Labeled>
          <Labeled htmlFor="org-status" label="Status">
            <select
              id="org-status"
              value={org.status}
              onChange={(event) => setOrg((prev) => ({ ...prev, status: event.target.value }))}
              className={cn(fieldClass, "cursor-pointer appearance-none")}
            >
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </Labeled>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={savingOrg}
            onClick={async () => {
              if (!API_BASE_URL) {
                pushToast(
                  "No API is configured, so this rename is held in the browser only. Set VITE_API_BASE_URL to persist it.",
                  "info"
                );
                return;
              }
              setSavingOrg(true);
              const result = await api.updateOrganization({ name: org.name });
              setSavingOrg(false);
              pushToast(
                result.ok
                  ? "Workspace name updated through the API, scoped to your organization."
                  : `${result.error.message} — production authentication is required for writes.`,
                result.ok ? "success" : "warn"
              );
            }}
            className="btn-primary inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-display text-sm font-semibold text-white disabled:opacity-60"
          >
            {savingOrg ? <Loader2 size={14} className="animate-spin" /> : <CircleCheck size={14} />}
            Save changes
          </button>
          {session ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="cursor-pointer rounded-full border border-hair bg-white px-5 py-2.5 font-display text-sm font-semibold text-black/60 transition-colors hover:border-black/30 hover:text-black"
            >
              Sign out
            </button>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-white px-5 py-2.5 font-display text-sm font-semibold text-black/60 transition-colors hover:border-black/30 hover:text-black"
            >
              Sign in
            </Link>
          )}
          <p className="text-[11.5px] leading-relaxed text-black/40">
            {session
              ? `Signed in as ${session.email} · ${session.role} · ${
                  session.identitySource === "jwt"
                    ? "verified by the API"
                    : "local demo identity, session memory only"
                }`
              : demoNotice}
          </p>
        </div>
      </Panel>

      <TenantBrandingSettings />

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <Panel as="article" className="space-y-4">
          <PanelHeader
            eyebrow="Access model"
            title="Roles"
            aside={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-mist px-2.5 py-1 font-display text-[10px] font-bold tracking-[0.14em] text-black/50 uppercase">
                <Users size={11} />
                no sign-in yet
              </span>
            }
          />
          <ul className="divide-y divide-hair overflow-hidden rounded-2xl border border-hair">
            {ROLE_ROWS.map(([role, scope, state]) => (
              <li key={role} className="flex flex-wrap items-center gap-3 bg-white px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[13.5px] font-bold">{role}</span>
                  <span className="block text-[12px] text-black/45">{scope}</span>
                </span>
                <StatusChip
                  status={state === "enforced" ? "completed" : "draft"}
                  label={state === "enforced" ? "Scoped reads" : "Foundation"}
                />
              </li>
            ))}
          </ul>
          <p className="text-[11.5px] leading-relaxed text-black/45">
            The five roles exist in the data model and the authorization helper, and{" "}
            <span className="font-semibold text-black/65">production authentication is not implemented</span>:
            this build answers as the seeded demo tenant unless a bearer secret is configured server-side.
          </p>
        </Panel>

        <Panel as="article" className="space-y-4">
          <PanelHeader eyebrow="Environment" title="What this workspace is connected to" />
          <dl className="divide-y divide-hair overflow-hidden rounded-2xl border border-hair">
            {rows.map(([label, value, positive]) => (
              <div key={label} className="flex flex-wrap items-baseline justify-between gap-3 bg-white px-4 py-3">
                <dt className="font-display text-[10px] font-bold tracking-[0.16em] text-black/45 uppercase">
                  {label}
                </dt>
                <dd
                  className={cn(
                    "max-w-full text-[12.5px] font-medium",
                    positive ? "text-black" : "text-black/55"
                  )}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-black/45">
            <Info size={13} className="mt-0.5 shrink-0 text-black/35" />
            Flipping to live data is a deployment task, not a UI change: set{" "}
            <span className="numeral font-semibold text-black/65">VITE_API_BASE_URL</span> for the client and
            the matching server environment for the API.
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <Panel as="article" className="space-y-3.5">
          <PanelHeader eyebrow="Data & retention" title="Handling defaults in this build" />
          <ul className="space-y-2.5 text-[13px] leading-relaxed text-black/60">
            {[
              ["Microphone audio", "streamed for a live session only; never written to disk or object storage here"],
              ["Transcripts", "kept in memory / the demo table; retention windows are contractual, not enforced in code yet"],
              ["Usage events", "counts and durations only — no recording, no call detail records"],
              ["Deletion", "not implemented; the reset control below clears this browser session"],
            ].map(([title, body]) => (
              <li key={title} className="rounded-2xl border border-hair bg-mist/50 px-4 py-3">
                <span className="font-display block text-[13px] font-bold text-black/75">{title}</span>
                <span className="block text-[12.5px] text-black/50">{body}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel as="article" className="flex flex-col justify-between gap-5">
          <div className="space-y-3.5">
            <PanelHeader eyebrow="Workspace controls" title="Housekeeping" />
            <p className="text-[13px] leading-relaxed text-black/55">
              Reset returns agents, sessions, campaigns and integration requests to the seeded demo state.
              It affects this browser only and cannot touch a real tenant.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={resetWorkspace}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-hair bg-white px-4 py-2 font-display text-[13px] font-semibold text-black/70 transition-colors hover:border-black/30 hover:text-black"
            >
              <RefreshCw size={13} />
              Reset demo workspace
            </button>
            <Link
              to="/"
              className="group inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 font-display text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Public site
              <ArrowUpRight size={13} className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
