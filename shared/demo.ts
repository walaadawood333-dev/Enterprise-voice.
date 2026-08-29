/**
 * Canonical demo scenario.
 * Shared by the web client (so the on-page Voice Demo keeps its exact copy) and by the
 * server's DemoScriptEngine (so the API answers with the same lines).
 * These are scripted demonstration lines — not transcripts of real calls.
 */

import type { AgentLanguage, DemoTurn } from "./contracts";

export type DemoLanguageId = AgentLanguage;

export interface DemoScenario {
  title: string;
  turns: DemoTurn[];
}

export const DEMO_SCENARIOS: Record<DemoLanguageId, DemoScenario> = {
  en: {
    title: "Enterprise capabilities enquiry",
    turns: [
      {
        role: "caller",
        text: "I want to know how CenterAI can help my company.",
        ms: 2100,
      },
      {
        role: "agent",
        text: "CenterAI provides enterprise AI voice agents for customer support, verification, outbound campaigns and other high-volume operations.",
        ms: 5200,
      },
      {
        role: "caller",
        text: "And if the caller switches to Arabic half way through?",
        ms: 2000,
      },
      {
        role: "agent",
        text: "The same agent keeps the call — it follows the language switch, holds your policy in context, and hands over to your team with the summary attached when a human is required.",
        ms: 6000,
      },
    ],
  },
  ar: {
    title: "استفسار عن إمكانات المؤسسات",
    turns: [
      {
        role: "caller",
        text: "كيف يمكن لـ CenterAI مساعدة شركتي؟",
        ms: 2100,
      },
      {
        role: "agent",
        text: "توفر CenterAI وكلاء صوتيين بالذكاء الاصطناعي لخدمة العملاء والتحقق والحملات الصادرة والعمليات عالية الحجم.",
        ms: 5400,
      },
      {
        role: "caller",
        text: "وماذا لو انتقل المتصل إلى الإنجليزية أثناء المكالمة؟",
        ms: 2100,
      },
      {
        role: "agent",
        text: "يتابع الوكيل المكالمة نفسها، وينتقل إلى اللغة الأخرى داخل الجملة، ويحتفظ بسياق مؤسستك، ويسلّم المكالمة إلى فريقك مع ملخص كامل عند الحاجة إلى موظف.",
        ms: 6200,
      },
    ],
  },
  jo: {
    title: "سؤال عن خدمة الوكلاء الصوتيين",
    turns: [
      {
        role: "caller",
        text: "مساء الخير، حاب أعرف كيف CenterAI بقدر يساعد شركتنا؟",
        ms: 2400,
      },
      {
        role: "agent",
        text: "أهلاً وسهلاً فيك. CenterAI بتوفر وكلاء صوتيين بالذكاء الاصطناعي لخدمة العملاء، والتحقق من الهوية، والحملات الصادرة، وأي عمليات بعدد مكالمات كبير.",
        ms: 6000,
      },
      {
        role: "caller",
        text: "طيب، لو العميل طلب يتكلم مع موظف؟",
        ms: 2000,
      },
      {
        role: "agent",
        text: "الوكيل بينقل المكالمة لموظفكم مع كل السياق وملخص الطلب، فما بيضطر العميل يعيد حكيه مرة تانية.",
        ms: 5600,
      },
    ],
  },
};

export const DEMO_ORGANIZATION = {
  id: "org_demo",
  name: "CenterAI Demo Workspace",
  slug: "centerai-demo",
} as const;

/**
 * The CenterAI Demo Agent configuration.
 * Also addressable as "centerai-demo-agent" from the browser.
 */
export const DEMO_AGENT = {
  id: "demo-agent",
  aliases: ["centerai-demo-agent"],
  name: "CenterAI Enterprise Voice Agent",
  description:
    "Demonstrates enterprise AI voice interaction for banking, finance, healthcare, legal and customer operations.",
  voice: "layla-service",
  languages: ["en", "ar", "jo"] as AgentLanguage[],
  systemPrompt:
    "You are the CenterAI Enterprise Voice Agent, a demonstration agent for enterprise voice " +
    "infrastructure. Behaviour: professional, concise, natural, enterprise-oriented and helpful. " +
    "Answer in the exact language the caller used (Arabic in Arabic, English in English; do not " +
    "mix languages unless the caller does). Never claim to have performed an action you did not " +
    "perform. Never invent customer data, account details, balances, prices or reference numbers. " +
    "Never claim a live integration with a real company, network or system — if asked, say " +
    "integrations are configured per deployment and offer a demo request. Never quote performance, " +
    "accuracy or availability figures. If a caller asks for something a demo cannot do, say so " +
    "plainly and offer the next human step.",
} as const;
