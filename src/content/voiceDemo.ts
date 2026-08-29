/**
 * Voice Demo presentation content.
 * Scenario copy lives in shared/demo.ts so the on-page demo and the API answer identically.
 */

import type { AgentLanguage } from "../../shared/contracts";
import { DEMO_SCENARIOS } from "../../shared/demo";

export { DEMO_SCENARIOS };
export type DemoLanguageId = AgentLanguage;

export const VOICE_LANGUAGES: Array<{
  id: DemoLanguageId;
  label: string;
  native: string;
  dir: "ltr" | "rtl";
  route: string;
  voice: string;
  note: string;
}> = [
  {
    id: "en",
    label: "English",
    native: "English",
    dir: "ltr",
    route: "EN · Neutral",
    voice: "Yusuf · Operations",
    note: "Neutral English voice, business register.",
  },
  {
    id: "ar",
    label: "Arabic",
    native: "العربية",
    dir: "rtl",
    route: "AR · MSA",
    voice: "Layla · Service",
    note: "Modern Standard Arabic, warm service tone.",
  },
  {
    id: "jo",
    label: "Jordanian Arabic",
    native: "عربي أردني",
    dir: "rtl",
    route: "AR-JO · Amman",
    voice: "Layla · Levantine",
    note: "Professional Amman register — conversational, not slang.",
  },
];

type ChromeStrings = {
  agent: string;
  status: string;
  transcript: string;
  waveform: string;
  language: string;
  states: Record<string, string>;
  start: string;
  stop: string;
  reset: string;
  tryAgain: string;
  readyToStart: string;
  demoMode: string;
  simulationNote: string;
  turn: string;
  elapsed: string;
  signal: string;
  emptyTranscript: string;
  steps: string[];
  micCta: string;
  liveTag: string;
  demoTag: string;
  /** Shown instead of the scripted-demo note while a real session is held. */
  liveNote: string;
  errorNote: string;
  consent: string;
};

export const DEMO_CHROME: Record<"en" | "ar", ChromeStrings> = {
  en: {
    agent: "CenterAI Agent",
    status: "Agent status",
    transcript: "Conversation transcript",
    waveform: "Voice visualization",
    language: "Language",
    states: {
      ready: "CenterAI Voice Agent",
      listening: "Listening...",
      thinking: "CenterAI is thinking...",
      speaking: "CenterAI is speaking...",
      completed: "Demo completed",
      stopped: "Stopped",
      error: "Voice session unavailable",
    },
    micCta: "Try Again",
    liveTag: "Live voice",
    demoTag: "Demo Mode",
    liveNote:
      "Live voice session: your microphone is streamed to the provider for this conversation only. Nothing is recorded or stored by CenterAI.",
    errorNote:
      "The live voice session could not be held. Nothing was recorded — you can try again, or keep reading the transcript above.",
    consent: "Microphone audio is used for this session only and is never stored.",
    start: "Start Demo",
    stop: "Stop Demo",
    reset: "Reset Conversation",
    tryAgain: "Try Again",
    readyToStart: "Ready to start",
    demoMode: "Simulation",
    simulationNote:
      "Scripted frontend demo — no phone line, no microphone, no audio playback, no backend.",
    turn: "Turn",
    elapsed: "Elapsed",
    signal: "Signal",
    emptyTranscript: "The transcript appears here as each turn of the demo plays.",
    steps: ["Ready", "Listening", "Thinking", "Speaking", "Completed"],
  },
  ar: {
    agent: "وكيل CenterAI",
    status: "حالة الوكيل",
    transcript: "نص المحادثة",
    waveform: "موجة الصوت",
    language: "اللغة",
    start: "ابدأ العرض",
    stop: "إيقاف العرض",
    reset: "إعادة تعيين",
    tryAgain: "أعد المحاولة",
    readyToStart: "جاهز للبدء",
    demoMode: "محاكاة",
    simulationNote:
      "عرض واجهة مكتوب مسبقاً — بدون خط هاتفي، وبدون ميكروفون، وبدون صوت، وبدون خادم.",
    turn: "الجولة",
    elapsed: "الوقت",
    signal: "الإشارة",
    emptyTranscript: "تظهر هنا كلمات المحادثة مع تشغيل كل جولة من العرض.",
    steps: ["جاهز", "استماع", "تفكير", "تكلم", "اكتمل"],
    micCta: "إعادة المحاولة",
    liveTag: "صوت مباشر",
    demoTag: "وضع العرض",
    liveNote:
      "جلسة صوتية مباشرة: يُبَّث صوتك إلى مزوّد الخدمة لهذه المحادثة فقط. لا تسجّل CenterAI شيئًا ولا تحتفظ به.",
    errorNote:
      "لم نتمكن من إتمام جلسة الصوت المباشرة. لم يُسجَّل أي صوت — يمكنك إعادة المحاولة أو متابعة النص أعلاه.",
    consent: "يُستخدم صوتك لهذه الجلسة فقط ولا يُخزَّن إطلاقًا.",
    states: {
      ready: "وكيل صوتي من CenterAI",
      listening: "جارٍ الاستماع...",
      thinking: "CenterAI يفكّر...",
      speaking: "CenterAI يتكلم...",
      completed: "انتهى العرض",
      stopped: "تم الإيقاف",
      error: "تعذّر تشغيل جلسة الصوت",
    },
  },
};

/** Arabic selections flip the console to RTL and use the Arabic chrome. */
export const chromeFor = (id: DemoLanguageId) => (id === "en" ? DEMO_CHROME.en : DEMO_CHROME.ar);
