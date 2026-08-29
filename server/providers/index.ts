/**
 * Voice provider abstraction — STT / LLM / TTS behind one engine contract.
 *
 *   VoiceEngine
 *     ├── DemoScriptEngine    ← implemented: fixed scenario turns, no network, no audio
 *     └── ProductionVoiceEngine ← interface + not-implemented guards only (this phase)
 *
 * A real deployment supplies an STT/LLM/TTS triple through environment configuration; the
 * orchestrator below is the only place that knows which engine is active.
 */

import type { AgentLanguage, EngineMode } from "../../shared/contracts";
import { DEMO_SCENARIOS, type DemoScenario } from "../../shared/demo";
import type { ServerEnv } from "../config/env";
import { ApiError, providerNotConfigured } from "../lib/observability";

export interface SessionCreateInput {
  sessionId: string;
  organizationId: string;
  agentId: string;
  language: AgentLanguage;
}

export interface TranscribeInput {
  sessionId: string;
  /** Audio handles are opaque ids; the demo engine never receives or stores audio. */
  audioRef?: string;
  /** Text input used by the browser demo and by tests. */
  utterance?: string;
}

export interface GenerateInput {
  sessionId: string;
  utterance: string;
  language: AgentLanguage;
  systemPrompt: string;
}

export interface SynthesizeInput {
  sessionId: string;
  text: string;
  voice: string;
  language: AgentLanguage;
}

export interface EngineTurn {
  text: string;
  /** Wall-clock the phase is expected to occupy — used for metering, never for a public claim. */
  durationMs: number;
  done: boolean;
}

export interface EngineUsage {
  turns: number;
  characters: number;
  audioSeconds: number;
}

export interface VoiceEngine {
  readonly mode: EngineMode;
  readonly name: string;
  readonly capabilities: {
    telephony: boolean;
    realtimeAudio: boolean;
    microphone: boolean;
    /** True when responses are scripted rather than model-generated. */
    simulation: boolean;
  };
  createSession(input: SessionCreateInput): { scenario: DemoScenario };
  /** STT boundary: audio in → text out. */
  transcribe(input: TranscribeInput): EngineTurn;
  /** LLM boundary: text in → answer out. */
  generateResponse(input: GenerateInput): EngineTurn;
  /** TTS boundary: text out → audio handle + accounting. */
  synthesize(input: SynthesizeInput): { audioRef: string | null; characters: number; durationMs: number };
  endSession(input: { sessionId: string }): EngineUsage;
}

interface DemoCursor {
  language: AgentLanguage;
  index: number;
  turns: number;
  characters: number;
  audioMs: number;
  startedAt: number;
}

/**
 * Plays the shared scripted scenario. Same copy the on-page demo uses, so both paths
 * stay honest and identical from the visitor's point of view.
 */
export class DemoScriptEngine implements VoiceEngine {
  readonly mode = "demo" as const;
  readonly name = "DemoScriptEngine";
  readonly capabilities = {
    telephony: false,
    realtimeAudio: false,
    microphone: false,
    simulation: true,
  };

  private cursors = new Map<string, DemoCursor>();

  createSession({ sessionId, language }: SessionCreateInput) {
    const scenario = DEMO_SCENARIOS[language] ?? DEMO_SCENARIOS.en;
    this.cursors.set(sessionId, {
      language,
      index: 0,
      turns: 0,
      characters: 0,
      audioMs: 0,
      startedAt: Date.now(),
    });
    return { scenario };
  }

  private cursor(sessionId: string): DemoCursor {
    const cursor = this.cursors.get(sessionId);
    if (!cursor) {
      throw new ApiError("SESSION_ERROR", "Unknown or expired demo session.", { status: 404 });
    }
    return cursor;
  }

  private scenarioFor(sessionId: string): DemoScenario {
    const cursor = this.cursor(sessionId);
    return DEMO_SCENARIOS[cursor.language] ?? DEMO_SCENARIOS.en;
  }

  transcribe({ sessionId, utterance }: TranscribeInput): EngineTurn {
    const scenario = this.scenarioFor(sessionId);
    const cursor = this.cursor(sessionId);
    const next = scenario.turns[cursor.index];
    const isCallerTurn = next?.role === "caller";
    if (isCallerTurn) cursor.index += 1;
    cursor.turns += 1;
    const text = (utterance?.trim() || (isCallerTurn ? (next?.text ?? "") : "")).slice(0, 2000);
    if (text) cursor.characters += text.length;
    return {
      text,
      durationMs: isCallerTurn ? (next?.ms ?? 900) : 300,
      done: cursor.index >= scenario.turns.length,
    };
  }

  generateResponse({ sessionId }: GenerateInput): EngineTurn {
    const scenario = this.scenarioFor(sessionId);
    const cursor = this.cursor(sessionId);
    const next = scenario.turns[cursor.index];
    if (!next || next.role !== "agent") {
      cursor.index = scenario.turns.length;
      return { text: "", durationMs: 0, done: true };
    }
    cursor.index += 1;
    cursor.audioMs += next.ms;
    return { text: next.text, durationMs: next.ms, done: cursor.index >= scenario.turns.length };
  }

  synthesize({ sessionId, text }: SynthesizeInput) {
    const cursor = this.cursors.get(sessionId);
    const speakingMs = cursor && cursor.index > 0 ? Math.max(600, Math.round(text.length * 26)) : 0;
    if (cursor) cursor.characters += text.length;
    // No audio is produced; audioRef stays null on purpose.
    return { audioRef: null, characters: text.length, durationMs: speakingMs };
  }

  endSession({ sessionId }: { sessionId: string }): EngineUsage {
    const cursor = this.cursors.get(sessionId);
    const scenario = this.scenarioFor(sessionId);
    const done = cursor ? cursor.index >= scenario.turns.length : false;
    return {
      turns: cursor?.turns ?? 0,
      characters: cursor?.characters ?? 0,
      audioSeconds: Math.round(((cursor?.audioMs ?? 0) + (Date.now() - (cursor?.startedAt ?? Date.now()))) / 100) / 10,
      ...(done ? {} : {}),
    };
  }
}

/**
 * Intentionally NOT implemented in this phase.
 * It exists so the wiring, capability negotiation and error surface are settled now:
 * STT/LLM/TTS adapters get implemented here without touching routes, services or the UI.
 */
export class ProductionVoiceEngine implements VoiceEngine {
  readonly mode = "production" as const;
  readonly name: string;
  readonly capabilities = {
    telephony: false,
    realtimeAudio: false,
    microphone: false,
    simulation: false,
  };

  constructor(private readonly providers: ServerEnv["providers"]) {
    this.name = `ProductionVoiceEngine(${providers.stt.name}/${providers.llm.name}/${providers.tts.name})`;
  }

  private unavailable(): never {
    throw new ApiError(
      "PROVIDER_NOT_IMPLEMENTED",
      "Production voice engine adapter is not implemented in this build. Falling back to the demo engine is expected.",
      { internal: this.providers }
    );
  }

  createSession(): { scenario: DemoScenario } {
    this.unavailable();
  }
  transcribe(): EngineTurn {
    this.unavailable();
  }
  generateResponse(): EngineTurn {
    this.unavailable();
  }
  synthesize(): { audioRef: string | null; characters: number; durationMs: number } {
    this.unavailable();
  }
  endSession(): EngineUsage {
    this.unavailable();
  }
}

/**
 * Engine selection.
 *
 *   APP_MODE=demo (default)          → DemoScriptEngine, no credential is ever read or required
 *   APP_MODE=production + full keys  → ProductionVoiceEngine (adapters still pending → 501)
 *   APP_MODE=production, keys missing→ falls back to demo AND reports CONFIG_INVALID on /api/health
 *
 * No provider call is made in any other combination: with no key present this function cannot
 * return anything but the demo engine, so a misconfigured deployment degrades instead of dialling
 * out with empty credentials.
 */
export function resolveEngine(env: ServerEnv): VoiceEngine {
  const productionEligible =
    env.appMode === "production" &&
    env.mode === "production" &&
    env.voice.providerKeyPresent &&
    (env.llm.openAiKeyPresent || env.llm.anthropicKeyPresent);

  if (!productionEligible) {
    if (env.appMode === "production") throw providerNotConfigured();
    return new DemoScriptEngine();
  }

  // Fail safe: a half-configured provider set must never look like a working voice line.
  if (!env.providers.stt.keyPresent || !env.providers.llm.keyPresent || !env.providers.tts.keyPresent) {
    throw providerNotConfigured();
  }
  return new ProductionVoiceEngine(env.providers);
}

/** Whether a model provider key exists at all — guards every outbound call site. */
export function canCallModelProvider(env: ServerEnv): boolean {
  return env.appMode === "production" && (env.llm.openAiKeyPresent || env.llm.anthropicKeyPresent);
}

