/**
 * Client audio session manager — the single owner of microphone and playback resources.
 *
 * Guards against the four classic leaks: a second getUserMedia stream while one is live,
 * two TTS utterances overlapping, an AudioContext left running after unmount, and a
 * "zombie" session that keeps the mic open when the tab is hidden or closed.
 */

/** Payload per event; listeners are plain callbacks. */
export interface AudioSessionManagerEvents {
  level: number;
  muted: boolean;
  speaking: boolean;
  error: string;
}

type Listener = (payload: unknown) => void;

const safeCancelTts = () => {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* nothing to cancel */
    }
  }
};

export class AudioSessionManager {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private frame = 0;
  private muted = false;
  private speaking = false;
  private disposed = false;
  private listeners = new Map<keyof AudioSessionManagerEvents, Set<Listener>>();
  private visibilityHandler: (() => void) | null = null;
  private unloadHandler: (() => void) | null = null;

  /** True while this manager owns the microphone. */
  get hasMicrophone() {
    return this.stream !== null;
  }

  get isMuted() {
    return this.muted;
  }

  /** True while an utterance is being spoken through browser TTS. */
  get isSpeaking() {
    return this.speaking;
  }

  on<K extends keyof AudioSessionManagerEvents>(
    event: K,
    handler: (payload: AudioSessionManagerEvents[K]) => void
  ) {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(handler as Listener);
    this.listeners.set(event, set);
    return () => set.delete(handler as Listener);
  }

  private emit<K extends keyof AudioSessionManagerEvents>(event: K, payload: AudioSessionManagerEvents[K]) {
    this.listeners.get(event)?.forEach((handler) => handler(payload));
  }

  private ensureContext(): AudioContext {
    if (this.context && this.context.state !== "closed") return this.context;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("WebAudio is unavailable in this browser.");
    this.context = new Ctor();
    return this.context;
  }

  /**
   * Starts the microphone exactly once. A second call while a stream is live reuses the same
   * stream instead of prompting again or leaking another track.
   */
  async startMicrophone(): Promise<{ stream: MediaStream; source: MediaStreamAudioSourceNode; context: AudioContext }> {
    if (this.disposed) throw new Error("This audio session was already closed.");
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("No microphone API in this browser.");

    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const context = this.ensureContext();
      if (context.state === "suspended") await context.resume().catch(() => undefined);
      this.source = context.createMediaStreamSource(this.stream);
      this.gain = context.createGain();
      this.gain.gain.value = this.muted ? 0 : 1;
      this.source.connect(this.gain);
      this.attachLifecycleHandlers();
      this.startLevelMeter(this.gain);
    }

    return { stream: this.stream, source: this.source!, context: this.context! };
  }

  /** The node the VAD should observe (post-gain, so muting also silences detection). */
  get inputNode(): AudioNode | null {
    return this.gain ?? this.source;
  }

  get audioContext(): AudioContext | null {
    return this.context;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.gain && this.context) {
      this.gain.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.01);
    }
    // Also flip the track flag so nothing upstream can read samples while muted.
    this.stream?.getAudioTracks().forEach((track) => (track.enabled = !muted));
    this.emit("muted", muted);
  }

  toggleMuted() {
    this.setMuted(!this.muted);
  }

  /**
   * Speaks one utterance. Any in-flight utterance is cancelled first, so replies never overlap.
   * `onEnd` fires for playback completion so the state machine can leave SPEAKING.
   */
  speak(options: { text: string; lang: string; voiceHint?: string[]; onEnd?: () => void; onStart?: () => void }) {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !options.text.trim()) {
      options.onEnd?.();
      return { supported: false as const };
    }

    safeCancelTts();
    const utterance = new SpeechSynthesisUtterance(options.text);
    utterance.lang = options.lang;
    const voices = window.speechSynthesis.getVoices?.() ?? [];
    const preferred =
      voices.find((voice) =>
        options.voiceHint?.some((hint) => voice.lang?.toLowerCase().startsWith(hint.toLowerCase().slice(0, 5)) || voice.name.toLowerCase().includes(hint.toLowerCase()))
      ) ??
      voices.find((voice) => voice.lang?.toLowerCase() === options.lang.toLowerCase()) ??
      voices.find((voice) => voice.lang?.toLowerCase().startsWith(options.lang.slice(0, 2)));
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => {
      this.speaking = true;
      this.emit("speaking", true);
      options.onStart?.();
    };
    const finish = () => {
      if (!this.speaking) return;
      this.speaking = false;
      this.emit("speaking", false);
      options.onEnd?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    try {
      window.speechSynthesis.speak(utterance);
      return { supported: true as const };
    } catch (error) {
      this.emit("error", `Could not start playback: ${(error as Error)?.message ?? "unknown"}`);
      finish();
      return { supported: false as const };
    }
  }

  /**
   * Fully releases the microphone: stops every track (which ends the OS-level "recording"
   * indicator and the granted-permission usage), detaches analysis nodes and closes the
   * level loop. Playback is cancelled first so nothing is left speaking into a dead session.
   * The manager stays usable — a later startMicrophone() opens a fresh stream.
   */
  releaseMicrophone() {
    this.stopPlayback();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    try {
      this.source?.disconnect();
      this.gain?.disconnect();
      this.analyser?.disconnect();
    } catch {
      /* nodes already detached */
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.source = null;
    this.gain = null;
    this.analyser = null;
    this.speaking = false;
    this.muted = false;
    this.emit("muted", false);
  }

  /** True while the microphone permission is actively held by this session. */
  get microphoneActive() {
    return this.stream !== null;
  }

  /** Stop only what is currently playing; the microphone stays open. */
  stopPlayback() {
    safeCancelTts();
    if (this.speaking) {
      this.speaking = false;
      this.emit("speaking", false);
    }
  }

  private startLevelMeter(node: AudioNode) {
    if (!this.context) return;
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;
    node.connect(analyser);
    this.analyser = analyser;
    const buffer = new Uint8Array(analyser.fftSize);

    const tick = () => {
      if (this.disposed || !this.analyser) return;
      this.analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const value = (buffer[i]! - 128) / 128;
        sum += value * value;
      }
      this.emit("level", Math.min(1, Math.sqrt(sum / buffer.length) * 3.2));
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private attachLifecycleHandlers() {
    if (this.visibilityHandler || typeof document === "undefined") return;
    this.visibilityHandler = () => {
      // Hidden tab: stop talking and mute input, but keep the session row alive.
      if (document.hidden) {
        this.stopPlayback();
        if (!this.muted) this.setMuted(true);
      }
    };
    this.unloadHandler = () => this.dispose();
    document.addEventListener("visibilitychange", this.visibilityHandler);
    window.addEventListener("pagehide", this.unloadHandler);
  }

  private detachLifecycleHandlers() {
    if (typeof document !== "undefined" && this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (typeof window !== "undefined" && this.unloadHandler) {
      window.removeEventListener("pagehide", this.unloadHandler);
      this.unloadHandler = null;
    }
  }

  /** Releases every audio resource. Idempotent — safe to call from unmount and pagehide. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    safeCancelTts();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    try {
      this.source?.disconnect();
      this.gain?.disconnect();
      this.analyser?.disconnect();
    } catch {
      /* nodes already detached */
    }
    this.source = null;
    this.gain = null;
    this.analyser = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.speaking = false;
    this.listeners.clear();
    this.detachLifecycleHandlers();
  }
}
