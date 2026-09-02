/**
 * MediaBridge abstraction — provider-independent, transport-independent media routing.
 *
 * This module defines the contract that a future media processing layer will implement.
 * It is NOT connected to any actual audio processing in this phase.
 *
 * Architectural position:
 *   Provider Media (RTP/WebSocket/WebRTC)
 *         ↓
 *   MediaBridge              (this interface)
 *         ↓
 *   TelephonyGateway         (call→session mapping)
 *         ↓
 *   Voice Orchestrator       (existing AI pipeline)
 *
 * Deliberate non-implementations:
 *   ✗ No RTP processing
 *   ✗ No audio codec handling
 *   ✗ No SIP media negotiation
 *   ✗ No connection to OpenAI Realtime
 *   ✗ No connection to Twilio Media Streams
 *   ✗ No fake audio generation
 *
 * This exists so the architecture is settled before a real media adapter is written.
 */

import type { AgentLanguage } from "../../shared/contracts";

/**
 * Opaque handle to a media stream. The bridge does not interpret audio — it routes handles.
 * Implementations will map this to RTP sessions, WebSocket streams, or provider-specific IDs.
 */
export type MediaStreamHandle = string;

/**
 * What a media bridge knows about a connected stream.
 * No audio samples are ever exposed here — only metadata.
 */
export interface MediaStreamInfo {
  handle: MediaStreamHandle;
  callId: string;
  organizationId: string;
  /** Direction of audio relative to the caller. */
  direction: "inbound" | "outbound" | "bidirectional";
  /** Transport the provider uses to deliver media. */
  transport: "rtp" | "websocket" | "webrtc" | "none" | "unknown";
  /** Whether the bridge is actively forwarding audio for this stream. */
  active: boolean;
  /** Codec negotiated with the provider, if known. */
  codec: string | null;
  /** Sample rate in Hz, if known. */
  sampleRate: number | null;
}

/**
 * Configuration for a media bridge instance.
 * Each provider adapter supplies its own bridge configuration.
 */
export interface MediaBridgeConfig {
  /** Maximum concurrent streams this bridge can handle. */
  maxConcurrentStreams: number;
  /** Whether the bridge should attempt to negotiate media on call answer. */
  autoNegotiate: boolean;
  /** Target latency for media forwarding (advisory, not guaranteed). */
  targetLatencyMs: number;
}

/**
 * The MediaBridge contract.
 *
 * Future implementations will:
 *   - Accept media from a telephony provider (RTP, WebSocket, etc.)
 *   - Route it to the Voice Orchestrator for STT → LLM → TTS processing
 *   - Return synthesized audio back to the provider for playback
 *
 * In this phase, the interface exists to lock the architecture.
 * The default implementation rejects all operations — it is a placeholder, not a simulator.
 */
export interface MediaBridge {
  readonly name: string;
  readonly config: MediaBridgeConfig;

  /** True when the bridge has a working media path. Always false in this phase. */
  available(): boolean;

  /**
   * Request a media stream for a call.
   * Returns a handle that can be used to route audio to/from the Voice Orchestrator.
   * Not implemented — throws if called.
   */
  connectStream(input: {
    callId: string;
    organizationId: string;
    language: AgentLanguage;
  }): Promise<MediaStreamInfo>;

  /**
   * Disconnect a media stream. Called when the call ends.
   * Not implemented — throws if called.
   */
  disconnectStream(handle: MediaStreamHandle): Promise<void>;

  /**
   * Get information about an active stream.
   * Not implemented — throws if called.
   */
  getStreamInfo(handle: MediaStreamHandle): Promise<MediaStreamInfo | null>;
}

/**
 * Placeholder MediaBridge — exists to satisfy the type contract.
 * All operations throw PROVIDER_NOT_IMPLEMENTED to prevent accidental use.
 */
export class NullMediaBridge implements MediaBridge {
  readonly name = "NullMediaBridge";
  readonly config: MediaBridgeConfig = {
    maxConcurrentStreams: 0,
    autoNegotiate: false,
    targetLatencyMs: 0,
  };

  available(): boolean {
    return false;
  }

  async connectStream(): Promise<MediaStreamInfo> {
    throw new Error("MEDIA_BRIDGE_NOT_IMPLEMENTED: Live media processing is not available in this build.");
  }

  async disconnectStream(): Promise<void> {
    throw new Error("MEDIA_BRIDGE_NOT_IMPLEMENTED: Live media processing is not available in this build.");
  }

  async getStreamInfo(): Promise<MediaStreamInfo | null> {
    return null;
  }
}
