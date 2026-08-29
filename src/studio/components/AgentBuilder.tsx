import { useMemo, useState } from "react";
import { CircleCheck, FlaskConical, Loader2, Play, Save } from "lucide-react";
import { VoiceBars } from "@/components/ui/VoiceBars";
import { Labeled, Sheet, StatusChip, fieldBadClass, fieldClass } from "./primitives";
import {
  AGENT_LANGUAGES,
  DEFAULT_INSTRUCTIONS,
  INDUSTRIES,
  LANGUAGE_LABEL,
  VOICE_OPTIONS,
  type Industry,
  type StudioAgent,
} from "../data/demoWorkspace";
import type { AgentDraft } from "../StudioProvider";
import type { AgentLanguage } from "../../../shared/contracts";
import { cn } from "@/utils/cn";
import { VoiceDemo } from "@/components/voice/VoiceDemo";

type Errors = Partial<Record<"name" | "welcomeMessage" | "instructions", string>>;

const validate = (draft: AgentDraft): Errors => {
  const errors: Errors = {};
  const name = draft.name.trim();
  if (name.length < 2) errors.name = "Give the agent a name of at least 2 characters.";
  else if (name.length > 80) errors.name = "Keep the name under 80 characters.";
  const welcome = draft.welcomeMessage.trim();
  if (welcome.length > 0 && welcome.length < 12)
    errors.welcomeMessage = "Write a fuller opening line (12+ characters) or leave it empty.";
  if (draft.instructions.trim().length < 40)
    errors.instructions = "Behaviour rules need at least 40 characters.";
  return errors;
};

/**
 * The Agent Builder. Same tokens as the public site (graphite preview panel, hairline fields,
 * Saira labels) so it reads as one product, and validation that mirrors the server rules exactly —
 * the server still re-validates everything.
 */
export function AgentBuilder({
  open,
  onClose,
  existing,
  onSave,
  saving = false,
  persisted = false,
}: {
  open: boolean;
  onClose: () => void;
  existing?: StudioAgent | null;
  onSave: (draft: AgentDraft, publish: boolean) => Promise<void> | void;
  saving?: boolean;
  persisted?: boolean;
}) {
  const [draft, setDraft] = useState<AgentDraft>(() =>
    existing
      ? {
          name: existing.name,
          industry: existing.industry,
          language: existing.language,
          voice: existing.voice,
          instructions: existing.instructions,
          welcomeMessage: existing.welcomeMessage,
          description: existing.description ?? "",
          status: existing.status,
        }
      : {
          name: "",
          industry: "Banking",
          language: "en",
          voice: VOICE_OPTIONS[0]!.id,
          instructions: DEFAULT_INSTRUCTIONS,
          welcomeMessage: "",
          description: "",
          status: "draft",
        }
  );
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);
  const [testing, setTesting] = useState(false);

  const set = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value } as AgentDraft;
      if (touched) setErrors(validate(next));
      return next;
    });
  };

  const voice = useMemo(
    () => VOICE_OPTIONS.find((option) => option.id === draft.voice) ?? VOICE_OPTIONS[0]!,
    [draft.voice]
  );

  const submit = async (publish: boolean) => {
    setTouched(true);
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    await onSave(draft, publish);
  };

  return (
    <>
      <Sheet
        open={open && !testing}
        onClose={onClose}
        width="max-w-5xl"
        title={existing ? "Edit agent" : "Agent builder"}
        description={
          persisted
            ? "Saved through the API into your organization. Nothing is dialled or published to a carrier."
            : "Configuration is held in this browser session only — no API is configured."
        }
        footer={
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit(false)}
              className="btn-primary inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 font-display text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setTesting(true)}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-hair bg-white px-5 py-2.5 font-display text-sm font-semibold text-black/70 transition-colors hover:border-black/30 hover:text-black disabled:opacity-50"
            >
              <Play size={14} />
              Test Agent
            </button>
            <p className="text-[11px] leading-snug text-black/40 sm:ms-auto sm:max-w-[19rem] sm:text-end">
              {existing
                ? "Editing keeps the current status until you change it from the card."
                : "New agents start as drafts; marking one live is a workspace state, not a phone line."}
            </p>
          </div>
        }
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-10">
          {/* form */}
          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(false);
            }}
          >
            <Labeled htmlFor="agent-name" label="Agent name" error={errors.name}>
              <input
                id="agent-name"
                value={draft.name}
                onChange={(event) => set("name", event.target.value)}
                onBlur={() => {
                  setTouched(true);
                  setErrors(validate(draft));
                }}
                placeholder="Retail banking support — Amman"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "agent-name-error" : undefined}
                className={cn(fieldClass, errors.name && fieldBadClass)}
              />
            </Labeled>

            <div className="grid gap-5 sm:grid-cols-2">
              <Labeled htmlFor="agent-industry" label="Industry">
                <select
                  id="agent-industry"
                  value={draft.industry}
                  onChange={(event) => set("industry", event.target.value as Industry)}
                  className={cn(fieldClass, "cursor-pointer appearance-none")}
                >
                  {INDUSTRIES.map((industry) => (
                    <option key={industry} value={industry}>
                      {industry}
                    </option>
                  ))}
                </select>
              </Labeled>

              <Labeled htmlFor="agent-voice" label="Voice" hint={voice.locale}>
                <select
                  id="agent-voice"
                  value={draft.voice}
                  onChange={(event) => set("voice", event.target.value)}
                  className={cn(fieldClass, "cursor-pointer appearance-none")}
                >
                  {VOICE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Labeled>
            </div>

            <fieldset>
              <legend className="mb-2.5 font-display text-[10px] font-bold tracking-[0.16em] text-black/55 uppercase">
                Language
              </legend>
              <div className="flex flex-wrap gap-2">
                {AGENT_LANGUAGES.map((language) => (
                  <label key={language} className="cursor-pointer">
                    <input
                      type="radio"
                      name="agent-language"
                      value={language}
                      checked={draft.language === language}
                      onChange={() => set("language", language as AgentLanguage)}
                      className="peer sr-only"
                    />
                    <span
                      dir={language === "en" ? "ltr" : "rtl"}
                      className={cn(
                        "block rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all duration-300",
                        "peer-focus-visible:ring-2 peer-focus-visible:ring-black peer-focus-visible:ring-offset-2",
                        draft.language === language
                          ? "border-black bg-black text-white"
                          : "border-hair bg-white text-black/60 hover:border-black/30 hover:text-black"
                      )}
                    >
                      <span className={cn(language !== "en" && "font-arabic")}>
                        {LANGUAGE_LABEL[language]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Labeled
              htmlFor="agent-instructions"
              label="Agent instructions"
              hint={`${draft.instructions.trim().length} chars`}
              error={errors.instructions}
            >
              <textarea
                id="agent-instructions"
                rows={6}
                value={draft.instructions}
                onChange={(event) => set("instructions", event.target.value)}
                onBlur={() => {
                  setTouched(true);
                  setErrors(validate(draft));
                }}
                aria-invalid={Boolean(errors.instructions)}
                aria-describedby={errors.instructions ? "agent-instructions-error" : undefined}
                className={cn(fieldClass, "resize-y leading-relaxed", errors.instructions && fieldBadClass)}
              />
            </Labeled>

            <Labeled htmlFor="agent-welcome" label="Welcome message" hint="Spoken on answer" error={errors.welcomeMessage}>
              <textarea
                id="agent-welcome"
                rows={3}
                dir={draft.language === "en" ? "ltr" : "rtl"}
                value={draft.welcomeMessage}
                onChange={(event) => set("welcomeMessage", event.target.value)}
                onBlur={() => {
                  setTouched(true);
                  setErrors(validate(draft));
                }}
                placeholder={
                  draft.language === "en"
                    ? "Welcome to CenterAI. I can help with balance enquiries and card issues."
                    : "أهلاً بك في CenterAI. أستطيع مساعدتك في استعلامات الرصيد والبطاقات."
                }
                aria-invalid={Boolean(errors.welcomeMessage)}
                aria-describedby={errors.welcomeMessage ? "agent-welcome-error" : undefined}
                className={cn(
                  fieldClass,
                  "resize-y leading-relaxed",
                  draft.language !== "en" && "font-arabic text-end",
                  errors.welcomeMessage && fieldBadClass
                )}
              />
            </Labeled>

            <p className="flex items-start gap-2.5 rounded-2xl border border-hair bg-mist/60 px-4 py-3 text-[11.5px] leading-relaxed text-black/50">
              <CircleCheck size={14} className="mt-0.5 shrink-0 text-black/40" />
              Guardrails stay in force regardless of this text: the agent cannot place calls, move money,
              or read customer records from this workspace.
            </p>
          </form>

          {/* preview */}
          <aside className="lg:sticky lg:top-2 lg:self-start">
            <div className="grain relative overflow-hidden rounded-3xl border border-white/10 bg-graphite p-5 text-white sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="font-display text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase">
                  Live preview
                </p>
                <StatusChip status={draft.status ?? "draft"} label={draft.status ?? "draft"} />
              </div>

              <p className="mt-4 text-[1.4rem] leading-tight font-medium break-words">
                {draft.name.trim() || "Untitled agent"}
              </p>

              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-[11px]">
                {[
                  ["Language", LANGUAGE_LABEL[draft.language]],
                  ["Voice", voice.label.split("·")[0]?.trim() ?? voice.label],
                  ["Industry", draft.industry],
                  ["Storage", persisted ? "Organization (API)" : "This tab only"],
                ].map(([key, value]) => (
                  <div key={key}>
                    <dt className="font-display tracking-[0.16em] text-white/35 uppercase">{key}</dt>
                    <dd
                      dir={draft.language === "en" ? "ltr" : "auto"}
                      className={cn(
                        "mt-1 text-[13px] font-medium",
                        draft.language !== "en" && "font-arabic"
                      )}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 rounded-2xl bg-white p-3.5 text-black">
                <p className="mb-1.5 flex items-center gap-1.5 font-display text-[9px] font-bold tracking-[0.18em] text-black/45 uppercase">
                  <span className="h-1.5 w-1.5 rounded-full bg-black" />
                  Agent · welcome
                </p>
                <p
                  dir={draft.language === "en" ? "ltr" : "rtl"}
                  className={cn(
                    "text-[14px] leading-relaxed",
                    draft.language !== "en" && "font-arabic text-end"
                  )}
                >
                  {draft.welcomeMessage.trim() ||
                    (draft.language === "en"
                      ? "Welcome message appears here as you type."
                      : "ستظهر رسالة الترحيب هنا أثناء الكتابة.")}
                </p>
              </div>

              <div className="mt-4 h-10 rounded-xl border border-white/10 bg-black/30 px-2.5 py-2 text-white/70">
                <VoiceBars count={26} intensity={0.4} className="h-full w-full" />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setTesting(true)}
              className="mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-hair bg-white py-2.5 font-display text-[13px] font-semibold text-black/65 transition-colors hover:border-black/25 hover:text-black"
            >
              <FlaskConical size={14} />
              Run this configuration in the voice console
            </button>
          </aside>
        </div>
      </Sheet>

      {/* Test Agent reuses the shipping console — same provider negotiation, same states. */}
      <Sheet
        open={testing}
        onClose={() => setTesting(false)}
        width="max-w-4xl"
        title={`Test “${draft.name.trim() || "untitled agent"}”`}
        description="Runs through the same provider negotiation as the public console: live voice only when the server authorizes it, otherwise Demo Mode."
      >
        <VoiceDemo initialLanguage={draft.language} />
      </Sheet>
    </>
  );
}
