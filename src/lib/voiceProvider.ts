/**
 * Browser-side voice transport selection.
 *
 *   VoiceProvider (shared/contracts)
 *     ├── DemoVoiceProvider   ← timers + scripted turns (current on-page experience)
 *     └── HttpVoiceProvider   ← drives /api/voice/* and silently degrades to demo on any failure
 *
 * The Voice Demo component only knows the interface, so switching engines never touches the UI.
 */

import { API_BASE_URL, DEMO_AGENT_ID, createApiClient, getVoiceMode } from "@/api";
import { OpenAIRealtimeVoiceProvider } from "./realtimeVoice";
import type {
  AgentLanguage,
  DemoTurn,
  VoiceProvider,
  VoiceProviderEvent,
  VoiceProviderInfo,
  VoiceState,
  VoiceProviderEvent as _Event,
} from "../../shared/contracts";

export type {
  DemoTurn,
  VoiceProvider,
  VoiceProviderEvent,
  VoiceProviderInfo,
  VoiceRole,
  VoiceState,
} from "../../shared/contracts";

const THINKING_MS = 850;

export class DemoVoiceProvider implements VoiceProvider {
  readonly info: VoiceProviderInfo = {
    id: "demo",
    label: "DemoVoiceProvider",
    telephony: false,
    realtimeAudio: false,
    microphone: false,
    simulation: true,
  };

  private listeners = new Set<(event: VoiceProviderEvent) => void>();
  private timers: number[] = [];
  private state: VoiceState = "ready";

  subscribe(listener: (event: VoiceProviderEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: VoiceProviderEvent) {
    this.listeners.forEach((l) => l(event));
  }

  private setState(next: VoiceState) {
    if (this.state === next) return;
    this.state = next;
    this.emit({ type: "state", state: next });
  }

  private clear() {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
  }

  private after(delay: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, delay));
  }

  start({ turns }: { language: string; turns: DemoTurn[] }) {
    this.clear();
    // Replay always starts from an empty transcript.
    this.emit({ type: "reset" });
    this.setState("ready");

    if (turns.length === 0) {
      this.setState("completed");
      return;
    }

    let cursor = 240;

    turns.forEach((turn, index) => {
      const lineId = `${this.info.id}-${index}`;

      if (turn.role === "caller") {
        this.after(cursor, () => this.setState("listening"));
        this.after(cursor + turn.ms, () =>
          this.emit({ type: "line", id: lineId, role: turn.role, text: turn.text })
        );
        cursor += turn.ms + 160;
      } else {
        this.after(cursor, () => this.setState("thinking"));
        this.after(cursor + THINKING_MS, () => {
          this.setState("speaking");
          this.emit({ type: "line", id: lineId, role: turn.role, text: turn.text });
        });
        cursor += Math.max(turn.ms, THINKING_MS + 600) + 160;
      }
    });

    this.after(cursor, () => this.setState("completed"));
  }

  stop() {
    this.clear();
    this.setState("stopped");
  }

  reset() {
    this.clear();
    this.state = "ready";
    this.emit({ type: "reset" });
    this.emit({ type: "state", state: "ready" });
  }

  dispose() {
    this.clear();
    this.listeners.clear();
  }
}

/**
 * Talks to the CenterAI API. Used only when an HTTP backend is configured AND the API
 * reports a production engine; every failure path falls back to the local simulator so a
 * visitor never sees a broken console.
 */
export class HttpVoiceProvider implements VoiceProvider {
  readonly info: VoiceProviderInfo = {
    id: "http",
    label: "HttpVoiceProvider",
    telephony: false,
    realtimeAudio: false,
    microphone: false,
    simulation: false,
  };

  private listeners = new Set<(event: VoiceProviderEvent) => void>();
  private fallback = new DemoVoiceProvider();
  private viaFallback = false;
  private cancelled = false;
  private timers: number[] = [];
  private controller: AbortController | null = null;

  constructor() {
    this.fallback.subscribe((event) => this.listeners.forEach((l) => l(event)));
  }

  subscribe(listener: (event: VoiceProviderEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: _Event) {
    if (this.viaFallback) return; // the fallback relays its own events
    this.listeners.forEach((l) => l(event));
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => {
      this.timers.push(window.setTimeout(resolve, ms));
    });
  }

  async start({ language, turns }: { language: string; turns: DemoTurn[] }) {
    this.cancelled = false;
    this.viaFallback = false;
    this.controller?.abort();
    this.controller = new AbortController();
    const api = createApiClient();
    const signal = this.controller.signal;

    try {
      const session = await api.startSession(
        { language: language as AgentLanguage, agentId: DEMO_AGENT_ID },
        signal
      );
      if (!session.ok) throw new Error(session.error.message);

      for (let i = 0; i < Math.min(turns.length / 2, session.data.turnCount); i += 1) {
        if (this.cancelled) return;
        const caller = turns[i * 2];
        this.emit({ type: "state", state: "listening" });
        if (caller) {
          this.emit({ type: "line", id: `http-${i}-caller`, role: "caller", text: caller.text });
          await this.wait(caller.ms);
        }
        if (this.cancelled) return;

        this.emit({ type: "state", state: "thinking" });
        const answer = await api.sendTurn(
          { sessionId: session.data.id, utterance: caller?.text },
          signal
        );
        if (!answer.ok) throw new Error(answer.error.message);

        this.emit({ type: "state", state: "speaking" });
        this.emit({
          type: "line",
          id: answer.data.turnId,
          role: "agent",
          text: answer.data.text,
        });
        await this.wait(Math.max(900, answer.data.durationMs || 1800));
      }

      if (this.cancelled) return;
      await api.endSession(session.data.id, signal);
      this.emit({ type: "state", state: "completed" });
    } catch (error) {
      if (this.cancelled || (error as Error)?.name === "AbortError") return;
      // Transparent degradation: same UI, same pacing, local simulator.
      this.viaFallback = true;
      this.emit({ type: "reset" });
      this.fallback.start({ language, turns });
    }
  }

  stop() {
    this.cancelled = true;
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    this.controller?.abort();
    if (this.viaFallback) this.fallback.stop();
    else this.emit({ type: "state", state: "stopped" });
  }

  reset() {
    this.cancelled = true;
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    this.controller?.abort();
    this.viaFallback = false;
    this.fallback.reset();
    this.emit({ type: "reset" });
    this.emit({ type: "state", state: "ready" });
  }

  dispose() {
    this.cancelled = true;
    this.controller?.abort();
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    this.listeners.clear();
    this.fallback.dispose();
  }
}

/* ── internal configuration seam ───────────────────────────────────── */

export type VoiceBackendKind = "auto" | "demo" | "http" | "realtime";

/** VITE_VOICE_BACKEND seeds the preference: auto | demo | http | realtime. */
let preference: VoiceBackendKind =
  (import.meta.env.VITE_VOICE_BACKEND as VoiceBackendKind | undefined) ?? "auto";

/** Lets an operator force an engine (or tests stub it) without touching the component. */
export function setVoiceBackend(kind: VoiceBackendKind) {
  preference = kind;
}

export type ResolvedBackend = "demo" | "http" | "realtime";

export function getVoiceBackend(): { preference: VoiceBackendKind; resolved: ResolvedBackend } {
  return { preference, resolved: resolveKind() };
}

/**
 * auto → realtime only when the server says it can authorize a session AND the browser can do
 * WebRTC + microphone; otherwise demo. Forcing "realtime" still degrades to the simulator at
 * runtime if the microphone or network refuses.
 */
function resolveKind(): ResolvedBackend {
  if (preference === "demo") return "demo";
  if (preference === "http") return "http";
  if (preference === "realtime") return "realtime";
  const mode = getVoiceMode();
  if (mode.realtime && mode.state === "connected") return "realtime";
  return API_BASE_URL && mode.state === "connected" && mode.mode === "production" ? "http" : "demo";
}

export function createVoiceProvider(): VoiceProvider {
  const kind = resolveKind();
  if (kind === "realtime") {
    return new OpenAIRealtimeVoiceProvider({ createFallback: () => new DemoVoiceProvider() });
  }
  if (kind === "http") return new HttpVoiceProvider();
  return new DemoVoiceProvider();
}

/** True when the console is driving a real microphone session rather than the simulator. */
export function isRealtimeBackend(): boolean {
  return resolveKind() === "realtime";
}

export { realtimeSupported } from "./realtimeVoice";
