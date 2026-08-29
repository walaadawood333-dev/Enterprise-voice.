/**
 * Voice Execution Engine contracts.
 *
 * Shared by the server orchestrator, the API routes and the Studio client, so no layer has to
 * know which provider is speaking. Keeping these in `shared/` also means the provider-specific
 * code (OpenAI, browser Web Speech) never leaks into component props.
 */

import type { AgentLanguage, AgentStatusName, MessageRole, SessionStatus } from "./contracts";
import type { VoiceProviderState, VoiceStateName, VoiceTurnMarkers, VoiceTurnTelemetry } from "./voiceState";

export type VoiceEngineMode = "demo" | "openai";

/** What the orchestrator needs from a persisted agent, in one flat shape. */
export interface AgentRuntimeConfig {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  industry: string;
  language: AgentLanguage;
  voice: string;
  systemPrompt: string;
  welcomeMessage: string;
  status: AgentStatusName;
}

export interface VoiceSessionRecord {
  id: string;
  organizationId: string;
  agentId: string;
  agentName: string;
  agentStatus: AgentStatusName;
  userId: string | null;
  language: AgentLanguage;
  status: SessionStatus;
  /** Studio Test Mode runs a draft agent; a normal session does not. */
  testMode: boolean;
  engine: VoiceEngineMode;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  messageCount: number;
  /** Real-time state machine position — see shared/voiceState.ts. */
  state: VoiceStateName;
  providerState: VoiceProviderState;
}

export interface VoiceTranscriptMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  /** Provider latency or generated pause; never presented as a measured performance figure. */
  latencyMs?: number | null;
}

export interface CreateVoiceSessionRequest {
  agentId: string;
  /** Studio Test Mode explicitly set by the dashboard; ignored for non-draft agents. */
  testMode?: boolean;
  language?: AgentLanguage;
}

export interface CreateVoiceSessionResponse {
  session: VoiceSessionRecord;
  /** The agent's opening line, persisted as the first assistant message. */
  greeting: VoiceTranscriptMessage;
  engine: VoiceEngineMode;
  /** True when an already-open session was adopted instead of creating a duplicate. */
  resumed: boolean;
  /** Why a demo engine answered instead of the configured provider, when that happens. */
  fallbackReason?: string;
}

export interface VoiceInputRequest {
  /** Transcript text. Raw microphone audio is never sent or stored in this phase. */
  text: string;
}

export interface VoiceInputResponse {
  userMessage: VoiceTranscriptMessage;
  assistantMessage: VoiceTranscriptMessage;
  session: VoiceSessionRecord;
  engine: VoiceEngineMode;
  /** Client-side hint: speak the reply with browser TTS when supported. */
  shouldSpeak: boolean;
  /** Server-measured timings for this turn; null values mean "not measured". */
  telemetry?: VoiceTurnTelemetry;
  fallbackReason?: string;
}

export interface VoiceStreamFrame {
  type: "meta" | "delta" | "done" | "error" | "state";
  turnId?: string;
  delta?: string;
  state?: VoiceStateName;
  providerState?: VoiceProviderState;
  message?: VoiceTranscriptMessage;
  userMessage?: VoiceTranscriptMessage;
  session?: VoiceSessionRecord;
  telemetry?: VoiceTurnTelemetry;
  /** Safe, human message. Provider bodies are never forwarded. */
  error?: string;
}

export interface VoiceTelemetryRequest {
  turnId: string;
  markers: VoiceTurnMarkers;
  interrupted?: boolean;
  streamed?: boolean;
}

export interface VoiceCancelRequest {
  turnId?: string;
  reason?: "barge_in" | "user_stop" | "network";
}

export interface EndVoiceSessionRequest {
  outcome?: "completed" | "failed" | "stopped";
  reason?: string;
}

export interface VoiceSessionDetail extends VoiceSessionRecord {
  messages: VoiceTranscriptMessage[];
  /** Persisted turn telemetry, newest last. Empty until turns are actually measured. */
  telemetry: VoiceTurnTelemetry[];
}

export interface VoiceEndResponse {
  session: VoiceSessionRecord;
  durationSeconds: number;
  messageCount: number;
}

export interface VoiceAnalyticsDto {
  organizationId: string;
  totalSessions: number;
  completedSessions: number;
  failedSessions: number;
  activeSessions: number;
  totalDurationSeconds: number;
  totalMessages: number;
  inputMessages: number;
  outputMessages: number;
  byLanguage: Record<string, number>;
  byAgent: Array<{ agentId: string; agentName: string; sessions: number; messages: number; durationSeconds: number }>;
  byDay: Array<{ date: string; sessions: number; messages: number; durationSeconds: number }>;
  /** Measured latency summary built from persisted telemetry; nulls mean "no samples". */
  latency: {
    samples: number;
    medianRoundTripMs: number | null;
    maxRoundTripMs: number | null;
    medianLlmMs: number | null;
    medianFirstTokenMs: number | null;
    interruptions: number;
    measured: boolean;
  };
  /** Present when there is nothing real to show, so the UI never invents a chart. */
  empty: boolean;
}

/** Provider-neutral capability flags surfaced to the Studio. */
export interface VoiceEngineCapabilities {
  configured: VoiceEngineMode;
  openAiReady: boolean;
  /** Streaming requires a Node/serverless adapter; the in-browser transport buffers instead. */
  streaming: boolean;
  providerState: VoiceProviderState;
  /** Telephony is intentionally absent from this phase; always false, never implied. */
  telephony: false;
  recording: false;
  storesAudio: false;
  model: string | null;
}
