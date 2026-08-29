import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Banknote, Cable, KeyRound, Landmark, ShieldCheck } from "lucide-react";
import { DemoBadge, Panel, PanelHeader, StatusChip } from "../components/primitives";
import { useStudio } from "../StudioProvider";
import { cn } from "@/utils/cn";

const CATEGORIES = [
  { key: "Telephony", label: "Telephony", icon: Cable, hint: "Numbers, trunks and call routing" },
  { key: "CRM", label: "CRM", icon: Landmark, hint: "Case, contact and activity write-back" },
  { key: "Payments", label: "Payments", icon: Banknote, hint: "Host and gateway interactions" },
  { key: "Jordan Fintech", label: "Jordan Fintech", icon: ShieldCheck, hint: "Local rails under discussion" },
] as const;

export function IntegrationsPage() {
  const { integrations, requested, requestIntegration, origin } = useStudio();

  const grouped = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        ...category,
        rows: integrations.filter((item) => item.category === category.key),
      })),
    [integrations]
  );

  const connected = integrations.filter((item) => item.status === "configured").length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <Panel dark as="section" className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2.5">
            <Cable size={15} className="text-white/50" />
            <p className="font-display text-[10px] font-bold tracking-[0.2em] text-white/45 uppercase">
              Integration status
            </p>
          </div>
          <h2 className="mt-3.5 text-[1.7rem] leading-tight font-medium sm:text-[2rem]">
            {connected === 0 ? "Nothing is connected yet — by design" : `${connected} connected`}
          </h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-white/55">
            This page reports real connection state only. A row never shows as active because it was
            requested, and no credential is entered, stored or echoed anywhere in the browser.
          </p>
        </div>
        <div className="rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3.5 text-[12px] text-white/55">
          <p className="font-display text-[10px] font-bold tracking-[0.16em] text-white/40 uppercase">
            Workspace
          </p>
          <p className="mt-1.5 text-[15px] font-semibold text-white/80">
            {integrations.length} integration slots
          </p>
          <p className="mt-1 text-[11px]">{requested.length} requested locally in this session</p>
        </div>
      </Panel>

      {grouped.map((group) => (
        <Panel key={group.key} as="section" className="space-y-4">
          <PanelHeader
            eyebrow={group.hint}
            title={group.label}
            aside={<DemoBadge live={origin === "live"} note="Connector state comes from the server; nothing here is inferred." />}
          />
          <ul className="divide-y divide-hair overflow-hidden rounded-2xl border border-hair">
            {group.rows.map((item) => {
              const isRequested = requested.includes(item.id);
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2.5 bg-white px-4 py-3.5 transition-colors duration-300 hover:bg-mist/60"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/[0.05] text-black/55">
                    <group.icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[14.5px] font-bold tracking-tight">
                      {item.name}
                    </span>
                    <span className="block text-[12px] leading-snug text-black/45">{item.note}</span>
                  </span>
                  <StatusChip
                    status={isRequested && item.status === "not_connected" ? "coming_soon" : item.status}
                    label={
                      isRequested && item.status === "not_connected"
                        ? "Requested"
                        : item.status === "not_connected"
                          ? "Not connected"
                          : item.status === "coming_soon"
                            ? "Coming soon"
                            : "Configured"
                    }
                  />
                  <button
                    type="button"
                    onClick={() => requestIntegration(item.id)}
                    disabled={item.status === "configured"}
                    className={cn(
                      "shrink-0 rounded-full border px-3.5 py-1.5 font-display text-[11.5px] font-semibold transition-colors",
                      item.status === "configured"
                        ? "cursor-not-allowed border-hair text-black/30"
                        : "cursor-pointer border-hair bg-white text-black/60 hover:border-black/25 hover:bg-mist hover:text-black"
                    )}
                  >
                    {item.status === "configured" ? "Active" : "Request access"}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      ))}

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <Panel as="article" className="space-y-3.5">
          <PanelHeader eyebrow="Credential handling" title="Where a key goes — and where it never goes" />
          <div className="rounded-2xl border border-hair bg-mist/60 p-4">
            <p className="mb-2 flex items-center gap-2 font-display text-[10px] font-bold tracking-[0.16em] text-black/45 uppercase">
              <KeyRound size={12} />
              Server environment only
            </p>
            <pre className="overflow-x-auto font-mono text-[11.5px] leading-relaxed text-black/65">
{`# .env (never committed, never bundled)
OPENAI_API_KEY=…          # realtime voice
DATABASE_URL=…            # repositories
JWT_SECRET=…              # tokens, server-side
STORAGE_BUCKET_NAME=…     # transcript objects
CRM_API_KEY=…             # write-back (not implemented)`}
            </pre>
          </div>
          <ul className="space-y-2 text-[12.5px] leading-relaxed text-black/55">
            {[
              "The browser receives a short-lived session credential, never a provider key.",
              "There is no key field on this page on purpose — pasting a secret into a client is how they leak.",
              "Requests made here stay in this browser session; nothing is written to a connector.",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-black" />
                {line}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel as="article" className="flex flex-col justify-between gap-5">
          <div className="space-y-3.5">
            <PanelHeader eyebrow="Jordan fintech" title="Rails we intend to speak to" />
            <p className="text-[13px] leading-relaxed text-black/55">
              ZainCash, Orange Money, UWallet and CliQ are named as engineering targets for wallet and
              instant-payment flows. They are not certified integrations, not marketplace listings, and no
              transaction can be initiated from this workspace.
            </p>
            <ul className="flex flex-wrap gap-2">
              {["ZainCash", "Orange Money", "UWallet", "CliQ"].map((rail) => (
                <li
                  key={rail}
                  className="rounded-full border border-dashed border-black/20 bg-white px-3.5 py-1.5 font-display text-[12px] font-semibold text-black/55"
                >
                  {rail}
                  <span className="ms-2 text-[10px] tracking-[0.14em] text-black/35 uppercase">
                    not connected
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <Link
            to="/studio/settings"
            className="group inline-flex items-center gap-1.5 self-start rounded-full border border-hair bg-white px-4 py-2 font-display text-[13px] font-semibold text-black/65 transition-colors hover:border-black/25 hover:text-black"
          >
            Configure the environment
            <ArrowUpRight
              size={13}
              className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </Link>
        </Panel>
      </div>
    </div>
  );
}
