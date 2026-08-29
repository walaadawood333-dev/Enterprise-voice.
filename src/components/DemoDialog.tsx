import { useEffect, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  CircleCheck,
  Copy,
  Download,
  Loader2,
  Mail,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { useDemoForm } from "@/hooks/useDemoForm";
import { MESSAGE_MAX } from "@/lib/validation";
import {
  buildDemoMailto,
  copyDemoPayload,
  downloadDemoPayload,
  demoPayloadToText,
  serializeDemoPayload,
} from "@/lib/demoRequest";
import { CALL_VOLUMES, COUNTRIES, INDUSTRIES, STRINGS, USE_CASES } from "@/content/demoForm";
import { legalCopy } from "@/content/site";
import { cn } from "@/utils/cn";

const fieldBase =
  "w-full rounded-2xl border bg-white px-4 py-3 font-sans text-[15px] text-ink transition-colors duration-300 placeholder:text-black/25 focus:outline-none";
const fieldIdle = "border-hair hover:border-black/25 focus:border-black";
const fieldBad = "border-red-300 bg-red-50/60 focus:border-red-500";

function Label({ htmlFor, children, hint }: { htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <label
        htmlFor={htmlFor}
        className="font-display text-[11px] font-bold tracking-[0.16em] text-black/55 uppercase"
      >
        {children}
      </label>
      {hint ? <span className="text-[11px] text-black/35">{hint}</span> : null}
    </div>
  );
}

function ErrorText({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-[12px] font-medium text-red-600">
      {children}
    </p>
  );
}

function Chip({
  name,
  value,
  current,
  onChange,
  children,
}: {
  name: string;
  value: string;
  current: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  const checked = current === value;
  return (
    <label className="cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="peer sr-only"
      />
      <span
        className={cn(
          "block rounded-full border px-3.5 py-2 text-center text-[13px] font-medium transition-all duration-300 ease-smooth",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-black peer-focus-visible:ring-offset-2",
          checked
            ? "border-black bg-black text-white"
            : "border-hair bg-white text-black/60 hover:border-black/30 hover:text-black"
        )}
      >
        {children}
      </span>
    </label>
  );
}

export function DemoDialog({
  open,
  onClose,
  source,
}: {
  open: boolean;
  onClose: () => void;
  source: string;
}) {
  const {
    t,
    rtl,
    lang,
    setLang,
    values,
    errors,
    phase,
    result,
    busy,
    errorCount,
    formRef,
    setField,
    blurField,
    handleSubmit,
    retry,
    resetAll,
    errorText,
  } = useDemoForm({ open, source });

  const [copied, setCopied] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(id);
  }, [copied]);

  useEffect(() => {
    if (phase === "form") setShowErrors(false);
  }, [phase]);

  const payload = result?.payload;
  const title =
    phase === "done"
      ? result?.status === "delivered"
        ? t.done.deliveredTitle
        : t.done.localTitle
      : phase === "failed"
        ? t.done.errorTitle
        : t.title;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="demo-title"
      title={title}
      description={
        phase === "form"
          ? t.intro
          : phase === "confirming"
            ? t.submitting
            : phase === "failed" && result?.status === "error"
              ? result.message
              : undefined
      }
    >
      <div dir={t.dir} lang={lang} className={cn(rtl && "font-arabic")}>
        {phase === "form" || phase === "confirming" ? (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <span className="font-display text-[10px] font-bold tracking-[0.18em] text-black/40 uppercase">
                {source ? `${t.sections.context}: ${source}` : "CenterAI · demo request"}
              </span>
              <div className="flex items-center gap-1 rounded-full border border-hair p-0.5">
                {(["en", "ar"] as const).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLang(code)}
                    aria-pressed={lang === code}
                    className={cn(
                      "cursor-pointer rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-300",
                      lang === code ? "bg-ink text-white" : "text-black/45 hover:text-black"
                    )}
                  >
                    {STRINGS[code].label}
                  </button>
                ))}
              </div>
            </div>

            {showErrors && errorCount > 0 ? (
              <div
                role="alert"
                className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700"
              >
                {t.summary(errorCount)}
              </div>
            ) : null}

            <form
              ref={formRef}
              onSubmit={(e) => {
                setShowErrors(true);
                void handleSubmit(e);
              }}
              noValidate
              className="space-y-7"
            >
              <fieldset disabled={busy} className="space-y-7 border-0 p-0">
                <div>
                  <h3 className="mb-4 border-b border-hair pb-2 font-display text-[11px] font-bold tracking-[0.2em] text-black/40 uppercase">
                    {t.sections.contact}
                  </h3>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="demo-name">{t.fields.name.label}</Label>
                      <input
                        id="demo-name"
                        data-field="name"
                        name="name"
                        autoComplete="name"
                        placeholder={t.fields.name.placeholder}
                        value={values.name}
                        onChange={(e) => setField("name", e.target.value)}
                        onBlur={() => blurField("name")}
                        aria-invalid={Boolean(errors.name)}
                        aria-describedby={errors.name ? "demo-name-error" : undefined}
                        className={cn(fieldBase, errors.name ? fieldBad : fieldIdle)}
                      />
                      <ErrorText id="demo-name-error">{errorText("name")}</ErrorText>
                    </div>

                    <div>
                      <Label htmlFor="demo-company">{t.fields.company.label}</Label>
                      <input
                        id="demo-company"
                        data-field="company"
                        name="company"
                        autoComplete="organization"
                        placeholder={t.fields.company.placeholder}
                        value={values.company}
                        onChange={(e) => setField("company", e.target.value)}
                        onBlur={() => blurField("company")}
                        aria-invalid={Boolean(errors.company)}
                        aria-describedby={errors.company ? "demo-company-error" : undefined}
                        className={cn(fieldBase, errors.company ? fieldBad : fieldIdle)}
                      />
                      <ErrorText id="demo-company-error">{errorText("company")}</ErrorText>
                    </div>

                    <div>
                      <Label htmlFor="demo-email">{t.fields.email.label}</Label>
                      <input
                        id="demo-email"
                        data-field="email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        dir="ltr"
                        placeholder={t.fields.email.placeholder}
                        value={values.email}
                        onChange={(e) => setField("email", e.target.value)}
                        onBlur={() => blurField("email")}
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? "demo-email-error" : undefined}
                        className={cn(fieldBase, "text-start", errors.email ? fieldBad : fieldIdle)}
                      />
                      <ErrorText id="demo-email-error">{errorText("email")}</ErrorText>
                    </div>

                    <div>
                      <Label htmlFor="demo-phone">{t.fields.phone.label}</Label>
                      <input
                        id="demo-phone"
                        data-field="phone"
                        name="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        dir="ltr"
                        placeholder={t.fields.phone.placeholder}
                        value={values.phone}
                        onChange={(e) => setField("phone", e.target.value)}
                        onBlur={() => blurField("phone")}
                        aria-invalid={Boolean(errors.phone)}
                        aria-describedby={errors.phone ? "demo-phone-error" : undefined}
                        className={cn(fieldBase, "text-start", errors.phone ? fieldBad : fieldIdle)}
                      />
                      <ErrorText id="demo-phone-error">{errorText("phone")}</ErrorText>
                    </div>

                    <div className="sm:col-span-2">
                      <Label htmlFor="demo-country">{t.fields.country.label}</Label>
                      <div className="relative">
                        <select
                          id="demo-country"
                          data-field="country"
                          name="country"
                          value={values.country}
                          onChange={(e) => setField("country", e.target.value)}
                          onBlur={() => blurField("country")}
                          aria-invalid={Boolean(errors.country)}
                          aria-describedby={errors.country ? "demo-country-error" : undefined}
                          className={cn(
                            fieldBase,
                            "appearance-none pe-10",
                            errors.country ? fieldBad : fieldIdle,
                            !values.country && "text-black/35"
                          )}
                        >
                          <option value="">{t.fields.country.placeholder}</option>
                          {COUNTRIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={15}
                          className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-black/35"
                        />
                      </div>
                      <ErrorText id="demo-country-error">{errorText("country")}</ErrorText>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-4 border-b border-hair pb-2 font-display text-[11px] font-bold tracking-[0.2em] text-black/40 uppercase">
                    {t.sections.scope}
                  </h3>

                  <div className="space-y-6">
                    <fieldset
                      aria-invalid={Boolean(errors.industry)}
                      aria-describedby={errors.industry ? "demo-industry-error" : undefined}
                    >
                      <legend className="mb-2.5 font-display text-[11px] font-bold tracking-[0.16em] text-black/55 uppercase">
                        {t.fields.industry.label}
                      </legend>
                      <div className="flex flex-wrap gap-2">
                        {INDUSTRIES.map((option) => (
                          <Chip
                            key={option}
                            name="industry"
                            value={option}
                            current={values.industry}
                            onChange={(v) => {
                              setField("industry", v);
                              blurField("industry");
                            }}
                          >
                            {t.options.industries[option] ?? option}
                          </Chip>
                        ))}
                      </div>
                      <div data-field="industry" tabIndex={-1} className="sr-only" aria-hidden="true" />
                      <ErrorText id="demo-industry-error">{errorText("industry")}</ErrorText>
                    </fieldset>

                    <fieldset
                      aria-invalid={Boolean(errors.useCase)}
                      aria-describedby={errors.useCase ? "demo-usecase-error" : undefined}
                    >
                      <legend className="mb-2.5 font-display text-[11px] font-bold tracking-[0.16em] text-black/55 uppercase">
                        {t.fields.useCase.label}
                      </legend>
                      <div className="flex flex-wrap gap-2">
                        {USE_CASES.map((option) => (
                          <Chip
                            key={option}
                            name="useCase"
                            value={option}
                            current={values.useCase}
                            onChange={(v) => {
                              setField("useCase", v);
                              blurField("useCase");
                            }}
                          >
                            {t.options.useCases[option] ?? option}
                          </Chip>
                        ))}
                      </div>
                      <div data-field="useCase" tabIndex={-1} className="sr-only" aria-hidden="true" />
                      <ErrorText id="demo-usecase-error">{errorText("useCase")}</ErrorText>
                    </fieldset>

                    <fieldset
                      aria-invalid={Boolean(errors.volume)}
                      aria-describedby={errors.volume ? "demo-volume-error" : undefined}
                    >
                      <legend className="mb-2.5 font-display text-[11px] font-bold tracking-[0.16em] text-black/55 uppercase">
                        {t.fields.volume.label}
                      </legend>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {CALL_VOLUMES.map((option) => (
                          <Chip
                            key={option}
                            name="volume"
                            value={option}
                            current={values.volume}
                            onChange={(v) => {
                              setField("volume", v);
                              blurField("volume");
                            }}
                          >
                            <span className="numeral">{t.options.volumes[option] ?? option}</span>
                          </Chip>
                        ))}
                      </div>
                      <div data-field="volume" tabIndex={-1} className="sr-only" aria-hidden="true" />
                      <ErrorText id="demo-volume-error">{errorText("volume")}</ErrorText>
                    </fieldset>

                    <div>
                      <div className="mb-2 flex items-baseline justify-between gap-3">
                        <label
                          htmlFor="demo-message"
                          className="font-display text-[11px] font-bold tracking-[0.16em] text-black/55 uppercase"
                        >
                          {t.fields.message.label}
                        </label>
                        <span className="numeral text-[11px] text-black/35">
                          {t.counter(values.message.length, MESSAGE_MAX)}
                        </span>
                      </div>
                      <textarea
                        id="demo-message"
                        data-field="message"
                        name="message"
                        rows={4}
                        maxLength={MESSAGE_MAX + 200}
                        placeholder={t.fields.message.placeholder}
                        value={values.message}
                        onChange={(e) => setField("message", e.target.value)}
                        onBlur={() => blurField("message")}
                        aria-invalid={Boolean(errors.message)}
                        aria-describedby={cn(
                          "demo-message-hint",
                          errors.message ? "demo-message-error" : ""
                        ).trim()}
                        className={cn(
                          fieldBase,
                          "resize-y leading-relaxed",
                          errors.message ? fieldBad : fieldIdle
                        )}
                      />
                      <div className="mt-1.5 flex items-start justify-between gap-3">
                        <p id="demo-message-hint" className="text-[11px] text-black/35">
                          {t.fields.message.optional}
                        </p>
                      </div>
                      {errors.message ? (
                        <ErrorText id="demo-message-error">{errorText("message")}</ErrorText>
                      ) : null}
                    </div>

                    {/* Honeypot — visually and programmatically hidden from humans. */}
                    <div className="hidden" aria-hidden="true">
                      <label htmlFor="fax_reference">Reference</label>
                      <input
                        id="fax_reference"
                        name="fax_reference"
                        tabIndex={-1}
                        autoComplete="off"
                        value={values.fax_reference}
                        onChange={(e) => setField("fax_reference", e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-hair bg-mist/50 p-4 transition-colors hover:border-black/20">
                        <input
                          type="checkbox"
                          data-field="consent"
                          name="consent"
                          checked={values.consent}
                          onChange={(e) => {
                            setField("consent", e.target.checked);
                            blurField("consent");
                          }}
                          aria-invalid={Boolean(errors.consent)}
                          aria-describedby={errors.consent ? "demo-consent-error" : undefined}
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-black"
                        />
                        <span className="text-[13px] leading-snug text-black/60">{t.consent}</span>
                      </label>
                      <ErrorText id="demo-consent-error">{errorText("consent")}</ErrorText>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-hair pt-6 sm:flex-row sm:items-center">
                  <Button type="submit" size="md" className="w-full sm:w-auto" disabled={busy}>
                    {busy ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        {t.submitting}
                      </>
                    ) : (
                      <>
                        {t.submit}
                        <ArrowRight size={15} />
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={onClose}
                    className="w-full sm:w-auto"
                  >
                    {lang === "ar" ? "إغلاق" : "Close"}
                  </Button>
                  <p className="text-[11px] leading-snug text-black/35 sm:ms-auto sm:max-w-[13rem] sm:text-end">
                    {lang === "ar"
                      ? "لا يُرسل شيء في هذا الإصدار؛ يتم التحقق محلياً فقط."
                      : "Nothing leaves this browser yet — validation runs locally only."}
                  </p>
                </div>
              </fieldset>
            </form>

            <p aria-live="polite" className="sr-only">
              {busy ? t.submitting : errorCount > 0 ? t.summary(errorCount) : ""}
            </p>
          </>
        ) : (
          <div className="space-y-6">
            <div
              className={cn(
                "flex items-start gap-4 rounded-2xl border p-5",
                phase === "failed" ? "border-red-200 bg-red-50" : "border-hair bg-mist"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 shrink-0",
                  phase === "failed" ? "text-red-600" : "text-black"
                )}
              >
                {phase === "failed" ? <ShieldCheck size={20} /> : <CircleCheck size={20} />}
              </span>
              <div className="space-y-1.5 text-start">
                <p className="text-[15px] leading-snug font-medium">
                  {phase === "done" && result?.status === "delivered"
                    ? t.done.deliveredBody
                    : phase === "failed"
                      ? (result as unknown as { message: string })?.message
                      : t.done.localBody}
                </p>
                {phase === "done" && result?.status === "delivered" ? (
                  <p className="numeral text-xs text-black/45">
                    Reference: {result.reference}
                  </p>
                ) : null}
              </div>
            </div>

            {payload ? (
              <div className="text-start">
                <h3 className="mb-3 font-display text-[11px] font-bold tracking-[0.2em] text-black/40 uppercase">
                  {t.done.review}
                </h3>
                <dl className="divide-y divide-hair rounded-2xl border border-hair">
                  {demoPayloadToText(payload)
                    .split("\n")
                    .map((line) => {
                      const [label, ...rest] = line.split(": ");
                      return (
                        <div key={line} className="flex items-start gap-4 px-4 py-2.5">
                          <dt className="w-40 shrink-0 font-display text-[10px] font-bold tracking-[0.14em] text-black/45 uppercase">
                            {label}
                          </dt>
                          <dd className="min-w-0 flex-1 text-[13px] break-words text-black/70">
                            {rest.join(": ") || t.done.none}
                          </dd>
                        </div>
                      );
                    })}
                </dl>
              </div>
            ) : null}

            {payload ? (
              <div className="flex flex-wrap gap-2.5">
                <Button
                  size="sm"
                  onClick={() => {
                    void copyDemoPayload(payload).then((ok) => ok && setCopied(true));
                  }}
                >
                  {copied ? <CircleCheck size={14} /> : <Copy size={14} />}
                  {copied ? t.done.copied : t.done.copy}
                </Button>
                <a
                  href={buildDemoMailto(payload)}
                  className="btn-primary inline-flex items-center gap-2 rounded-full border border-hair px-4 py-1.5 text-sm font-semibold transition-colors hover:bg-mist"
                >
                  <Mail size={14} />
                  {t.done.mail}
                </a>
                <button
                  type="button"
                  onClick={() => downloadDemoPayload(payload)}
                  className="btn-primary inline-flex cursor-pointer items-center gap-2 rounded-full border border-hair px-4 py-1.5 text-sm font-semibold transition-colors hover:bg-mist"
                >
                  <Download size={14} />
                  {t.done.download}
                </button>
                <p className="ms-auto self-center text-[11px] leading-relaxed text-black/35">
                  <span className="font-display font-bold tracking-[0.14em] uppercase">Payload</span>{" "}
                  <span className="numeral break-all">{serializeDemoPayload(payload).length} bytes · JSON</span>
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 border-t border-hair pt-5">
              <Button size="sm" variant="outline" onClick={phase === "failed" ? retry : resetAll}>
                <RotateCcw size={13} />
                {phase === "failed" ? t.done.edit : t.done.edit}
              </Button>
              {phase === "failed" && result?.status === "error" ? (
                <Button size="sm" onClick={() => void retry()}>
                  {lang === "ar" ? "إعادة المحاولة" : "Try again"}
                </Button>
              ) : null}
            </div>

            <p className="text-[11px] leading-relaxed text-black/35">{t.done.devNote}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function LegalDialog({
  legalKey,
  onClose,
}: {
  legalKey: string | null;
  onClose: () => void;
}) {
  const entry = legalKey ? legalCopy[legalKey] : null;
  return (
    <Modal
      open={Boolean(entry)}
      onClose={onClose}
      labelledBy="legal-title"
      title={entry?.title ?? ""}
      description="Summary for this build — full policy documents are published at launch."
      size="md"
    >
      <div className="space-y-4 text-start text-[15px] leading-relaxed text-black/65">
        {entry?.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className="text-[11px] text-black/35">CenterAI — Amman, Jordan.</p>
      </div>
    </Modal>
  );
}
