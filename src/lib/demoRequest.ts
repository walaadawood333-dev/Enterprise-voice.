/**
 * Transport adapter for the Book a Demo flow.
 *
 * The UI never talks to fetch directly — it calls submitDemoRequest(), which resolves to a
 * discriminated result so every state (local-only / delivered / error) is handled explicitly.
 * Today no endpoint is configured, so the request is validated and returned unsent:
 * nothing is faked as "submitted".
 */

import { sanitizeDemoForm, type DemoFormValues } from "./validation";

type Env = Record<string, string | undefined>;
const env: Env = (import.meta as unknown as { env?: Env }).env ?? {};

/** Set VITE_DEMO_ENDPOINT (e.g. https://api.centerai.jo/v1/demo-requests) to go live. */
export const DEMO_ENDPOINT = env.VITE_DEMO_ENDPOINT ?? "";
export const DEMO_TIMEOUT_MS = Number(env.VITE_DEMO_TIMEOUT_MS ?? 12_000);

export type DemoPayload = ReturnType<typeof buildDemoPayload>;

export function buildDemoPayload(values: DemoFormValues, meta: { source: string; locale: string }) {
  const data = sanitizeDemoForm(values);
  return {
    kind: "demo_request" as const,
    locale: meta.locale,
    source: meta.source || "unknown",
    submittedAt: new Date().toISOString(),
    name: data.name,
    company: data.company,
    email: data.email,
    phone: data.phone,
    country: data.country,
    industry: data.industry,
    useCase: data.useCase,
    monthlyCallVolume: data.volume,
    message: data.message || null,
    consentAt: new Date().toISOString(),
    context: {
      pageTitle: typeof document !== "undefined" ? document.title : "",
      pagePath: typeof window !== "undefined" ? window.location.pathname : "/",
      viewport: typeof window !== "undefined" ? window.innerWidth : 0,
      reducedMotion:
        typeof window !== "undefined"
          ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
          : false,
    },
  };
}

export type DemoResult =
  | { status: "local-only"; payload: DemoPayload }
  | { status: "delivered"; payload: DemoPayload; reference: string }
  | { status: "error"; payload: DemoPayload; message: string; retryable: boolean };

export async function submitDemoRequest(
  payload: DemoPayload,
  { signal }: { signal?: AbortSignal } = {}
): Promise<DemoResult> {
  if (!DEMO_ENDPOINT) {
    // No transport configured → report honestly instead of pretending success.
    return { status: "local-only", payload };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DEMO_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const res = await fetch(DEMO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        status: "error",
        payload,
        message: `Endpoint responded ${res.status} ${res.statusText || ""}`.trim(),
        retryable: res.status >= 500 || res.status === 429,
      };
    }

    let reference = "";
    try {
      const body: unknown = await res.json();
      if (body && typeof body === "object") {
        const maybe = (body as { id?: string; reference?: string }).id;
        const maybeRef = (body as { reference?: string }).reference;
        reference = maybe ?? maybeRef ?? "";
      }
    } catch {
      /* a 2xx with no body still counts as delivered */
    }

    return {
      status: "delivered",
      payload,
      reference: reference || `local-${Date.now().toString(36)}`,
    };
  } catch (error) {
    const aborted = (error as Error)?.name === "AbortError";
    return {
      status: "error",
      payload,
      message: aborted
        ? "The request was cancelled or timed out."
        : (error as Error)?.message ?? "Network error.",
      retryable: true,
    };
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

/* ── Offline-safe delivery options (used while no endpoint is configured) ── */

export function serializeDemoPayload(payload: DemoPayload) {
  return JSON.stringify(payload, null, 2);
}

export function demoPayloadToText(payload: DemoPayload) {
  const rows: Array<[string, string | null | undefined]> = [
    ["Full name", payload.name],
    ["Organisation", payload.company],
    ["Work email", payload.email],
    ["Phone", payload.phone],
    ["Country", payload.country],
    ["Industry", payload.industry],
    ["Use case", payload.useCase],
    ["Monthly call volume", payload.monthlyCallVolume],
    ["Message", payload.message],
    ["Entry point", payload.source],
    ["Locale", payload.locale],
    ["Validated at", payload.submittedAt],
  ];
  return rows
    .map(([label, value]) => `${label}: ${value && value.length > 0 ? value : "—"}`)
    .join("\n");
}

export function buildDemoMailto(payload: DemoPayload, to = "hello@centerai.jo") {
  const subject = `Demo request — ${payload.company || payload.name} (${payload.industry})`;
  const body = `${demoPayloadToText(payload)}\n\nSent from the CenterAI site (${payload.source}). This email was composed locally; no data was transmitted by the website.`;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function downloadDemoPayload(payload: DemoPayload) {
  const blob = new Blob([serializeDemoPayload(payload)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `centerai-demo-request-${payload.submittedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so Safari has time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyDemoPayload(payload: DemoPayload): Promise<boolean> {
  const text = demoPayloadToText(payload);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
