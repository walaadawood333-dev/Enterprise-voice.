import { useMemo, useState } from "react";
import { CalendarClock, Megaphone, Plus, ShieldAlert } from "lucide-react";
import { DataTable, type Column } from "../components/DataTable";
import {
  DemoBadge,
  Labeled,
  Panel,
  PanelHeader,
  Sheet,
  StatusChip,
  fieldBadClass,
  fieldClass,
} from "../components/primitives";
import { formatDateTime, formatNumber, type StudioCampaign } from "../data/demoWorkspace";
import { useStudio } from "../StudioProvider";
import { cn } from "@/utils/cn";

const STATUS_LABEL: Record<StudioCampaign["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  completed: "Completed",
};

const PIPELINE: StudioCampaign["status"][] = ["draft", "scheduled", "active", "completed"];

interface DraftErrors {
  name?: string;
  audience?: string;
  size?: string;
  date?: string;
}

export function CampaignsPage() {
  const { campaigns, agents, createCampaign, setCampaignStatus, pushToast, origin } = useStudio();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    agentId: agents[0]?.id ?? "",
    audience: "",
    size: "",
    date: "",
  });
  const [errors, setErrors] = useState<DraftErrors>({});

  const validate = () => {
    const next: DraftErrors = {};
    if (draft.name.trim().length < 3) next.name = "Give the campaign a name (3+ characters).";
    if (draft.audience.trim().length < 3) next.audience = "Describe the audience segment.";
    const size = Number(draft.size);
    if (!Number.isFinite(size) || size < 1) next.size = "Enter an audience size of at least 1.";
    else if (size > 5_000_000) next.size = "Keep the segment under 5,000,000 contacts.";
    if (draft.date) {
      const when = new Date(draft.date).getTime();
      if (Number.isNaN(when)) next.date = "Use a valid date.";
      else if (when < Date.now() - 86_400_000) next.date = "Pick today or a future date.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    const campaign = createCampaign({
      name: draft.name,
      agentId: draft.agentId,
      audience: draft.audience,
      audienceSize: Number(draft.size),
      scheduledFor: draft.date ? new Date(draft.date).toISOString() : null,
    });
    setHighlight(campaign.id);
    setOpen(false);
    setDraft({ name: "", agentId: agents[0]?.id ?? "", audience: "", size: "", date: "" });
    setErrors({});
    pushToast(
      `“${campaign.name}” saved as ${STATUS_LABEL[campaign.status].toLowerCase()}. Dialling is disabled — no number is connected.`,
      "success"
    );
  };

  const columns = useMemo<Column<StudioCampaign>[]>(
    () => [
      {
        key: "name",
        header: "Campaign name",
        sortValue: (row) => row.name,
        render: (row) => (
          <span className="block max-w-[260px] truncate font-medium text-black/80">{row.name}</span>
        ),
      },
      {
        key: "agent",
        header: "Agent",
        sortValue: (row) => row.agentName,
        render: (row) => <span className="block max-w-[200px] truncate">{row.agentName}</span>,
      },
      {
        key: "audience",
        header: "Audience",
        render: (row) => (
          <span className="block min-w-[190px] text-[12.5px] leading-snug text-black/55">
            {row.audience}
            <span className="numeral ms-2 font-semibold text-black/70">
              {formatNumber(row.audienceSize)}
            </span>
          </span>
        ),
      },
      {
        key: "window",
        header: "Window",
        render: (row) => (
          <span className="numeral whitespace-nowrap text-[12.5px] text-black/55">
            {row.scheduledFor ? formatDateTime(row.scheduledFor) : "unscheduled"}
            <span className="block text-[11px] text-black/35">{row.window}</span>
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        align: "end",
        sortValue: (row) => PIPELINE.indexOf(row.status),
        render: (row) => <StatusChip status={row.status} label={STATUS_LABEL[row.status]} />,
      },
    ],
    []
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <Panel
        dark
        as="section"
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex min-w-0 items-start gap-3.5">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-white/55" />
          <div>
            <h2 className="font-display text-[1.3rem] leading-snug font-medium">
              Campaign planning only — outbound calling is not implemented
            </h2>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-white/50">
              You can build and schedule a run, pick its agent, audience and calling window. Nothing dials:
              telephony, SIM routing, consent enforcement and frequency caps belong to a later phase.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-primary inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2 font-display text-[13px] font-semibold text-black"
        >
          <Plus size={14} />
          New campaign
        </button>
      </Panel>

      <Panel as="section" className="space-y-4">
        <PanelHeader
          eyebrow="Outbound runs"
          title={`${campaigns.length} campaigns`}
          aside={<DemoBadge live={origin === "live"} note="Campaign records live in the demo workspace; nothing is dispatched." />}
        />
        <ol className="grid gap-2 sm:grid-cols-4" aria-label="Campaign status pipeline">
          {PIPELINE.map((stage, index) => (
            <li
              key={stage}
              className={cn(
                "rounded-2xl border px-3.5 py-2.5 transition-colors duration-500",
                campaigns.some((campaign) => campaign.status === stage)
                  ? "border-black/25 bg-ink text-white"
                  : "border-hair bg-mist/50 text-black/45"
              )}
            >
              <span className="numeral text-[10px] font-bold tracking-[0.16em] uppercase opacity-60">
                Step {index + 1}
              </span>
              <p className="mt-1 font-display text-[13.5px] font-bold">{STATUS_LABEL[stage]}</p>
              <p className="mt-0.5 text-[11px] opacity-70">
                {campaigns.filter((campaign) => campaign.status === stage).length} campaign
                {campaigns.filter((campaign) => campaign.status === stage).length === 1 ? "" : "s"}
              </p>
            </li>
          ))}
        </ol>

        <DataTable
          label="Campaigns"
          rows={campaigns}
          columns={columns}
          highlightId={highlight}
          onOpenRow={(row) => {
            const next = row.status === "draft" ? "scheduled" : row.status === "scheduled" ? "draft" : row.status;
            if (next === row.status) {
              pushToast(
                `“${row.name}” is ${STATUS_LABEL[row.status].toLowerCase()} — moving it further requires a connected calling line.`,
                "warn"
              );
              return;
            }
            setCampaignStatus(row.id, next);
            pushToast(
              next === "scheduled"
                ? `“${row.name}” marked scheduled. No calls will be placed by this build.`
                : `“${row.name}” returned to draft.`,
              "info"
            );
            setHighlight(row.id);
          }}
          emptyTitle="No campaigns planned"
          emptyBody="Create a plan to design the scheduling and reporting flow before telephony exists."
        />

        <p className="flex flex-wrap items-center gap-2 text-[11px] text-black/40">
          <Megaphone size={12} />
          Use the View action to move a draft to scheduled. Starting or pausing a dialling run stays
          disabled until a telephony provider is connected.
          <button
            type="button"
            disabled
            title="Disabled: no calling line is connected in this build"
            aria-disabled="true"
            className="ms-auto cursor-not-allowed rounded-full border border-hair px-3 py-1 font-display text-[11px] font-semibold text-black/30"
          >
            Start calling
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Disabled: no calling line is connected in this build"
            className="cursor-not-allowed rounded-full border border-hair px-3 py-1 font-display text-[11px] font-semibold text-black/30"
          >
            Pause calling
          </button>
        </p>
      </Panel>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="New campaign"
        description="Planning record only — this does not queue or place a single call."
        width="max-w-2xl"
        footer={
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={submit}
              className="btn-primary inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 font-display text-sm font-semibold text-white"
            >
              <CalendarClock size={14} />
              Save campaign
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="cursor-pointer rounded-full border border-hair bg-white px-5 py-2.5 font-display text-sm font-semibold text-black/60 transition-colors hover:border-black/25 hover:text-black"
            >
              Cancel
            </button>
            <p className="text-[11px] leading-snug text-black/40 sm:ms-auto sm:max-w-[13rem] sm:text-end">
              Audience size is a planning number. No list is uploaded or stored.
            </p>
          </div>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Labeled htmlFor="cmp-name" label="Campaign name" error={errors.name}>
            <input
              id="cmp-name"
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Q1 instalment reminders — Amman"
              aria-invalid={Boolean(errors.name)}
              className={cn(fieldClass, errors.name && fieldBadClass)}
            />
          </Labeled>

          <div className="grid gap-5 sm:grid-cols-2">
            <Labeled htmlFor="cmp-agent" label="Agent">
              <select
                id="cmp-agent"
                value={draft.agentId}
                onChange={(event) => setDraft((prev) => ({ ...prev, agentId: event.target.value }))}
                className={cn(fieldClass, "cursor-pointer appearance-none")}
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </Labeled>

            <Labeled htmlFor="cmp-size" label="Audience size" error={errors.size}>
              <input
                id="cmp-size"
                inputMode="numeric"
                value={draft.size}
                onChange={(event) => setDraft((prev) => ({ ...prev, size: event.target.value }))}
                placeholder="4200"
                aria-invalid={Boolean(errors.size)}
                className={cn(fieldClass, "numeral", errors.size && fieldBadClass)}
              />
            </Labeled>
          </div>

          <Labeled
            htmlFor="cmp-audience"
            label="Audience"
            hint="segment description"
            error={errors.audience}
          >
            <input
              id="cmp-audience"
              value={draft.audience}
              onChange={(event) => setDraft((prev) => ({ ...prev, audience: event.target.value }))}
              placeholder="Segment: 30dpd · consented for reminders"
              aria-invalid={Boolean(errors.audience)}
              className={cn(fieldClass, errors.audience && fieldBadClass)}
            />
          </Labeled>

          <Labeled htmlFor="cmp-date" label="Start date" hint="optional" error={errors.date}>
            <input
              id="cmp-date"
              type="date"
              value={draft.date}
              onChange={(event) => setDraft((prev) => ({ ...prev, date: event.target.value }))}
              aria-invalid={Boolean(errors.date)}
              className={cn(fieldClass, "numeral", errors.date && fieldBadClass)}
            />
          </Labeled>

          <p className="rounded-2xl border border-hair bg-mist/60 px-4 py-3 text-[11.5px] leading-relaxed text-black/50">
            Real campaigns need consent state, quiet hours, frequency caps and a dialler. Those are
            telephony-phase requirements and are deliberately absent here.
          </p>
        </form>
      </Sheet>
    </div>
  );
}
