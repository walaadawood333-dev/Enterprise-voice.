/**
 * Demo Workspace data.
 *
 * Everything in this file is SYNTHETIC and deterministic (seeded, so the numbers do not jitter
 * between renders or reloads). It exists to design and test the product surface before a real
 * backend is connected. Nothing here is a customer result, and every consumer must label it.
 */

import type { AgentLanguage } from "../../../shared/contracts";

export type AgentStatus = "draft" | "active" | "paused" | "archived";
export type SessionStatus = "created" | "active" | "completed" | "failed" | "handover";
export type CampaignStatus = "draft" | "scheduled" | "active" | "completed";
export type IntegrationStatus = "not_connected" | "coming_soon" | "configured";
export type Industry = "Banking" | "Finance" | "Healthcare" | "Legal" | "Enterprise Services";

export interface StudioAgent {
  id: string;
  name: string;
  industry: Industry;
  language: AgentLanguage;
  voice: string;
  status: AgentStatus;
  instructions: string;
  welcomeMessage: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  /** Server-persisted rows are distinguishable from seeded demo rows, everywhere they show. */
  recordSource?: "server" | "demo";
}

export interface StudioSession {
  id: string;
  agentId: string;
  agentName: string;
  language: AgentLanguage;
  durationSeconds: number;
  turns: number;
  status: SessionStatus;
  startedAt: string;
}

export interface StudioCampaign {
  id: string;
  name: string;
  agentId: string;
  agentName: string;
  audience: string;
  audienceSize: number;
  status: CampaignStatus;
  scheduledFor: string | null;
  window: string;
}

export interface StudioIntegration {
  id: string;
  category: "Telephony" | "CRM" | "Payments" | "Jordan Fintech";
  name: string;
  status: IntegrationStatus;
  note: string;
}

export const LANGUAGE_LABEL: Record<AgentLanguage, string> = {
  en: "English",
  ar: "Arabic",
  jo: "Jordanian Arabic",
};

export const INDUSTRIES: Industry[] = [
  "Banking",
  "Finance",
  "Healthcare",
  "Legal",
  "Enterprise Services",
];

export const AGENT_LANGUAGES: AgentLanguage[] = ["en", "ar", "jo"];

export const VOICE_OPTIONS = [
  { id: "layla-service", label: "Layla · Warm service", locale: "AR-JO / EN" },
  { id: "omar-banking", label: "Omar · Formal banking", locale: "AR-SA / EN" },
  { id: "nour-retail", label: "Nour · Bright retail", locale: "AR-EG / EN" },
  { id: "yusuf-collections", label: "Yusuf · Neutral collections", locale: "EN / AR" },
  { id: "camille-advisory", label: "Camille · Calm advisory", locale: "FR / EN" },
];

export const DEFAULT_INSTRUCTIONS =
  "Be professional, concise and natural. Answer in the caller's language and never mix languages unless the caller does. Never claim to have performed an action you did not perform. Do not invent balances, prices, reference numbers, availability or performance figures. Escalate to a human when policy or the caller requires it.";

export const DEMO_NOTICE =
  "Demo data — generated in the browser to design this surface. No customer, call or result is represented here.";

/** Deterministic pseudo-random in [0,1) — stable for a given seed. */
const seeded = (n: number) => {
  const x = Math.sin(n * 78.233 + 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const iso = (daysAgo: number, hour = 9, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

export const DEMO_AGENTS: StudioAgent[] = [
  {
    id: "demo-agent",
    name: "CenterAI Enterprise Voice Agent",
    industry: "Banking",
    language: "en",
    voice: "layla-service",
    status: "active",
    instructions: DEFAULT_INSTRUCTIONS,
    welcomeMessage:
      "Welcome to CenterAI. I can help with balance enquiries, card issues and appointment booking. How can I assist you today?",
    createdAt: iso(96, 10, 15),
    updatedAt: iso(3, 14, 5),
  },
  {
    id: "demo-agent-ar",
    name: "وكيل خدمة العملاء — Banking Support",
    industry: "Banking",
    language: "ar",
    voice: "omar-banking",
    status: "active",
    instructions: DEFAULT_INSTRUCTIONS,
    welcomeMessage:
      "أهلاً بك في CenterAI. أستطيع مساعدتك في استعلامات الرصيد والبطاقات وحجز المواعيد. كيف أخدمك اليوم؟",
    createdAt: iso(74, 11, 30),
    updatedAt: iso(2, 9, 40),
  },
  {
    id: "demo-agent-jo",
    name: "موظف التحصيل — Amman Collections",
    industry: "Finance",
    language: "jo",
    voice: "yusuf-collections",
    status: "paused",
    instructions: DEFAULT_INSTRUCTIONS,
    welcomeMessage:
      "مساء الخير، معك موظف خدمة العملاء في CenterAI. أتصل لتذكير بقسط هذا الشهر، وهل يناسبك الدفع اليوم؟",
    createdAt: iso(41, 16, 20),
    updatedAt: iso(9, 10, 5),
  },
  {
    id: "demo-agent-health",
    name: "Clinic Intake Agent",
    industry: "Healthcare",
    language: "en",
    voice: "nour-retail",
    status: "draft",
    instructions: DEFAULT_INSTRUCTIONS,
    welcomeMessage:
      "Thank you for calling the clinic. I can book, reschedule or cancel an appointment. Would you like to continue?",
    createdAt: iso(11, 13, 0),
    updatedAt: iso(1, 8, 45),
  },
];

/** 28 demo sessions spread over 14 days, derived from the agent list. */
export const DEMO_SESSIONS: StudioSession[] = Array.from({ length: 28 }, (_, i) => {
  const agent = DEMO_AGENTS[Math.floor(seeded(i + 1) * DEMO_AGENTS.length)]!;
  const r = seeded(i + 21);
  const status: SessionStatus =
    i === 0 ? "active" : r > 0.88 ? "handover" : r > 0.82 ? "failed" : "completed";
  const durationSeconds = Math.round(72 + r * 470);
  return {
    id: `vsn_demo_${(1000 + i * 37).toString(36)}`,
    agentId: agent.id,
    agentName: agent.name,
    language: agent.language,
    durationSeconds,
    turns: Math.max(2, Math.round(durationSeconds / 95)),
    status,
    startedAt: iso(Math.floor(i / 2), 9 + (i % 9), (i * 7) % 60),
  };
});

export const DEMO_CAMPAIGNS: StudioCampaign[] = [
  {
    id: "cmp_instal_a",
    name: "Q1 instalment reminders — Amman",
    agentId: "demo-agent-jo",
    agentName: "موظف التحصيل — Amman Collections",
    audience: "Segment: 30dpd · consented",
    audienceSize: 4200,
    status: "scheduled",
    scheduledFor: iso(-3, 10, 0),
    window: "10:00–13:00 Asia/Amman",
  },
  {
    id: "cmp_card_renewal",
    name: "Card renewal confirmations",
    agentId: "demo-agent",
    agentName: "CenterAI Enterprise Voice Agent",
    audience: "Segment: expiring within 21 days",
    audienceSize: 1850,
    status: "draft",
    scheduledFor: null,
    window: "not set",
  },
  {
    id: "cmp_clinic_noshow",
    name: "No-show recovery — clinic",
    agentId: "demo-agent-health",
    agentName: "Clinic Intake Agent",
    audience: "Segment: appointments tomorrow",
    audienceSize: 640,
    status: "completed",
    scheduledFor: iso(6, 15, 0),
    window: "15:00–17:00 Asia/Amman",
  },
];

export const DEMO_INTEGRATIONS: StudioIntegration[] = [
  { id: "int_pstn", category: "Telephony", name: "Direct PSTN termination", status: "not_connected", note: "Gateway pairs and number ranges agreed per deployment." },
  { id: "int_sip", category: "Telephony", name: "SIP trunk bridge", status: "coming_soon", note: "Not implemented in this phase — no live calling exists." },
  { id: "int_sim", category: "Telephony", name: "Real SIM card routing", status: "coming_soon", note: "Planned alongside the telephony layer." },
  { id: "int_salesforce", category: "CRM", name: "Salesforce", status: "not_connected", note: "Adapter scoped per institution; no sync running." },
  { id: "int_hubspot", category: "CRM", name: "HubSpot", status: "not_connected", note: "API mapping drafted; not connected." },
  { id: "int_zoho", category: "CRM", name: "Zoho CRM", status: "coming_soon", note: "No connector published yet." },
  { id: "int_core", category: "Payments", name: "Core banking host", status: "not_connected", note: "Read-only enquiry scope agreed at deployment." },
  { id: "int_gateway", category: "Payments", name: "Payment gateway", status: "not_connected", note: "No charges can be initiated by a demo agent." },
  { id: "int_zaincash", category: "Jordan Fintech", name: "ZainCash", status: "not_connected", note: "Rail adapter in scope — not certified, not connected." },
  { id: "int_orange", category: "Jordan Fintech", name: "Orange Money", status: "not_connected", note: "Rail adapter in scope — not certified, not connected." },
  { id: "int_uwallet", category: "Jordan Fintech", name: "UWallet", status: "not_connected", note: "Wallet operations adapter in scope." },
  { id: "int_cliq", category: "Jordan Fintech", name: "CliQ", status: "coming_soon", note: "Instant payment network link under discussion; no live route." },
];

/* ── derived demo analytics (computed from the sessions, so charts agree with tables) ── */

export interface DayPoint {
  label: string;
  sessions: number;
  minutes: number;
}

export function demoDailySeries(days = 14): DayPoint[] {
  const out: DayPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    const key = d.toISOString().slice(0, 10);
    const rows = DEMO_SESSIONS.filter((s) => s.startedAt.slice(0, 10) === key);
    out.push({
      label: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }),
      sessions: rows.length,
      minutes: Math.round(rows.reduce((sum, s) => sum + s.durationSeconds, 0) / 60),
    });
  }
  return out;
}

export function demoLanguageMix() {
  return AGENT_LANGUAGES.map((language) => ({
    language,
    label: LANGUAGE_LABEL[language],
    sessions: DEMO_SESSIONS.filter((s) => s.language === language).length,
  }));
}

export function demoAgentPerformance() {
  return DEMO_AGENTS.map((agent) => {
    const rows = DEMO_SESSIONS.filter((s) => s.agentId === agent.id);
    const resolved = rows.filter((s) => s.status === "completed").length;
    return {
      id: agent.id,
      name: agent.name,
      sessions: rows.length,
      minutes: Math.round(rows.reduce((sum, s) => sum + s.durationSeconds, 0) / 60),
      resolutionRate: rows.length ? Math.round((resolved / rows.length) * 100) : 0,
    };
  });
}

export function demoUsageTotals() {
  const minutes = Math.round(
    DEMO_SESSIONS.reduce((sum, s) => sum + s.durationSeconds, 0) / 60
  );
  const turns = DEMO_SESSIONS.reduce((sum, s) => sum + s.turns, 0);
  return {
    sessions: DEMO_SESSIONS.length,
    minutes,
    turns,
    avgSeconds: DEMO_SESSIONS.length
      ? Math.round(DEMO_SESSIONS.reduce((sum, s) => sum + s.durationSeconds, 0) / DEMO_SESSIONS.length)
      : 0,
    activeAgents: DEMO_AGENTS.filter((a) => a.status === "active").length,
    handovers: DEMO_SESSIONS.filter((s) => s.status === "handover").length,
  };
}

/** Sparkline data for a KPI card — derived, never invented. */
export function demoSpark(kind: "sessions" | "minutes" | "agents"): number[] {
  const series = demoDailySeries(14);
  if (kind === "minutes") return series.map((p) => p.minutes);
  if (kind === "sessions") return series.map((p) => p.sessions);
  return series.map((_, i) => DEMO_AGENTS.filter((a) => a.status === "active").length + (i > 9 ? 1 : 0) - 1);
}

/* ── formatting helpers ─────────────────────────────────────────────── */

export const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
};

export const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export const formatNumber = (value: number) => value.toLocaleString("en-US");
