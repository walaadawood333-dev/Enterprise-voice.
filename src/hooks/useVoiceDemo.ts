import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createVoiceProvider,
  getVoiceBackend,
  type ResolvedBackend,
  type VoiceProvider,
} from "@/lib/voiceProvider";
import { subscribeVoiceMode } from "@/api";
import type { VoiceProviderEvent, VoiceState } from "../../shared/contracts";
import { DEMO_SCENARIOS, VOICE_LANGUAGES, type DemoLanguageId } from "@/content/voiceDemo";

export type TranscriptLine = {
  id: string;
  role: "caller" | "agent";
  text: string;
  at: number;
  final: boolean;
};

export type VoiceNotice = { code: string; message: string; recovered: boolean };

const RAIL: Record<VoiceState, number> = {
  ready: 0,
  listening: 1,
  thinking: 2,
  speaking: 3,
  stopped: 0,
  completed: 4,
  error: 0,
};

/**
 * Drives the voice console through whichever provider the API/config negotiation resolved.
 * Transcript lines are upserted by id so a streamed agent reply animates in place, and the
 * input level is kept in a ref so realtime audio never re-renders React.
 */
export function useVoiceDemo(initialLanguage: DemoLanguageId = "en") {
  const [language, setLanguage] = useState<DemoLanguageId>(initialLanguage);
  const [state, setState] = useState<VoiceState>("ready");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [notice, setNotice] = useState<VoiceNotice | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [backend, setBackend] = useState<ResolvedBackend>(() => getVoiceBackend().resolved);
  const [provider, setProvider] = useState<VoiceProvider | null>(null);

  const clockRef = useRef(0);
  const levelRef = useRef(0);

  const scenario = useMemo(() => DEMO_SCENARIOS[language], [language]);
  const lang = useMemo(
    () => VOICE_LANGUAGES.find((l) => l.id === language) ?? VOICE_LANGUAGES[0],
    [language]
  );

  /** Re-follow the resolved backend when the API probe lands after mount. */
  useEffect(
    () =>
      subscribeVoiceMode(() => {
        const next = getVoiceBackend().resolved;
        setBackend((prev) => (prev === next ? prev : next));
      }),
    []
  );

  /** Create the provider whenever the resolved backend changes; tear it down cleanly. */
  useEffect(() => {
    const created = createVoiceProvider();
    const handle = (event: VoiceProviderEvent) => {
      switch (event.type) {
        case "state":
          setState(event.state);
          // Returning to a safe state clears the previous explanation from the console.
          if (event.state === "ready" || event.state === "stopped") setNotice(null);
          return;
        case "reset":
          setLines([]);
          setElapsed(0);
          setNotice(null);
          return;
        case "line": {
          const at =
            Math.round(Math.max(0, performance.now() - (clockRef.current || performance.now())) / 100) / 10;
          setLines((prev) => {
            const index = prev.findIndex((line) => line.id === event.id);
            const next = {
              id: event.id,
              role: event.role,
              text: event.text,
              at: index >= 0 ? prev[index]!.at : at,
              final: event.final ?? true,
            };
            if (index < 0) return [...prev, next];
            const copy = [...prev];
            copy[index] = next;
            return copy;
          });
          return;
        }
        case "notice":
          setNotice({ code: event.code, message: event.message, recovered: event.recovered });
          if (!event.recovered) setState("error");
          return;
      }
    };
    const unsubscribe = created.subscribe(handle);
    setProvider(created);

    return () => {
      unsubscribe();
      created.dispose();
      setProvider(null);
    };
  }, [backend]);

  /** Demo clock, only while a turn is actually in flight. */
  useEffect(() => {
    const live = state === "listening" || state === "thinking" || state === "speaking";
    if (!live) return;
    if (!clockRef.current) clockRef.current = performance.now();
    const id = window.setInterval(() => {
      setElapsed(Math.round((performance.now() - clockRef.current) / 100) / 10);
    }, 120);
    return () => window.clearInterval(id);
  }, [state]);

  const start = useCallback(() => {
    if (!provider) return;
    if (lines.length === 0) clockRef.current = 0;
    setElapsed(0);
    setNotice(null);
    provider.start({
      language,
      turns: scenario.turns,
      onLevel: (level) => {
        levelRef.current = level;
      },
    });
  }, [language, lines.length, provider, scenario.turns]);

  const stop = useCallback(() => {
    provider?.stop();
    clockRef.current = 0;
  }, [provider]);

  const reset = useCallback(() => {
    provider?.reset();
    setLines([]);
    setElapsed(0);
    setNotice(null);
    setState("ready");
    clockRef.current = 0;
    levelRef.current = 0;
  }, [provider]);

  const changeLanguage = useCallback(
    (next: DemoLanguageId) => {
      if (next === language) return;
      provider?.reset();
      setLanguage(next);
      setLines([]);
      setNotice(null);
      setState("ready");
      setElapsed(0);
      clockRef.current = 0;
      levelRef.current = 0;
    },
    [language, provider]
  );

  /** Read per animation frame by the visualizer — deliberately not React state. */
  const getLevel = useCallback(() => levelRef.current, []);

  const busy = state === "listening" || state === "thinking" || state === "speaking";
  const live = Boolean(provider && !provider.info.simulation);
  const total = scenario.turns.length;

  return {
    provider,
    language: lang,
    languageId: language,
    state,
    step: RAIL[state],
    busy,
    live,
    backend,
    notice,
    lines,
    elapsed,
    total,
    turnCount: Math.min(lines.length, total),
    title: scenario.title,
    providerInfo: provider?.info ?? {
      id: "idle",
      label: "Not connected",
      telephony: false,
      realtimeAudio: false,
      microphone: false,
      simulation: true,
    },
    getLevel,
    start,
    stop,
    reset,
    changeLanguage,
    languages: VOICE_LANGUAGES,
  };
}
