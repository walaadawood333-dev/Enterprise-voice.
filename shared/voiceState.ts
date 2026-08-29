/**
 * Real-time voice session state machine + language profiles + turn telemetry shape.
 *
 * Shared by the server orchestrator and the browser engine so both enforce the *same*
 * transitions — a client cannot drift into an illegal state, and a telephony transport added
 * later can reuse the same contract.
 */

import type { AgentLanguage } from "./contracts";

export const VOICE_STATES = [
  "READY",
  "LISTENING",
  "PROCESSING",
  "SPEAKING",
  "INTERRUPTED",
  "RECONNECTING",
  "COMPLETED",
  "FAILED",
] as const;

export type VoiceStateName = (typeof VOICE_STATES)[number];

/**
 * Allowed transitions. Anything not listed here is rejected with 409 by the orchestrator.
 * INTERRUPTED is the barge-in detour; RECONNECTING only exists to keep a live session alive
 * across a network blip without ever creating a duplicate VoiceSession.
 */
export const VOICE_TRANSITIONS: Record<VoiceStateName, readonly VoiceStateName[]> = {
  READY: ["LISTENING", "PROCESSING", "RECONNECTING", "FAILED", "COMPLETED"],
  LISTENING: ["PROCESSING", "READY", "RECONNECTING", "INTERRUPTED", "FAILED", "COMPLETED"],
  PROCESSING: ["SPEAKING", "READY", "LISTENING", "RECONNECTING", "FAILED", "COMPLETED"],
  SPEAKING: ["LISTENING", "INTERRUPTED", "READY", "RECONNECTING", "COMPLETED", "FAILED"],
  INTERRUPTED: ["LISTENING", "PROCESSING", "READY", "FAILED", "COMPLETED"],
  RECONNECTING: ["READY", "LISTENING", "PROCESSING", "SPEAKING", "FAILED", "COMPLETED"],
  COMPLETED: ["READY"],
  FAILED: ["READY", "RECONNECTING"],
};

/** Terminal-ish states that must not accept further turns. */
export const VOICE_CLOSED: readonly VoiceStateName[] = ["COMPLETED", "FAILED"];

export function canTransition(from: VoiceStateName, to: VoiceStateName): boolean {
  if (from === to) return true;
  return VOICE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: VoiceStateName, to: VoiceStateName): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid voice state transition: ${from} → ${to}`);
  }
}

/**
 * Language routing. One source of truth for STT locale, TTS locale and the reply-language rule,
 * so the agent's configuration — not a guess — decides all three.
 */
export interface VoiceLanguageProfile {
  id: AgentLanguage;
  label: string;
  /** BCP-47 hint for browser SpeechRecognition. */
  sttLang: string;
  /** BCP-47 hint for speechSynthesis. */
  ttsLang: string;
  /** Prefer a local/native voice for the target dialect when the OS exposes one. */
  ttsVoicePreference: string[];
  replyDirective: string;
  /**
   * Honest capability note surfaced in the UI. Dialect accuracy is not asserted here — it must be
   * measured against real audio before any claim is made.
   */
  capabilityNote: string;
}

export const VOICE_LANGUAGES: Record<AgentLanguage, VoiceLanguageProfile> = {
  en: {
    id: "en",
    label: "English",
    sttLang: "en-GB",
    ttsLang: "en-GB",
    ttsVoicePreference: ["en-GB", "en-US", "Google UK English", "Daniel", "Serena"],
    replyDirective:
      "Reply in professional international English. Do not switch languages unless the caller does.",
    capabilityNote: "English: full pipeline wired (STT · conversation · TTS).",
  },
  ar: {
    id: "ar",
    label: "Arabic",
    sttLang: "ar-SA",
    ttsLang: "ar-SA",
    ttsVoicePreference: ["ar-SA", "ar-AE", "ar-EG", "Google العربية", "Maged", "Salma"],
    replyDirective:
      "Reply only in Modern Standard Arabic suitable for enterprise conversations. Do not insert English words unless the caller used them first; keep product and technical names in their original form.",
    capabilityNote:
      "Arabic (MSA): pipeline wired. Recognition and voice quality depend on the browser and OS voice installed — not measured here, so no accuracy claim is made.",
  },
  jo: {
    id: "jo",
    label: "Jordanian Arabic",
    sttLang: "ar-JO",
    ttsLang: "ar-JO",
    ttsVoicePreference: ["ar-JO", "ar-IL", "ar-SA", "Maged", "Salma"],
    replyDirective:
      "Reply in professional Jordanian Arabic (Amman register): natural and businesslike, never slangy or street colloquial. Fall back to light MSA only where a Jordanian form would sound inappropriate for the sector. Do not mix in English unless the caller does.",
    capabilityNote:
      "Jordanian Arabic: dialect-aware routing, but browsers rarely expose an ar-JO voice — the engine falls back to the nearest Arabic voice. Recognition of Jordanian features is not verified; treat it as untested.",
  },
};

export const voiceProfile = (language: AgentLanguage): VoiceLanguageProfile =>
  VOICE_LANGUAGES[language] ?? VOICE_LANGUAGES.en;

/* ── turn telemetry: measured durations only, null where nothing was measured ── */

export const TURN_MARKERS = [
  "microphoneStart",
  "speechDetected",
  "transcriptionStart",
  "transcriptionComplete",
  "aiRequestStart",
  "firstAiResponse",
  "aiResponseComplete",
  "ttsStart",
  "audioPlaybackStart",
  "audioPlaybackComplete",
] as const;

export type TurnMarker = (typeof TURN_MARKERS)[number];

/** Millisecond offsets from the start of the turn, measured on the client clock. */
export type VoiceTurnMarkers = Partial<Record<TurnMarker, number>>;

export interface VoiceTurnTelemetry {
  sessionId: string;
  turnId: string;
  organizationId: string;
  agentId: string;
  language: AgentLanguage;
  provider: string;
  providerState: VoiceProviderState;
  /** Where the audio travelled: browser mic, provider WebRTC leg, or text only. */
  transport: "browser-webrtc" | "browser-buffered" | "text";
  markers: VoiceTurnMarkers;
  /** Derived from markers; null when the pair was never measured. */
  sttLatencyMs: number | null;
  llmLatencyMs: number | null;
  firstTokenMs: number | null;
  ttsLatencyMs: number | null;
  playbackMs: number | null;
  roundTripMs: number | null;
  interrupted: boolean;
  streamed: boolean;
  recordedAt: string;
}

export type VoiceProviderState = "PRIMARY" | "FALLBACK" | "UNAVAILABLE";

/**
 * Derives every figure from the reported markers. Missing markers stay null rather than being
 * estimated — the whole point is that these numbers are measured.
 */
export function deriveTurnTelemetry(input: {
  sessionId: string;
  turnId: string;
  organizationId: string;
  agentId: string;
  language: AgentLanguage;
  provider: string;
  providerState: VoiceProviderState;
  transport?: VoiceTurnTelemetry["transport"];
  markers: VoiceTurnMarkers;
  interrupted: boolean;
  streamed: boolean;
}): VoiceTurnTelemetry {
  const m = input.markers;
  const delta = (from?: number, to?: number) =>
    typeof from === "number" && typeof to === "number" && to >= from ? Math.round(to - from) : null;

  return {
    sessionId: input.sessionId,
    turnId: input.turnId,
    organizationId: input.organizationId,
    agentId: input.agentId,
    language: input.language,
    provider: input.provider,
    providerState: input.providerState,
    transport: input.transport ?? "browser-buffered",
    markers: { ...m },
    sttLatencyMs: delta(m.microphoneStart, m.transcriptionComplete) ?? delta(m.speechDetected, m.transcriptionComplete),
    llmLatencyMs: delta(m.aiRequestStart, m.aiResponseComplete),
    firstTokenMs: delta(m.aiRequestStart, m.firstAiResponse),
    ttsLatencyMs: delta(m.aiResponseComplete, m.ttsStart),
    playbackMs: delta(m.audioPlaybackStart, m.audioPlaybackComplete),
    roundTripMs: delta(m.microphoneStart, m.audioPlaybackComplete) ?? delta(m.transcriptionComplete, m.audioPlaybackStart),
    interrupted: input.interrupted,
    streamed: input.streamed,
    recordedAt: new Date().toISOString(),
  };
}

/**
 * Persisted as UsageEvent.metadata: turn id, transport, provider state and measured durations.
 * No transcript text, no provider payloads, no credentials — ever.
 */
export function telemetryMetadata(t: VoiceTurnTelemetry): Record<string, string | number | boolean | null> {
  return {
    turnId: t.turnId,
    sttMs: t.sttLatencyMs,
    llmMs: t.llmLatencyMs,
    firstTokenMs: t.firstTokenMs,
    ttsMs: t.ttsLatencyMs,
    playbackMs: t.playbackMs,
    rttMs: t.roundTripMs,
    provider: t.provider,
    providerState: t.providerState,
    transport: t.transport,
    language: t.language,
    interrupted: t.interrupted,
    streamed: t.streamed,
  };
}
