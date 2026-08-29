import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_DEMO_FORM,
  validateDemoField,
  validateDemoForm,
  DEMO_FIELD_ORDER,
  type DemoErrors,
  type DemoFieldName,
  type DemoFormValues,
} from "@/lib/validation";
import {
  buildDemoPayload,
  submitDemoRequest,
  type DemoPayload,
  type DemoResult,
} from "@/lib/demoRequest";
import { STRINGS, type Lang } from "@/content/demoForm";

export type DemoPhase = "form" | "confirming" | "done" | "failed";

/** Best-effort prefill from the trigger point, e.g. "solutions · Healthcare". */
function contextFrom(source: string) {
  const [, detail = ""] = source.split("·");
  const value = detail.trim();
  const industries = ["Banking", "Finance", "Healthcare", "Legal", "Enterprise Services"];
  return {
    industry: industries.includes(value) ? value : "",
    note: source || "",
  };
}

export function useDemoForm({ open, source }: { open: boolean; source: string }) {
  const [lang, setLang] = useState<Lang>("en");
  const [values, setValues] = useState<DemoFormValues>(EMPTY_DEMO_FORM);
  const [errors, setErrors] = useState<DemoErrors>({});
  const [touched, setTouched] = useState<Partial<Record<DemoFieldName, boolean>>>({});
  const [phase, setPhase] = useState<DemoPhase>("form");
  const [result, setResult] = useState<DemoResult | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const t = STRINGS[lang];
  const rtl = t.dir === "rtl";

  // Fresh start each time the dialog opens, with a light prefill from the trigger.
  useEffect(() => {
    if (!open) return;
    const prefill = contextFrom(source);
    setPhase("form");
    setResult(null);
    setErrors({});
    setTouched({});
    setValues((prev) => ({
      ...EMPTY_DEMO_FORM,
      name: prev.name,
      company: prev.company,
      email: prev.email,
      phone: prev.phone,
      country: prev.country,
      industry: prev.industry || prefill.industry,
      useCase: prev.useCase,
      volume: prev.volume,
      message: prev.message,
      consent: prev.consent,
    }));
  }, [open, source]);

  // Cancel any in-flight transport when the dialog closes or the page unmounts.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Latest values, readable synchronously inside an event handler (setField → blurField in one tick).
  const liveRef = useRef<DemoFormValues>(values);
  liveRef.current = values;

  /** Update a value, then re-validate it live only once it has been touched or flagged. */
  const setField = useCallback(
    <K extends DemoFieldName>(field: K, value: DemoFormValues[K]) => {
      const next = { ...values, [field]: value } as DemoFormValues;
      liveRef.current = next;
      setValues(next);
      if (!touched[field] && !errors[field]) return;
      const code = validateDemoField(field, next);
      setErrors((prev) => {
        const clone = { ...prev };
        if (code) clone[field] = code;
        else delete clone[field];
        return clone;
      });
    },
    [values, touched, errors]
  );

  const blurField = useCallback(
    (field: DemoFieldName) => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      const code = validateDemoField(field, liveRef.current);
      setErrors((prev) => {
        const clone = { ...prev };
        if (code) clone[field] = code;
        else delete clone[field];
        return clone;
      });
    },
    []
  );

  const errorCount = useMemo(() => Object.keys(errors).length, [errors]);

  const focusField = (field: DemoFieldName) => {
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`);
    el?.focus();
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    // Spam trap: silently ignore a filled honeypot instead of erroring at a human.
    if (values.fax_reference) return;

    const nextErrors = validateDemoForm(values);
    setErrors(nextErrors);
    setTouched(Object.fromEntries(DEMO_FIELD_ORDER.map((f) => [f, true])));

    const firstBad = DEMO_FIELD_ORDER.find((f) => nextErrors[f]);
    if (firstBad) {
      focusField(firstBad);
      return;
    }

    const payload: DemoPayload = buildDemoPayload(values, { source, locale: lang });
    setBusy(true);
    setPhase("confirming");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const res = await submitDemoRequest(payload, { signal: controller.signal });
    setBusy(false);
    setResult(res);
    setPhase(res.status === "error" ? "failed" : "done");
  };

  const retry = useCallback(() => {
    setPhase("form");
    setResult(null);
    window.setTimeout(() => focusField("name"), 0);
  }, []);

  const resetAll = useCallback(() => {
    setValues(EMPTY_DEMO_FORM);
    setErrors({});
    setTouched({});
    setPhase("form");
    setResult(null);
  }, []);

  return {
    t,
    rtl,
    lang,
    setLang,
    values,
    errors,
    touched,
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
    errorText: (field: DemoFieldName) =>
      errors[field] ? (t.errors[errors[field]!] ?? t.errors.generic) : undefined,
  };
}
