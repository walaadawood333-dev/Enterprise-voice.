import { useEffect, useState } from "react";
import { getVoiceMode, resolveVoiceMode, subscribeVoiceMode, type VoiceMode } from "@/api";

/**
 * Detects whether the CenterAI backend answers, without ever surfacing technical
 * errors to visitors: a failed probe simply keeps demo mode.
 */
export function useBackendStatus(): VoiceMode {
  const [mode, setMode] = useState<VoiceMode>(getVoiceMode);

  useEffect(() => {
    let alive = true;
    const unsubscribe = subscribeVoiceMode((next) => {
      if (alive) setMode(next);
    });
    void resolveVoiceMode().then((next) => {
      if (alive) setMode(next);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return mode;
}
