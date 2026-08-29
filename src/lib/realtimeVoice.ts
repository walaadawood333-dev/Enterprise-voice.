/**
 * OpenAIRealtimeVoiceProvider — the browser half of real voice.
 *
 * Architecture (current OpenAI Realtime WebRTC flow, per platform.openai.com realtime guides):
 *   1. browser asks OUR server for a session          POST /api/voice/realtime/session
 *   2. server verifies agent + mode + OPENAI_API_KEY,  mints a short-lived ephemeral credential,
 *      returns ONLY { ephemeralKey, sdpUrl, model, voice, maxDurationSeconds }
 *   3. browser opens RTCPeerConnection, adds the mic track, creates the "oai-events" data channel,
 *      exchanges SDP with the provider, then configures the session over the data channel
 *   4. events drive the UI: speech_started → LISTENING, speech_stopped → THINKING,
 *      audio delta / transcript → SPEAKING, response.done → LISTENING again
 *
 * The OpenAI API key never reaches this file, the bundle, storage or a URL. If any step fails,
 * the provider hands the session to the injected demo fallback so the console keeps working.
 */

import type {
  DemoTurn,
  RealtimeSessionDto,
  VoiceProvider,
  VoiceProviderEvent,
  VoiceProviderInfo,
  VoiceState,
} from "../../shared/contracts";
import { api } from "@/api";

export type RealtimeNoticeCode =
  | "MIC_DENIED"
  | "MIC_MISSING"
  | "MIC_BUSY"
  | "UNSUPPORTED_BROWSER"
  | "NETWORK"
  | "SESSION_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "TIMEOUT"
  | "CLOSED";

export interface RealtimeDependencies {
  createFallback: () => VoiceProvider;
}

/** Cheap, honest capability check — no probing, no permission prompt. */
export function realtimeSupported(): { ok: boolean; reason?: string } {
  if (typeof window === "undefined") return { ok: false, reason: "no window" };
  if (typeof RTCPeerConnection !== "function") return { ok: false, reason: "WebRTC unavailable" };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: "getUserMedia unavailable" };
  if (!window.isSecureContext) return { ok: false, reason: "requires https or localhost" };
  return { ok: true };
}

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const languageLabel = (id: string) =>
  id === "ar" ? "Modern Standard Arabic" : id === "jo" ? "Jordanian Arabic (Amman)" : "English";

export class OpenAIRealtimeVoiceProvider implements VoiceProvider {
  private infoState: VoiceProviderInfo = {
    id: "openai-realtime",
    label: "OpenAIRealtimeVoiceProvider",
    telephony: false,
    realtimeAudio: true,
    microphone: true,
    simulation: false,
  };

  /** Readable view: reflects a demo fallback the moment one is engaged. */
  get info(): VoiceProviderInfo {
    return this.infoState;
  }

  private listeners = new Set<(event: VoiceProviderEvent) => void>();
  private fallbackUnsub: (() => void) | null = null;

  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private raf = 0;
  private timers: number[] = [];
  /** Typed-array view handed to the analyser; sized once per session. */
  private analyserBuf: Uint8Array<ArrayBuffer> | null = null;

  private viaFallback = false;
  private closing = false;
  private sessionId: string | null = null;
  private startedAt = 0;
  private onLevel: ((level: number) => void) | null = null;
  private agentText = "";
  private agentItemId: string | null = null;
  private state: VoiceState = "ready";
  private sessionConfig: RealtimeSessionDto | null = null;

  constructor(private readonly deps: RealtimeDependencies) {}

  subscribe(listener: (event: VoiceProviderEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: VoiceProviderEvent) {
    if (this.viaFallback) return; // the fallback relays its own events
    this.listeners.forEach((l) => l(event));
  }

  private setState(next: VoiceState) {
    if (this.state === next) return;
    this.state = next;
    this.emit({ type: "state", state: next });
  }

  private notice(code: RealtimeNoticeCode, message: string, recovered: boolean) {
    this.emit({ type: "notice", code, message, recovered });
  }

  private after(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  /* ── lifecycle ─────────────────────────────────────────────────────── */

  start({
    language,
    turns,
    onLevel,
  }: {
    language: string;
    turns: DemoTurn[];
    onLevel?: (level: number) => void;
  }) {
    this.onLevel = onLevel ?? null;
    const support = realtimeSupported();
    if (!support.ok) {
      this.degradeToDemo(language, turns, "UNSUPPORTED_BROWSER", supportReason(support.reason));
      return;
    }
    void this.run(language, turns);
  }

  /**
   * Permission first, credential second: a denied microphone must produce a clear message and a
   * Try Again — not a burned ephemeral session token and not a silently substituted demo.
   */
  private async preflightMicrophone(): Promise<void> {
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!perms?.query) return; // Safari/Firefox cannot report state up front; getUserMedia will.
    try {
      const status = await perms.query({ name: "microphone" as PermissionName });
      if (status.state === "denied") throw new Error("mic:NotAllowedError");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("mic:")) throw error;
      /* query unsupported here — fall through to getUserMedia */
    }
  }

  private async run(language: string, turns: DemoTurn[]) {
    try {
      await this.preflightMicrophone();
      const session = await api.startRealtimeSession({
        agentId: "centerai-demo-agent",
        language: language as RealtimeSessionDto["language"],
      });
      if (!session.ok) {
        this.degradeToDemo(
          language,
          turns,
          session.error.code === "PROVIDER_NOT_CONFIGURED" ? "PROVIDER_UNAVAILABLE" : "SESSION_REJECTED",
          session.error.message
        );
        return;
      }

      this.sessionConfig = session.data;
      this.sessionId = session.data.sessionId;
      this.startedAt = Date.now();

      /*
       * Credential expiry is honoured rather than discovered by failure: the browser stops the
       * leg ~30s before the provider's own deadline and hands the console back to a safe state.
       */
      const expiresAtMs = session.data.expiresAt ? Date.parse(session.data.expiresAt) : Number.NaN;
      if (Number.isFinite(expiresAtMs)) {
        const lifetimeMs = expiresAtMs - Date.now() - 30_000;
        if (lifetimeMs <= 0) {
          this.degradeToDemo(
            language,
            turns,
            "TIMEOUT",
            "The provider session credential had already expired, so the demo engine continued the conversation."
          );
          return;
        }
        this.after(lifetimeMs, () => {
          if (this.closing) return;
          this.notice(
            "TIMEOUT",
            "The provider session reached its time limit. The microphone was released and nothing was left dialling.",
            true
          );
          void this.teardown("completed");
          this.setState("completed");
        });
      }
      await this.connectPeer(session.data);
      this.setState("listening");

      // Hard cap: the provider expires sessions on its own; we also stop politely first.
      const maxMs = (session.data.maxDurationSeconds || 300) * 1000;
      this.after(maxMs, () => {
        if (this.closing) return;
        this.notice("TIMEOUT", "This demo session reached its time limit.", false);
        void this.teardown("completed");
        this.setState("completed");
      });
    } catch (error) {
      if (this.closing) return;
      const code = classifyError(error);
      if (code === "MIC_DENIED" || code === "MIC_MISSING" || code === "MIC_BUSY") {
        // Microphone problems must be explained, not papered over with a simulation.
        this.notice(code, micMessage(code), false);
        this.setState("error");
        void this.report("failed", code);
        return;
      }
      this.degradeToDemo(language, turns, code, safeMessage(error));
    }
  }

  private async connectPeer(session: RealtimeSessionDto) {
    // 1) microphone — permission is requested here, once, and only for the session.
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (error) {
      throw new Error(`mic:${(error as DOMException)?.name ?? "unknown"}`);
    }

    const pc = new RTCPeerConnection(ICE_CONFIG);
    this.pc = pc;

    // 2) agent audio playback (the provider delivers a media track; no manual decoding)
    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;
    this.audioEl.setAttribute("aria-hidden", "true");
    this.audioEl.style.display = "none";
    document.body.appendChild(this.audioEl);
    pc.ontrack = (event) => {
      this.audioEl!.srcObject = event.streams[0];
      void this.audioEl!.play().catch(() => undefined);
    };

    for (const track of this.stream.getAudioTracks()) pc.addTrack(track, this.stream);

    // 3) events channel
    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("datachannel-timeout")), 8000);
      dc.onopen = () => {
        window.clearTimeout(timer);
        resolve();
      };
      dc.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("datachannel-error"));
      };
    });
    dc.onmessage = (event) => this.handleEvent(event);
    dc.onclose = () => {
      if (!this.closing) this.setState("error");
    };

    pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      if (this.pc.connectionState === "failed" && !this.closing) {
        this.notice("NETWORK", "The realtime connection dropped. Check your network and try again.", false);
        this.setState("error");
        void this.report("failed", "connection_failed");
      }
    };

    // 4) SDP exchange with the provider, authenticated with the ephemeral key only
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch(session.sdpUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
    });
    if (!res.ok) throw new Error(`sdp:${res.status}`);
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });

    // 5) conversation configuration
    this.sendSessionUpdate(session, true);
    this.startLevelMetering();
  }

  /** Session payload. Falls back to a minimal shape if the provider rejects the full one. */
  private sendSessionUpdate(session: RealtimeSessionDto, withExtras: boolean) {
    const instructions =
      `You are the ${session.agentName ?? "CenterAI"} demonstration agent. ` +
      `The caller is speaking ${languageLabel(session.language)}: reply ONLY in that language, and do not ` +
      "mix languages unless the caller does. Be professional, concise and natural. Never claim to have " +
      "performed an action you did not perform, never invent customer data, balances, prices, reference " +
      "numbers or integrations, never quote performance or accuracy figures, and say plainly that you are " +
      "a demonstration agent when asked what you are.";

    const base = {
      type: "realtime",
      model: session.model,
      output_modalities: ["audio", "text"],
      instructions,
    } as Record<string, unknown>;

    const full = {
      ...base,
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24000 },
          turn_detection: { type: "semantic_vad" },
          ...(withExtras ? { transcription: { model: "gpt-4o-mini-transcribe" } } : {}),
        },
        output: { format: { type: "audio/pcm" }, voice: session.voice },
      },
    };

    this.send({ type: "session.update", session: full });
  }

  private send(payload: Record<string, unknown>) {
    if (this.dc?.readyState !== "open") return;
    try {
      this.dc.send(JSON.stringify(payload));
    } catch {
      /* a closed channel during teardown is expected */
    }
  }

  private handleEvent(event: MessageEvent<string>) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(event.data) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = String(data.type ?? "");

    switch (type) {
      case "input_audio_buffer.speech_started":
        this.stopPlayback();
        this.setState("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        this.setState("thinking");
        break;
      case "conversation.item.input_audio_transcription.completed":
        this.emit({
          type: "line",
          id: `caller-${Date.now()}`,
          role: "caller",
          text: String(data.transcript ?? "").trim(),
          final: true,
        });
        this.setState("thinking");
        break;
      case "response.created":
      case "response.output_item.added":
        this.setState("thinking");
        break;
      case "response.output_audio.delta":
      case "response.audio.delta":
        this.setState("speaking");
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta": {
        this.setState("speaking");
        this.agentText += String(data.delta ?? "");
        const itemId = String(data.item_id ?? "agent");
        this.agentItemId = itemId;
        this.emit({
          type: "line",
          id: `agent-${itemId}`,
          role: "agent",
          text: this.agentText,
          final: false,
        });
        break;
      }
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        const itemId = String(data.item_id ?? this.agentItemId ?? "agent");
        this.emit({
          type: "line",
          id: `agent-${itemId}`,
          role: "agent",
          text: String(data.transcript ?? this.agentText).trim(),
          final: true,
        });
        this.agentText = "";
        break;
      }
      case "response.done":
        this.setState("listening");
        break;
      case "rate_limits.updated":
      case "session.created":
      case "session.updated":
        break;
      case "error": {
        const message = String(
          (data.error as { message?: string } | undefined)?.message ?? "The voice service reported an error."
        );
        if (/session\.update|Invalid|unsupported field|Unknown|transcription/i.test(message)) {
          // Retry once without the optional transcription config, then keep going.
          if (this.sessionConfig) {
            this.sendSessionUpdate(this.sessionConfig, false);
            this.notice("PROVIDER_UNAVAILABLE", "Adjusted the session configuration to continue.", true);
            return;
          }
        }
        this.notice("PROVIDER_UNAVAILABLE", message.slice(0, 180), false);
        this.setState("error");
        void this.report("failed", "provider_error");
        break;
      }
      default:
        break;
    }
  }

  /* ── input level for the waveform (no polling, no React state) ─────── */
  private startLevelMetering() {
    if (!this.stream) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      const source = ctx.createMediaStreamSource(this.stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      this.analyserBuf = new Uint8Array(analyser.frequencyBinCount);

      const buf = this.analyserBuf;
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) {
          const v = (buf[i]! - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        this.onLevel?.(Math.min(1, rms * 3.2));
        if (!this.closing) this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    } catch {
      /* visual metering is optional; never fail a session over it */
    }
  }

  private stopPlayback() {
    if (this.audioEl && !this.audioEl.paused) this.audioEl.pause();
  }

  /* ── teardown ───────────────────────────────────────────────────────── */

  private async report(outcome: "completed" | "stopped" | "failed", reason?: string) {
    const id = this.sessionId;
    if (!id) return;
    this.sessionId = null;
    await api.endRealtimeSession({
      sessionId: id,
      outcome,
      durationSeconds: this.startedAt ? Math.round((Date.now() - this.startedAt) / 100) / 10 : undefined,
      ...(reason ? { reason } : {}),
    });
  }

  private teardown(outcome: "completed" | "stopped" | "failed") {
    this.closing = true;
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.onLevel?.(0);
    this.dc?.close();
    this.dc = null;
    this.pc?.getSenders().forEach((s) => s.track?.stop());
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.pc?.close();
    this.pc = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.audioEl?.remove();
    this.audioEl = null;
    void this.report(outcome);
  }

  stop() {
    if (this.viaFallback) {
      this.fallback().stop();
      return;
    }
    this.teardown("stopped");
    this.setState("stopped");
  }

  reset() {
    if (this.viaFallback) {
      const demo = this.fallback();
      demo.reset();
      return;
    }
    this.teardown("stopped");
    this.closing = false;
    this.state = "ready";
    this.agentText = "";
    this.emit({ type: "reset" });
    this.emit({ type: "state", state: "ready" });
  }

  dispose() {
    this.teardown("stopped");
    this.listeners.clear();
    this.fallbackUnsub?.();
    this.fallbackUnsub = null;
    this.fallbackInstance?.dispose();
    this.fallbackInstance = null;
  }

  /* ── demo fallback (keeps the console alive, visibly labelled) ─────── */

  private fallbackInstance: VoiceProvider | null = null;
  private fallback(): VoiceProvider {
    if (!this.fallbackInstance) {
      this.fallbackInstance = this.deps.createFallback();
      this.fallbackUnsub = this.fallbackInstance.subscribe((event) => {
        // Re-label the fallback so the console's status stays truthful.
        this.listeners.forEach((l) => l(event));
      });
    }
    return this.fallbackInstance;
  }

  private degradeToDemo(language: string, turns: DemoTurn[], code: RealtimeNoticeCode, message: string) {
    if (this.viaFallback) return;
    this.viaFallback = true;
    this.infoState = {
      ...this.infoState,
      label: "OpenAIRealtimeVoiceProvider → demo fallback",
      realtimeAudio: false,
      microphone: false,
      simulation: true,
    };
    this.notice(code, message, true);
    this.state = "ready";
    this.emit({ type: "reset" });
    const demo = this.fallback();
    demo.start({ language, turns });
    void this.report("failed", code);
  }
}

/* ── helpers: short, human, non-technical copy ───────────────────────── */

const supportReason = (reason?: string) =>
  `This browser cannot open a realtime voice session${reason ? ` (${reason})` : ""}. The demo version is running instead.`;

function micMessage(code: RealtimeNoticeCode): string {
  if (code === "MIC_MISSING") return "No microphone was found. Connect one and try again.";
  if (code === "MIC_BUSY") return "Your microphone is being used by another app. Close it and try again.";
  return "Microphone access is required to start the voice demo.";
}

function classifyError(error: unknown): RealtimeNoticeCode {
  const message = String((error as Error)?.message ?? error ?? "");
  if (message.startsWith("mic:NotAllowedError") || message.includes("Permission denied")) return "MIC_DENIED";
  if (message.startsWith("mic:NotFoundError") || message.startsWith("mic:DevicesNotFoundError")) return "MIC_MISSING";
  if (message.startsWith("mic:NotReadableError") || message.startsWith("mic:TrackStartError")) return "MIC_BUSY";
  if (message.startsWith("sdp:4") || message.includes("session")) return "SESSION_REJECTED";
  if (message.includes("Failed to fetch") || message.includes("network")) return "NETWORK";
  if (message.includes("datachannel")) return "PROVIDER_UNAVAILABLE";
  return "PROVIDER_UNAVAILABLE";
}

/** Never surface raw internals: trim, strip URLs and class names. */
function safeMessage(error: unknown): string {
  const raw = String((error as Error)?.message ?? error ?? "");
  const cleaned = raw.replace(/https?:\/\/\S+/g, "[endpoint]").slice(0, 160);
  if (/sdp:401|sdp:403/.test(cleaned)) return "The voice session credential was rejected. Running the demo instead.";
  if (/sdp:/.test(cleaned)) return "The voice service refused the connection. Running the demo instead.";
  return cleaned || "The voice session could not be started. Running the demo instead.";
}
