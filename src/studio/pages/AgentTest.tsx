import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  RotateCcw,
  Send,
  Volume2,
  VolumeX,
  WifiOff,
  Zap,
} from "lucide-react";
import { Panel, StatusChip } from "../components/primitives";
import { VoiceBars } from "@/components/ui/VoiceBars";
import { useStudio } from "../StudioProvider";
import { useRealtimeVoice } from "../hooks/useRealtimeVoice";
import { LANGUAGE_LABEL } from "../data/demoWorkspace";
import { cn } from "@/utils/cn";

const STATE_LABEL: Record<string, string> = {
  READY: "Ready — press Start Test",
  LISTENING: "Listening…",
  PROCESSING: "Agent is thinking…",
  SPEAKING: "Agent is speaking…",
  INTERRUPTED: "Interrupted — back to listening",
  RECONNECTING: "Reconnecting…",
  COMPLETED: "Session completed",
  FAILED: "Session unavailable",
};

export function AgentTestPage() {
  const { agentId = "" } = useParams();
  const { agents, origin } = useStudio();
  const agent = agents.find((item) => item.id === agentId);
  const [speakReplies, setSpeakReplies] = useState(true);
  const live = useRealtimeVoice({
    agentId,
    language: agent?.language ?? "en",
    testMode: agent?.status === "draft",
    speakReplies,
  });

  useEffect(() => {
    document.title = agent ? `Test · ${agent.name} · CenterAI Studio` : "Test agent · CenterAI Studio";
    return () => {
      document.title = "CenterAI — Enterprise AI Voice Infrastructure in Jordan, built for MENA";
    };
  }, [agent]);

  if (!agent) {
    return (
      <Panel as="section" className="space-y-3">
        <h2 className="font-display text-xl font-medium">This agent is not in your workspace</h2>
        <p className="text-[13px] leading-relaxed text-black/50">
          It may have been deleted, or it belongs to another organization — cross-organization rows are
          never readable from here.
        </p>
        <Link
          to="/studio/agents"
          className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-white px-4 py-2 font-display text-[13px] font-semibold transition-colors hover:border-black/25"
        >
          <ArrowLeft size={13} />
          Back to agents
        </Link>
      </Panel>
    );
  }

  const running = Boolean(live.session) && live.state !== "COMPLETED" && live.state !== "FAILED";
  const latency = live.telemetry[live.telemetry.length - 1];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/studio/agents/${agent.id}`}
          className="inline-flex items-center gap-1.5 font-display text-[12px] font-semibold tracking-wide text-black/45 transition-colors hover:text-black"
        >
          <ArrowLeft size={13} />
          {agent.name}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSpeakReplies((prev) => !prev)}
            aria-pressed={speakReplies}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-display text-[12px] font-semibold transition-colors",
              speakReplies
                ? "border-black bg-ink text-white"
                : "border-hair bg-white text-black/55 hover:border-black/25 hover:text-black"
            )}
          >
            {speakReplies ? <Volume2 size={13} /> : <VolumeX size={13} />}
            {live.ttsSupported ? "Spoken replies" : "Browser TTS unavailable"}
          </button>
          <span className="rounded-full border border-hair bg-mist px-3 py-1.5 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-black/45">
            {live.engine === "openai" ? "OpenAI engine" : "Demo engine"}
            {live.streaming ? " · streaming" : " · buffered"}
            {live.state === "RECONNECTING" ? " · reconnecting" : ""}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        <Panel as="section" className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-[10px] font-bold tracking-[0.2em] text-black/40 uppercase">
                Conversation status
              </p>
              <p
                key={live.state}
                className="mt-1.5 font-display text-[1.6rem] leading-none font-medium"
                style={{ animation: "popIn .35s var(--ease-smooth) both" }}
              >
                {STATE_LABEL[live.state] ?? live.state}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={agent.status} />
              {live.session ? (
                <span className="numeral rounded-full bg-mist px-2.5 py-1 text-[11px] text-black/55">
                  {live.session.id}
                </span>
              ) : null}
              {!live.connected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/18 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                  <WifiOff size={11} />
                  offline
                </span>
              ) : null}
            </div>
          </div>

          <div className="h-16 overflow-hidden rounded-2xl border border-hair bg-mist/70 px-3 py-2.5 text-black/45">
            <VoiceBars
              count={40}
              intensity={
                live.state === "LISTENING" ? 0.25 + live.level * 0.75 : live.state === "SPEAKING" ? 0.8 : live.state === "PROCESSING" ? 0.3 : 0.12
              }
              className="h-full w-full"
            />
          </div>

          <div
            role="log"
            aria-live="polite"
            aria-label="Live conversation transcript"
            className="max-h-[42vh] min-h-[220px] space-y-2.5 overflow-y-auto rounded-2xl border border-hair bg-white p-3.5 studio-scroll"
          >
            {live.messages.length === 0 && !live.partial ? (
              <p className="rounded-2xl border border-dashed border-black/15 px-4 py-8 text-center text-[13px] leading-relaxed text-black/40">
                Start the test to open a session. Your microphone is transcribed in this browser; only
                the resulting text is sent.
              </p>
            ) : null}

            {live.messages.map((message) => (
              <div
                key={message.id}
                className={cn("flex", message.role === "assistant" ? "justify-start" : "justify-end")}
              >
                <div
                  className={cn(
                    "max-w-[92%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed",
                    message.role === "assistant"
                      ? "border border-hair bg-mist/70 text-black/75"
                      : "bg-ink text-white"
                  )}
                >
                  <span className="mb-1 block font-display text-[9px] font-bold tracking-[0.18em] uppercase opacity-55">
                    {message.role === "assistant" ? "Agent" : "You"}
                    {message.latencyMs ? ` · ${message.latencyMs} ms` : ""}
                  </span>
                  <span dir={agent.language === "en" ? "ltr" : "auto"} className={cn(agent.language !== "en" && "font-arabic")}>
                    {message.content}
                  </span>
                </div>
              </div>
            ))}

            {live.partial ? (
              <div className="flex justify-start">
                <div className="max-w-[92%] rounded-2xl border border-dashed border-black/20 bg-white px-4 py-2.5 text-[13.5px] leading-relaxed text-black/60">
                  <span className="mb-1 block font-display text-[9px] font-bold tracking-[0.18em] uppercase text-black/40">
                    Agent · streaming
                  </span>
                  {live.partial}
                </div>
              </div>
            ) : null}
          </div>

          {live.notice ? (
            <p
              role="status"
              className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] leading-relaxed text-amber-900"
            >
              {live.notice}
            </p>
          ) : null}

          <form
            className="space-y-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              void live.sendText();
            }}
          >
            <label className="sr-only" htmlFor="voice-input">
              Message to the agent
            </label>
            <textarea
              id="voice-input"
              rows={2}
              value={live.draft}
              disabled={!running || live.busy}
              onChange={(event) => live.setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void live.sendText();
                }
              }}
              placeholder={
                running
                  ? "Type, dictate with the microphone, or interrupt while the agent is speaking"
                  : "Start the test session to begin"
              }
              className={cn(
                "w-full resize-none rounded-2xl border border-hair bg-white px-4 py-3 text-[14.5px] text-ink transition-colors placeholder:text-black/25 hover:border-black/25 focus:border-black focus:outline-none disabled:cursor-not-allowed disabled:bg-mist/70",
                agent.language !== "en" && "font-arabic"
              )}
            />
            <div className="flex flex-wrap items-center gap-2">
              {!running ? (
                <button
                  type="button"
                  disabled={live.busy}
                  onClick={() => void live.begin()}
                  className="btn-primary inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-display text-[13.5px] font-semibold text-white disabled:opacity-60"
                >
                  {live.busy ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
                  Start Test
                </button>
              ) : (
                <>
                  <button
                    type="submit"
                    disabled={live.busy || !live.draft.trim()}
                    className="btn-primary inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-display text-[13.5px] font-semibold text-white disabled:opacity-40"
                  >
                    <Send size={14} />
                    Send
                  </button>
                  <button
                    type="button"
                    onClick={live.toggleMute}
                    aria-pressed={live.muted}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2.5 font-display text-[13px] font-semibold transition-colors",
                      live.muted
                        ? "border-amber-300 bg-amber-50 text-amber-900"
                        : "border-hair bg-white text-black/60 hover:border-black/25 hover:text-black"
                    )}
                  >
                    {live.muted ? <MicOff size={14} /> : <Mic size={14} />}
                    {live.muted ? "Unmute mic" : "Mute mic"}
                  </button>
                  <button
                    type="button"
                    onClick={live.bargeIn}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-hair bg-white px-4 py-2.5 font-display text-[13px] font-semibold text-black/60 transition-colors hover:border-black/25 hover:text-black"
                    title="Stop the agent's voice now and interrupt the current turn"
                  >
                    <Zap size={14} />
                    Interrupt
                  </button>
                  <button
                    type="button"
                    onClick={() => (live.micLive ? live.stopMicrophone() : void live.resumeMicrophone())}
                    aria-pressed={!live.micLive}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-hair bg-white px-4 py-2.5 font-display text-[13px] font-semibold text-black/60 transition-colors hover:border-black/25 hover:text-black"
                    title={
                      live.micLive
                        ? "Release the microphone. The session stays open and the transcript is kept."
                        : "Re-open the microphone on this same session."
                    }
                  >
                    {live.micLive ? <MicOff size={14} /> : <Mic size={14} />}
                    {live.micLive ? "Stop mic" : "Resume mic"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void live.end("completed")}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-hair bg-white px-4 py-2.5 font-display text-[13px] font-semibold text-black/60 transition-colors hover:border-black/25 hover:text-black"
                  >
                    <PhoneOff size={14} />
                    End Session
                  </button>
                </>
              )}
              {live.state === "RECONNECTING" ? (
                <button
                  type="button"
                  onClick={() => void live.reconnect()}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2.5 font-display text-[13px] font-semibold text-white"
                >
                  <RefreshCw size={14} />
                  Reconnect
                </button>
              ) : null}
              <button
                type="button"
                onClick={live.reset}
                className="ms-auto inline-flex cursor-pointer items-center gap-2 rounded-full border border-hair bg-white px-4 py-2.5 font-display text-[13px] font-semibold text-black/45 transition-colors hover:border-black/25 hover:text-black"
              >
                <RotateCcw size={14} />
                Reset
              </button>
            </div>
          </form>

          <p className="text-[11px] leading-relaxed text-black/40">
            Interruptions are handled end to end: speech during playback stops the browser voice,
            cancels the pending generation server-side, and returns the session to LISTENING — no
            overlapping audio, no orphaned streams.
          </p>
        </Panel>

        <div className="space-y-4 lg:col-span-5">
          <Panel as="aside" className="space-y-3.5">
            <p className="flex items-center gap-2 font-display text-[10px] font-bold tracking-[0.2em] text-black/40 uppercase">
              <Activity size={12} />
              Measured turn latency
            </p>
            {latency ? (
              <dl className="grid grid-cols-2 gap-3">
                {[
                  ["STT", latency.sttMs],
                  ["LLM total", latency.llmMs],
                  ["First token", latency.firstTokenMs],
                  ["Round trip", latency.roundTripMs],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-2xl border border-hair bg-mist/60 px-3.5 py-2.5">
                    <dt className="font-display text-[9px] font-bold tracking-[0.16em] text-black/40 uppercase">
                      {label}
                    </dt>
                    <dd className="numeral mt-1 text-[1.05rem] font-bold">
                      {value == null ? "not measured" : `${value} ms`}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-black/45">
                No turn has been measured yet in this session. These figures are timed with
                <span className="numeral"> performance.now() </span>
                and persisted as telemetry metadata — never estimated or back-filled.
              </p>
            )}
            {live.telemetry.length > 1 ? (
              <ul className="space-y-1 border-t border-hair pt-3 text-[11.5px] text-black/50">
                {live.telemetry.slice(-6).map((entry) => (
                  <li key={entry.turnId} className="flex items-center justify-between gap-3">
                    <span className="numeral truncate">{entry.turnId}</span>
                    <span className="numeral shrink-0">
                      {entry.roundTripMs != null ? `${entry.roundTripMs} ms` : "—"}
                      {entry.interrupted ? " · interrupted" : ""}
                      {entry.streamed ? " · stream" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>

          <Panel as="aside" className="space-y-3">
            <p className="font-display text-[10px] font-bold tracking-[0.2em] text-black/40 uppercase">
              Agent under test
            </p>
            <h2 className="font-display text-[1.5rem] leading-tight font-medium">{agent.name}</h2>
            <dl className="grid grid-cols-2 gap-4 border-y border-hair py-4">
              {[
                ["Status", agent.status],
                ["Language", LANGUAGE_LABEL[agent.language]],
                ["Voice", agent.voice],
                ["STT locale", live.profile.sttLang],
                ["TTS locale", live.profile.ttsLang],
                ["Persistence", origin === "live" ? "PostgreSQL" : "This tab only"],
              ].map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="font-display text-[9px] font-bold tracking-[0.16em] text-black/40 uppercase">
                    {key}
                  </dt>
                  <dd className="mt-1 truncate text-[13px] font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="rounded-2xl border border-hair bg-mist/60 px-4 py-3 text-[11.5px] leading-relaxed text-black/50">
              {live.profile.capabilityNote}
            </p>
            <p className="text-[11px] leading-relaxed text-black/40">
              Provider state:{" "}
              <span className="font-display font-bold uppercase tracking-[0.14em]">
                {live.providerState === "PRIMARY"
                  ? "primary engine"
                  : live.providerState === "FALLBACK"
                    ? "fallback engine"
                    : "unavailable"}
              </span>
              . Failover is recorded as a usage event; provider error bodies are never forwarded.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
