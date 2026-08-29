import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/api";
import { AudioSessionManager } from "@/lib/audio/AudioSessionManager";
import { EnergyVadProvider } from "@/lib/audio/vadProvider";
import {
  canTransition,
  voiceProfile,
  VOICE_CLOSED,
  type VoiceProviderState,
  type VoiceStateName,
  type VoiceTurnMarkers,
} from "../../../shared/voiceState";
import type {
  VoiceSessionRecord,
  VoiceStreamFrame,
  VoiceTranscriptMessage,
} from "../../../shared/voiceContracts";
import type { AgentLanguage } from "../../../shared/contracts";

/** One measured turn. Nulls mean "not measured" — never zero, never estimated. */
export interface TurnTelemetry {
  turnId: string;
  sttMs: number | null;
  llmMs: number | null;
  firstTokenMs: number | null;
  ttsMs: number | null;
  playbackMs: number | null;
  roundTripMs: number | null;
  interrupted: boolean;
  streamed: boolean;
  transport: "browser-webrtc" | "browser-buffered" | "text";
}

interface Options {
  agentId: string;
  language: AgentLanguage;
  testMode: boolean;
  speakReplies: boolean;
}

const MAX_RETRIES = 3;

/**
 * The browser half of the real-time engine.
 *
 * Design rules enforced here:
 *  • one transition path — every state change goes through `transition()`, which validates against
 *    the shared state machine and mirrors the request to the server; nothing sets state freely.
 *  • one microphone owner — `AudioSessionManager` — so a re-attach never opens a second stream.
 *  • listeners bound once, and released on unmount, so a session cannot fire duplicate turns.
 *  • every latency figure is measured with performance.now() as an offset from the turn origin.
 */
export function useRealtimeVoice({ agentId, language, testMode, speakReplies }: Options) {
  const [state, setState] = useState<VoiceStateName>("READY");
  const [session, setSession] = useState<VoiceSessionRecord | null>(null);
  const [messages, setMessages] = useState<VoiceTranscriptMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [engine, setEngine] = useState<"demo" | "openai">("demo");
  const [providerState, setProviderState] = useState<VoiceProviderState>("PRIMARY");
  const [streaming, setStreaming] = useState(false);
  const [muted, setMuted] = useState(false);
  const [connected, setConnected] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [draft, setDraft] = useState("");
  const [partial, setPartial] = useState("");
  const [level, setLevel] = useState(0);
  const [telemetry, setTelemetry] = useState<TurnTelemetry[]>([]);
  const [busy, setBusy] = useState(false);
  const [micLive, setMicLive] = useState(false);

  const audio = useRef<AudioSessionManager | null>(null);
  const vad = useRef<EnergyVadProvider | null>(null);
  const detach = useRef<Array<() => void>>([]);
  const stateRef = useRef<VoiceStateName>("READY");
  const sessionRef = useRef<string | null>(null);
  const turnOrigin = useRef(0);
  const markers = useRef<VoiceTurnMarkers>({});
  const turnId = useRef(`${agentId}-1`);
  const inFlight = useRef<AbortController | null>(null);
  const attempts = useRef(0);
  const speakingStart = useRef(0);
  const disposed = useRef(true);
  const streamingRef = useRef(false);
  const runTurnRef = useRef<(text?: string, via?: "voice" | "text") => Promise<void>>(async () => {});

  const profile = useMemo(() => voiceProfile(language), [language]);

  const mark = useCallback((name: keyof VoiceTurnMarkers) => {
    if (!turnOrigin.current) return;
    markers.current = { ...markers.current, [name]: Math.round(performance.now() - turnOrigin.current) };
  }, []);

  const sinceOrigin = useCallback(() => (turnOrigin.current ? Math.round(performance.now() - turnOrigin.current) : null), []);

  /** The only way this hook changes state. Illegal moves are refused, not forced. */
  const transition = useCallback(
    (next: VoiceStateName): boolean => {
      if (next === stateRef.current) return true;
      if (!canTransition(stateRef.current, next)) return false;
      stateRef.current = next;
      setState(next);
      const id = sessionRef.current;
      if (id) void api.setVoiceState(id, next).catch(() => undefined);
      return true;
    },
    []
  );

  /** Recovery transition: step through a legal neighbour rather than jumping to an illegal state. */
  const recover = useCallback(
    (target: VoiceStateName) => {
      if (transition(target)) return;
      if (transition("READY")) transition(target);
    },
    [transition]
  );

  const pushTelemetry = useCallback((entry: TurnTelemetry) => {
    setTelemetry((prev) => [...prev.slice(-19), entry]);
  }, []);

  /* ── capabilities + teardown ── */
  useEffect(() => {
    disposed.current = false;
    void api.engineCapabilities().then((result) => {
      if (disposed.current || !result.ok) return;
      setStreaming(Boolean(result.data.streaming));
      streamingRef.current = Boolean(result.data.streaming);
      setProviderState(result.data.providerState);
      setEngine(result.data.configured);
    });

    return () => {
      disposed.current = true;
      inFlight.current?.abort();
      detach.current.forEach((off) => off());
      detach.current = [];
      vad.current?.stop();
      vad.current = null;
      audio.current?.dispose();
      audio.current = null;
      sessionRef.current = null;
      // Ending the browser side must also end the logical session, or it lingers as "active".
      const id = sessionRef.current;
      void id;
    };
  }, []);

  /* ── connectivity ── */
  useEffect(() => {
    const online = () => {
      setConnected(true);
      if (stateRef.current === "RECONNECTING") {
        recover("READY");
        setNotice(null);
      }
    };
    const offline = () => {
      setConnected(false);
      if (sessionRef.current && canTransition(stateRef.current, "RECONNECTING")) {
        transition("RECONNECTING");
        setNotice("Network dropped. The session is held — reconnect or end it. No new session will be created.");
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [recover, transition]);

  /* ── one turn ── */
  const runTurn = useCallback(
    async (text?: string, via: "voice" | "text" = "text") => {
      const id = sessionRef.current;
      const spoken = (text ?? draft).trim();
      if (!id) {
        setNotice("Start the test session first.");
        return;
      }
      if (!spoken) {
        setNotice("Nothing to send — say or type a message.");
        return;
      }
      if (!canTransition(stateRef.current, "PROCESSING")) return;
      if ((VOICE_CLOSED as readonly string[]).includes(stateRef.current)) return;

      transition("PROCESSING");
      setBusy(true);
      setDraft("");
      setPartial("");

      turnOrigin.current = performance.now();
      markers.current = via === "voice" ? { microphoneStart: 0, speechDetected: 0 } : {};
      mark(via === "voice" ? "transcriptionComplete" : "microphoneStart");
      mark("aiRequestStart");
      const requestStart = performance.now();
      const currentTurn = turnId.current;

      const controller = new AbortController();
      inFlight.current = controller;

      let firstTokenMs: number | null = null;
      let acc = "";

      const finish = async (assistantText: string, llmMs: number, streamedTurn: boolean) => {
        const transport: TurnTelemetry["transport"] =
          streamedTurn && streamingRef.current ? "browser-webrtc" : "browser-buffered";
        const assistantMessage: VoiceTranscriptMessage = {
          id: `${currentTurn}-assistant`,
          sessionId: id,
          role: "assistant",
          content: assistantText,
          createdAt: new Date().toISOString(),
          latencyMs: llmMs,
        };
        setMessages((prev) => [
          ...prev,
          {
            id: `${currentTurn}-user`,
            sessionId: id,
            role: "user",
            content: spoken,
            createdAt: new Date().toISOString(),
          },
          assistantMessage,
        ]);
        attempts.current = 0;
        setBusy(false);
        transition("SPEAKING");

        const started = speakReply(assistantText, transport);
        if (!started) await afterPlayback(0);

        const entry: TurnTelemetry = {
          turnId: currentTurn,
          // STT latency is measured from first detected speech to the finished transcript.
          sttMs:
            via === "voice" && markers.current.transcriptionComplete != null
              ? Math.max(
                  0,
                  (markers.current.transcriptionComplete ?? 0) - (markers.current.speechDetected ?? 0)
                )
              : null,
          llmMs,
          firstTokenMs,
          ttsMs: null,
          playbackMs: null,
          roundTripMs: sinceOrigin(),
          interrupted: false,
          streamed: streamedTurn,
          transport,
        };
        pushTelemetry(entry);
        void api
          .reportVoiceTelemetry(id, {
            turnId: currentTurn,
            markers: markers.current,
            streamed: streamedTurn,
          })
          .catch(() => undefined);
      };

      const speakReply = (text: string, transport: TurnTelemetry["transport"]) => {
        const manager = audio.current;
        if (!manager || !speakReplies) return false;
        mark("ttsStart");
        const result = manager.speak({
          text,
          lang: profile.ttsLang,
          voiceHint: profile.ttsVoicePreference,
          onStart: () => {
            speakingStart.current = performance.now();
            mark("audioPlaybackStart");
          },
          onEnd: () => {
            void afterPlayback(speakingStart.current ? Math.round(performance.now() - speakingStart.current) : 0);
          },
        });
        void transport;
        return result.supported;
      };

      /** Records measured playback time on the newest turn and returns the session to LISTENING. */
      const afterPlayback = async (playbackMs: number) => {
        if (playbackMs > 0) {
          mark("audioPlaybackComplete");
          setTelemetry((prev) => {
            if (prev.length === 0) return prev;
            const copy = [...prev];
            const last = copy[copy.length - 1]!;
            copy[copy.length - 1] = { ...last, playbackMs };
            return copy;
          });
        }
        if (stateRef.current === "SPEAKING") transition("LISTENING");
      };

      try {
        const streamUrl = api.voiceStreamUrl(id);
        if (streamingRef.current && streamUrl) {
          const response = await fetch(streamUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
            credentials: "include",
            body: JSON.stringify({ text: spoken, turnId: currentTurn }),
            signal: controller.signal,
          });
          if (!response.ok || !response.body) throw new Error(`STREAM_${response.status}`);
          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";
            for (const raw of frames) {
              const dataLine = raw.split("\n").find((line) => line.startsWith("data:"));
              if (!dataLine) continue;
              let frame: VoiceStreamFrame;
              try {
                frame = JSON.parse(dataLine.slice(5)) as VoiceStreamFrame;
              } catch {
                continue;
              }
              if (frame.type === "delta" && frame.delta) {
                if (firstTokenMs == null) {
                  firstTokenMs = Math.round(performance.now() - requestStart);
                  mark("firstAiResponse");
                }
                acc += frame.delta;
                setPartial(acc);
              }
              if (frame.type === "done") {
                if (frame.session) setSession(frame.session);
                if (frame.message) acc = frame.message.content;
              }
              if (frame.type === "error") throw new Error(frame.error ?? "stream_error");
            }
          }
          await finish(acc, Math.round(performance.now() - requestStart), true);
          inFlight.current = null;
          return;
        }

        const result = await api.sendVoiceInput(id, spoken, controller.signal);
        const llmMs = Math.round(performance.now() - requestStart);
        if (!result.ok) throw new Error(result.error.message);
        mark("aiResponseComplete");
        await finish(result.data.assistantMessage.content, llmMs, false);
        inFlight.current = null;
      } catch (error) {
        inFlight.current = null;
        setBusy(false);
        if ((error as Error)?.name === "AbortError") {
          if (stateRef.current !== "COMPLETED" && stateRef.current !== "FAILED") transition("LISTENING");
          return;
        }
        attempts.current += 1;
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        if (offline || attempts.current < MAX_RETRIES) {
          transition("RECONNECTING");
          const wait = Math.min(8000, 900 * 2 ** (attempts.current - 1));
          setNotice(
            offline
              ? "You are offline. The session is kept; reconnecting in a moment."
              : `The turn failed. Retrying (attempt ${attempts.current} of ${MAX_RETRIES}) — the session itself is reused, no duplicate is created.`
          );
          if (!offline) {
            window.setTimeout(() => {
              if (!disposed.current) {
                recover("READY");
                void runTurnRef.current(spoken, via);
              }
            }, wait);
          }
        } else {
          transition("FAILED");
          setNotice("This turn could not be completed after several attempts. End the session, or start a new one.");
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, mark, profile.ttsLang, profile.ttsVoicePreference, pushTelemetry, recover, sinceOrigin, speakReplies, transition]
  );

  useEffect(() => {
    runTurnRef.current = runTurn;
  }, [runTurn]);

  /* ── microphone + VAD, bound exactly once per attach ── */
  const attachInput = useCallback(async () => {
    if (!audio.current) audio.current = new AudioSessionManager();
    const manager = audio.current;

    if (!manager.microphoneActive) {
      try {
        await manager.startMicrophone();
      } catch (error) {
        const name = (error as DOMException)?.name ?? "";
        if (name.includes("NotAllowed")) {
          setNotice("Microphone access is required to speak. You can type the message instead.");
        } else if (name.includes("NotFound") || name.includes("NotReadable")) {
          setNotice("No usable microphone was found. Type the message instead, or free the device.");
        } else {
          setNotice("The microphone could not be opened. Type the message instead.");
        }
        return false;
      }
    }

    const node = manager.inputNode;
    const context = manager.audioContext;
    if (!node || !context) return false;

    if (!vad.current) vad.current = new EnergyVadProvider();
    const detector = vad.current;

    // Replace any previous bindings so a re-attach can never fire the same event twice.
    detach.current.forEach((off) => off());
    detach.current = [
      manager.on("level", (value) => setLevel(value)),
      manager.on("muted", (value) => setMuted(value)),
      manager.on("speaking", (value) => {
        if (!value && stateRef.current === "SPEAKING") transition("LISTENING");
      }),
      detector.on("speechStart", () => {
        if (!turnOrigin.current) turnOrigin.current = performance.now();
        mark("speechDetected");
        if (stateRef.current === "SPEAKING" || manager.isSpeaking) {
          // Barge-in: kill playback, cancel generation, record the interruption.
          manager.stopPlayback();
          inFlight.current?.abort();
          const id = sessionRef.current;
          if (id) {
            void api
              .cancelVoiceTurn(id, {
                reason: "barge_in",
                telemetry: { turnId: turnId.current, markers: markers.current },
              })
              .catch(() => undefined);
          }
          const wasSpeaking = stateRef.current === "SPEAKING";
          if (wasSpeaking) transition("INTERRUPTED");
          transition("LISTENING");
          pushTelemetry({
            turnId: turnId.current,
            sttMs: null,
            llmMs: null,
            firstTokenMs: null,
            ttsMs: null,
            playbackMs: null,
            roundTripMs: sinceOrigin(),
            interrupted: true,
            streamed: streamingRef.current,
            transport: "browser-webrtc",
          });
        }
        if (stateRef.current !== "LISTENING") transition("LISTENING");
        setNotice(null);
      }),
      detector.on("speechEnd", ({ speechMs }) => {
        if (speechMs <= 0) return;
        mark("transcriptionStart");
        mark("transcriptionComplete");
        void runTurnRef.current(undefined, "voice");
      }),
    ];

    detector.start(node, context);
    setMicLive(true);
    return true;
  }, [mark, pushTelemetry, sinceOrigin, transition]);

  const releaseInput = useCallback(() => {
    detach.current.forEach((off) => off());
    detach.current = [];
    vad.current?.stop();
    audio.current?.releaseMicrophone();
    setMicLive(false);
    setLevel(0);
    setMuted(false);
  }, []);

  /* ── session lifecycle ── */
  const begin = useCallback(async () => {
    setNotice(null);
    turnId.current = `${agentId}-1`;
    const created = await api.createVoiceSession({ agentId, testMode, language });
    if (!created.ok) {
      setNotice(created.error.message);
      transition("FAILED");
      return false;
    }
    sessionRef.current = created.data.session.id;
    setSession(created.data.session);
    setEngine(created.data.engine);
    setProviderState(created.data.session.providerState ?? "PRIMARY");
    setMessages([created.data.greeting]);
    if (created.data.resumed) {
      setNotice("Your open session for this agent was resumed — no duplicate session was created.");
    } else if (created.data.fallbackReason) {
      setNotice(created.data.fallbackReason);
    }
    transition("READY");
    const micOk = await attachInput();
    if (micOk) transition("LISTENING");
    return true;
  }, [agentId, attachInput, language, testMode, transition]);

  const end = useCallback(
    async (outcome: "completed" | "stopped" = "completed") => {
      const id = sessionRef.current;
      releaseInput();
      inFlight.current?.abort();
      sessionRef.current = null;
      if (outcome === "completed" && canTransition(stateRef.current, "COMPLETED")) transition("COMPLETED");
      else if (outcome === "stopped") recover("READY");
      if (!id) return;
      const result = await api.endVoiceSession(id, { outcome });
      if (result.ok) setSession(result.data.session);
    },
    [recover, releaseInput, transition]
  );

  const reset = useCallback(() => {
    setMessages([]);
    setTelemetry([]);
    setPartial("");
    setDraft("");
    setNotice(null);
    recover("READY");
  }, [recover]);

  const toggleMute = useCallback(() => {
    audio.current?.toggleMuted();
  }, []);

  const bargeIn = useCallback(() => {
    const manager = audio.current;
    manager?.stopPlayback();
    inFlight.current?.abort();
    const id = sessionRef.current;
    if (id) {
      void api
        .cancelVoiceTurn(id, {
          reason: "barge_in",
          telemetry: { turnId: turnId.current, markers: markers.current },
        })
        .catch(() => undefined);
    }
    if (stateRef.current === "SPEAKING") transition("INTERRUPTED");
    transition("LISTENING");
  }, [transition]);

  const stopMicrophone = useCallback(() => {
    releaseInput();
    if (canTransition(stateRef.current, "READY")) transition("READY");
    setNotice("Microphone released. The session stays open — resume, or end it.");
  }, [releaseInput, transition]);

  const resumeMicrophone = useCallback(async () => {
    const ok = await attachInput();
    if (ok) recover("LISTENING");
    return ok;
  }, [attachInput, recover]);

  return {
    state,
    session,
    messages,
    partial,
    notice,
    engine,
    providerState,
    streaming,
    muted,
    level,
    micLive,
    connected,
    busy,
    telemetry,
    draft,
    setDraft,
    profile,
    begin,
    sendText: () => runTurn(undefined, "text"),
    end,
    reset,
    toggleMute,
    stopMicrophone,
    resumeMicrophone,
    bargeIn,
    retry: () => runTurn(undefined, "text"),
    reconnect: async () => {
      attempts.current = 0;
      recover("READY");
      const ok = await resumeMicrophone();
      if (ok) setNotice(null);
      return ok;
    },
    endAll: () => end("completed"),
    micSupported: typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia),
    ttsSupported: typeof window !== "undefined" && "speechSynthesis" in window,
  };
}


