/**
 * Voice Activity Detection — provider-independent.
 *
 *   VadProvider
 *     ├── EnergyVadProvider   (this file: AnalyserNode RMS + hangover, no dependencies)
 *     └── FutureStreamVad     (WebRTC / PSTN / SIP media streams can implement the same events)
 *
 * Emits speech_start / speech_level / speech_end. Deliberately source-agnostic: it consumes an
 * AudioNode, so anything that can be turned into one — a mic stream, a remote WebRTC track, a
 * decoded telephony leg — plugs in unchanged.
 */

export interface VadEvents {
  speechStart: () => void;
  speechEnd: (info: { speechMs: number; silenceMs: number }) => void;
  level: (level: number) => void;
}

export interface VadProvider {
  readonly name: string;
  start(source: AudioNode, context: AudioContext): void;
  stop(): void;
  on<K extends keyof VadEvents>(event: K, handler: VadEvents[K]): () => void;
  /** True between speech_start and speech_end. */
  readonly speaking: boolean;
}

export interface EnergyVadOptions {
  /** RMS 0..1 above which we consider the caller to be speaking. */
  openThreshold?: number;
  /** RMS 0..1 below which a utterance may close (hysteresis avoids flapping). */
  closeThreshold?: number;
  /** Continuous silence required before speech_end, in ms. */
  trailingSilenceMs?: number;
  /** Ignore bursts shorter than this, in ms — filters clicks and plosives. */
  minSpeechMs?: number;
}

export class EnergyVadProvider implements VadProvider {
  readonly name = "EnergyVadProvider";
  private listeners: Partial<Record<keyof VadEvents, Set<() => void>>> = {};
  private analyser: AnalyserNode | null = null;
  private source: AudioNode | null = null;
  private frame = 0;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private speakingNow = false;
  private speechStartedAt = 0;
  private silentSince = 0;
  private readonly open: number;
  private readonly close: number;
  private readonly silenceMs: number;
  private readonly minSpeechMs: number;

  constructor(options: EnergyVadOptions = {}) {
    this.open = options.openThreshold ?? 0.035;
    this.close = options.closeThreshold ?? 0.018;
    this.silenceMs = options.trailingSilenceMs ?? 620;
    this.minSpeechMs = options.minSpeechMs ?? 180;
  }

  get speaking() {
    return this.speakingNow;
  }

  on<K extends keyof VadEvents>(event: K, handler: VadEvents[K]) {
    const set = (this.listeners[event] ??= new Set()) as Set<() => void>;
    set.add(handler as () => void);
    return () => set.delete(handler as () => void);
  }

  private emit<K extends keyof VadEvents>(event: K, ...args: Parameters<VadEvents[K]>) {
    (this.listeners[event] as Set<(...a: unknown[]) => void> | undefined)?.forEach((handler) =>
      handler(...args)
    );
  }

  start(source: AudioNode, context: AudioContext) {
    this.stop();
    if (context.state === "closed") {
      throw new Error("The audio context is closed — create a new session to resume detection.");
    }
    this.source = source;
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    this.analyser = analyser;
    this.buffer = new Float32Array(analyser.fftSize);
    this.speakingNow = false;
    this.silentSince = 0;
    this.speechStartedAt = 0;

    const tick = () => {
      const node = this.analyser;
      const data = this.buffer;
      if (!node || !data) return;
      node.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i]! * data[i]!;
      const rms = Math.sqrt(sum / data.length);
      const now = performance.now();
      this.emit("level", Math.min(1, rms * 3.2));

      if (!this.speakingNow && rms >= this.open) {
        this.speakingNow = true;
        this.speechStartedAt = now;
        this.silentSince = 0;
        this.emit("speechStart");
      } else if (this.speakingNow) {
        if (rms >= this.close) {
          this.silentSince = 0;
        } else {
          if (!this.silentSince) this.silentSince = now;
          const silence = now - this.silentSince;
          if (silence >= this.silenceMs) {
            const speechMs = now - this.speechStartedAt;
            this.speakingNow = false;
            if (speechMs >= this.minSpeechMs) {
              this.emit("speechEnd", { speechMs, silenceMs: Math.round(silence) });
            } else {
              // Too short to count as an utterance: treat it as noise, no event.
              this.emit("speechEnd", { speechMs: 0, silenceMs: Math.round(silence) });
            }
          }
        }
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    try {
      this.source?.disconnect();
    } catch {
      /* already detached */
    }
    this.analyser?.disconnect();
    this.analyser = null;
    this.source = null;
    this.buffer = null;
    this.speakingNow = false;
  }
}
