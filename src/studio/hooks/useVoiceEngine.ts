import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/api";
import type {
  VoiceAnalyticsDto,
  VoiceEngineCapabilities,
  VoiceSessionRecord,
  VoiceTranscriptMessage,
} from "../../../shared/voiceContracts";
import type { AgentRow } from "../../../shared/contracts";

export type EngineState = "READY" | "LISTENING" | "THINKING" | "SPEAKING" | "COMPLETED" | "ERROR";

const browserSttAvailable = () =>
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

const browserTtsAvailable = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Server capability + locally detected browser speech support. */
export function useEngineCapabilities() {
  const [capabilities, setCapabilities] = useState<VoiceEngineCapabilities | null>(null);

  useEffect(() => {
    let alive = true;
    void api.engineCapabilities().then((result) => {
      if (alive && result.ok) setCapabilities(result.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(
    () => ({
      capabilities,
      browserSpeech: { stt: browserSttAvailable(), tts: browserTtsAvailable() },
      engineLabel: capabilities?.configured === "openai" ? "OpenAI conversation engine" : "Demo conversation engine",
    }),
    [capabilities]
  );
}

/** Real sessions + analytics for the authenticated organization. Never synthesized. */
export function useVoiceData() {
  const [sessions, setSessions] = useState<VoiceSessionRecord[]>([]);
  const [analytics, setAnalytics] = useState<VoiceAnalyticsDto | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const loaded = useRef(false);

  const load = useCallback(async () => {
    setStatus("loading");
    const [sessionsResult, analyticsResult] = await Promise.all([
      api.voiceSessions(),
      api.voiceAnalytics(),
    ]);
    if (!sessionsResult.ok && !analyticsResult.ok) {
      setStatus("unavailable");
      return;
    }
    if (sessionsResult.ok) setSessions(sessionsResult.data);
    if (analyticsResult.ok) setAnalytics(analyticsResult.data);
    setStatus("ready");
  }, []);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void load();
  }, [load]);

  return { sessions, analytics, status, reload: load };
}

export interface UseAgentTestOptions {
  agentId: string;
  /** Studio Test Mode lets a draft run; the server enforces the same rule. */
  testMode: boolean;
  speakReplies: boolean;
}

/**
 * Drives one real orchestrated session: create → send transcript text → end.
 * The transcript text is the only payload; microphone audio is transcribed in the browser and
 * never uploaded or stored.
 */
export function useAgentTest({ agentId, testMode, speakReplies }: UseAgentTestOptions) {
  const [state, setState] = useState<EngineState>("READY");
  const [messages, setMessages] = useState<VoiceTranscriptMessage[]>([]);
  const [session, setSession] = useState<VoiceSessionRecord | null>(null);
  const [engine, setEngine] = useState<"demo" | "openai">("demo");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ stop: () => void; start: () => void } | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const closedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;
    return () => {
      // Stop dictation and playback on unmount; end the session politely.
      recognitionRef.current?.stop();
      if (typeof window !== "undefined" && browserTtsAvailable()) window.speechSynthesis?.cancel();
      const id = sessionIdRef.current;
      if (id) {
        void api.endVoiceSession(id, { outcome: "stopped", reason: "navigated away" });
        sessionIdRef.current = null;
      }
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!speakReplies || !browserTtsAvailable() || !text) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const lang =
          session?.language === "ar" ? "ar-SA" : session?.language === "jo" ? "ar-JO" : "en-GB";
        utterance.lang = lang;
        window.speechSynthesis.speak(utterance);
      } catch {
        /* playback is optional; a blocked voice never breaks the transcript */
      }
    },
    [session?.language, speakReplies]
  );

  const start = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    setState("THINKING");
    const result = await api.createVoiceSession({ agentId, testMode });
    setBusy(false);
    if (!result.ok) {
      setState("ERROR");
      setNotice(result.error.message);
      return;
    }
    setSession(result.data.session);
    setEngine(result.data.engine);
    sessionIdRef.current = result.data.session.id;
    setMessages([result.data.greeting]);
    setState("READY");
    if (result.data.fallbackReason) setNotice(result.data.fallbackReason);
    speak(result.data.greeting.content);
  }, [agentId, speak, testMode]);

  const send = useCallback(
    async (rawText?: string) => {
      const text = (rawText ?? draft).trim();
      const id = sessionIdRef.current;
      if (!id) {
        setNotice("Start the test session first.");
        return;
      }
      if (!text) {
        setNotice("Type or dictate a message first.");
        return;
      }
      setDraft("");
      setBusy(true);
      setState("THINKING");
      const result = await api.sendVoiceInput(id, text);
      setBusy(false);
      if (!result.ok) {
        setState("ERROR");
        setNotice(result.error.message);
        return;
      }
      setMessages((prev) => [...prev, result.data.userMessage, result.data.assistantMessage]);
      setSession(result.data.session);
      setEngine(result.data.engine);
      if (result.data.fallbackReason) setNotice(result.data.fallbackReason);
      setState("SPEAKING");
      speak(result.data.assistantMessage.content);
      if (typeof window !== "undefined" && browserTtsAvailable()) {
        const timer = window.setInterval(() => {
          if (!window.speechSynthesis.speaking) {
            window.clearInterval(timer);
            setState("READY");
          }
        }, 220);
        window.setTimeout(() => {
          window.clearInterval(timer);
          setState((current) => (current === "SPEAKING" ? "READY" : current));
        }, 12_000);
      } else {
        setState("READY");
      }
    },
    [draft, speak]
  );

  const stop = useCallback(
    async (outcome: "completed" | "stopped" = "completed") => {
      const id = sessionIdRef.current;
      recognitionRef.current?.stop();
      if (typeof window !== "undefined" && browserTtsAvailable()) window.speechSynthesis.cancel();
      if (!id) {
        setState("READY");
        return;
      }
      sessionIdRef.current = null;
      setBusy(true);
      const result = await api.endVoiceSession(id, { outcome });
      setBusy(false);
      if (result.ok) {
        setSession(result.data.session);
        setState("COMPLETED");
        setNotice(
          `Session saved: ${result.data.messageCount} messages over ${result.data.durationSeconds}s, stored against your organization.`
        );
      } else {
        setNotice(result.error.message);
      }
    },
    []
  );

  const reset = useCallback(() => {
    sessionIdRef.current = null;
    setSession(null);
    setMessages([]);
    setNotice(null);
    setDraft("");
    setState("READY");
    void loadNothing();
  }, []);

  /** Browser dictation: transcript text in, no audio leaves the tab. */
  const toggleDictation = useCallback(() => {
    if (!browserSttAvailable()) {
      setNotice("Live dictation is not supported in this browser — type the message instead.");
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setListening(false);
      return;
    }
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new (Ctor as new () => {
      interimResults: boolean;
      lang: string;
      continuous: boolean;
      onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
    })();
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.lang = session?.language === "ar" ? "ar-SA" : session?.language === "jo" ? "ar-JO" : "en-GB";
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, i) => event.results[i]?.[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) {
        setDraft(transcript);
        void send(transcript);
      }
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => {
      setListening(false);
      setNotice("Dictation stopped. You can still type the message.");
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setState("LISTENING");
  }, [send, session?.language]);

  return {
    state,
    messages,
    session,
    engine,
    notice,
    busy,
    draft,
    setDraft,
    listening,
    start,
    send,
    stop,
    reset,
    toggleDictation,
    canDictate: browserSttAvailable(),
    canSpeak: browserTtsAvailable(),
  };
}

function loadNothing() {
  /* reset is local-only; the persisted session history stays intact for the org */
}

/** Convenience for the detail page: the persisted agent shape used by the Studio. */
export type AgentForDetail = Pick<
  AgentRow,
  | "id"
  | "name"
  | "description"
  | "industry"
  | "language"
  | "voice"
  | "systemPrompt"
  | "welcomeMessage"
  | "status"
  | "createdAt"
  | "updatedAt"
>;
