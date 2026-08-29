/**
 * Voice provider abstraction.
 *
 * The orchestrator depends on three small interfaces, never on a vendor SDK:
 *
 *   SpeechToTextProvider   BrowserSpeechProvider (client, Web Speech) │ FutureProductionSTTProvider
 *   AIConversationProvider DemoConversationProvider                   │ OpenAIConversationProvider
 *   TextToSpeechProvider   BrowserTTSProvider (client, speechSynthesis)│ FutureProductionTTSProvider
 *
 * Speech recognition and synthesis stay on the browser side in this phase, so the server only ever
 * handles transcript **text** — raw microphone audio is never uploaded, stored or persisted.
 * Nothing about a telephony provider exists here by design.
 */

import type { AgentLanguage } from "../../shared/contracts";
import type { AgentRuntimeConfig } from "../../shared/voiceContracts";

export interface ChatTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ConversationRequest {
  agent: AgentRuntimeConfig;
  language: AgentLanguage;
  /** Orchestrator-resolved prompt; providers fall back to the built-in composition. */
  systemPrompt?: string;
  /** Oldest first. The orchestrator caps history before calling. */
  history: ChatTurn[];
  userInput: string;
  /** Studio Test Mode: the caller is an authenticated operator, not a customer. */
  testMode: boolean;
  signal?: AbortSignal;
}

export interface ConversationReply {
  text: string;
  latencyMs: number;
  engine: "demo" | "openai";
}

/** One streamed piece of an assistant reply. Never a raw provider payload. */
export interface StreamChunk {
  delta: string;
  /** True on the first chunk, so the orchestrator can measure time-to-first-token. */
  firstToken?: boolean;
}

export interface AIConversationProvider {
  readonly name: string;
  /** False means "not configured here" — the orchestrator then uses the demo provider. */
  available(): boolean;
  /** Whether this provider can emit partial text before the turn completes. */
  readonly canStream: boolean;
  generate(request: ConversationRequest): Promise<ConversationReply>;
  /** Optional incremental path; the orchestrator falls back to generate() when absent. */
  generateStream?(request: ConversationRequest): AsyncGenerator<StreamChunk, void, undefined>;
}

export interface SpeechToTextProvider {
  readonly name: string;
  available(): boolean;
}

export interface TextToSpeechProvider {
  readonly name: string;
  available(): boolean;
  /** Voice id to request on the client. No audio bytes are produced server-side in this phase. */
  voiceFor(agent: AgentRuntimeConfig): string;
}

/* ── language policy (keeps Arabic answers in Arabic) ────────────────── */

export const languageDirective = (language: AgentLanguage): string => {
  if (language === "ar")
    return "Reply only in Modern Standard Arabic suitable for enterprise conversations. Do not insert English words unless the caller used them first.";
  if (language === "jo")
    return "Reply only in professional Jordanian Arabic (Amman register). Keep it natural and businesslike, never slangy, and do not mix in English.";
  return "Reply in professional international English.";
};

/** Single-argument overload used by the orchestrator when it already resolved a prompt. */
export const systemPromptFor = (
  agent: AgentRuntimeConfig,
  language: AgentLanguage,
  override?: string
): string =>
  [
    override ? "" : `You are ${agent.name || "the CenterAI voice agent"}, an enterprise voice assistant demonstrated in the CenterAI Agent Studio.`,
    agent.description ? `Purpose: ${agent.description}` : "",
    agent.industry ? `Sector: ${agent.industry}.` : "",
    agent.systemPrompt ? `Instructions from the workspace owner: ${agent.systemPrompt}` : "",
    override ?? languageDirective(language),
    "Be concise, professional and natural for spoken delivery: short sentences, no bullet points, no markdown, no emoji.",
    "You are a demonstration agent with no access to customer records, accounts or internal systems. Never invent balances, reference numbers, prices, availability, integration names or performance figures. Never claim to have done something you did not do. If asked for something requiring real data or an action you cannot take, say so plainly and describe the next human step.",
  ]
    .filter(Boolean)
    .join(" ");

/* ── demo provider: deterministic, honest, no fabricated claims ──────── */

const ANSWERS: Record<
  string,
  Record<AgentLanguage, { match: RegExp; text: string }[]>
> = {
  capabilities: {
    en: [
      {
        match: /(what|which).*(can|do|help|capab)|what do you do|introduc/i,
        text: "I handle spoken customer enquiries the way a CenterAI agent does in production: I listen, work out the intent, and answer in the same call. In this workspace I can demonstrate enquiry handling, verification conversation flows and outbound reminder scripts. I cannot read your customer records, and I will not invent balances or reference numbers.",
      },
    ],
    ar: [
      {
        match: /(ماذا|ما الذي).*(يمكن|تستطيع|تساعد)|عرّف|تعريف/i,
        text: "أتعامل مع الاستفسارات الصوتية كما يفعل وكيل CenterAI في التشغيل الفعلي: أستمع، أحدد القصد، ثم أرد داخل المكالمة نفسها. في هذا المساحة أستطيع عرض معالجة الاستفسارات وسيناريوهات التحقق ونصوص التذكير الصادرة. لا أطّلع على بيانات عملائك، ولن أختلق أرصدة أو أرقام مراجع.",
      },
    ],
    jo: [
      {
        match: /(شو|شنو).*(بتقدر|بتعمل|بتساعد)|عرّفنا/i,
        text: "بتعامل مع الاستفسارات الصوتية متل ما بيعمل وكيل CenterAI بالبيئة الحقيقية: بسمع، حدد القصد، وبجاوب داخل المكالمة نفسها. بهالمساحة بقدر أعرض معالجة الاستفسارات وسيناريوهات التحقق ونصوص التذكير. ما بطلع على بيانات عملائك، وما بخترع أرصدة أو أرقام مراجع.",
      },
    ],
  },
  languages: {
    en: [
      {
        match: /(language|dialect|arabic|english|switch)/i,
        text: "The workspace is configured for English, Modern Standard Arabic and Jordanian Arabic. Dialect selection is part of the agent configuration, and language switching inside a call is handled by the same agent rather than by a transfer.",
      },
    ],
    ar: [
      {
        match: /(لغة|لهجة|عربي|إنجليزي|انجليز)/i,
        text: "هذا الوكيل مضبوط على الإنجليزية والعربية الفصحى واللهجة الأردنية. اختيار اللهجة جزء من إعدادات الوكيل، والتبديل بين اللغتين داخل المكالمة يجري مع الوكيل نفسه دون تحويل.",
      },
    ],
    jo: [
      {
        match: /(لغة|لهجة|عربي|انجليزي)/i,
        text: "هاد الوكيل مضبوط على الإنجليزية والعربية الفصحى واللهجة الأردنية. اختيار اللهجة جزء من إعدادات الوكيل، والتبديل بين اللغتين جوا المكالمة بيعملوا الوكيل نفسه بدون تحويل.",
      },
    ],
  },
  security: {
    en: [
      {
        match: /(secure|security|data|privacy|record|store|audio|recording)/i,
        text: "This session keeps transcript text only — no microphone audio is stored. Conversation and usage records belong to your organization and are read back only inside a request that carries your verified session, so another tenant cannot retrieve them.",
      },
    ],
    ar: [
      {
        match: /(أمان|امان|خصوصية|بيانات|تسجيل|صوت)/i,
        text: "هذه الجلسة تحتفظ بنص المحادثة فقط، ولا يتم تخزين صوت الميكروفون. سجلات المحادثة والاستخدام تتبع مؤسستك ولا تُقرأ إلا ضمن طلب يحمل جلستي الموثقة، فلا يمكن لمؤسسة أخرى الوصول إليها.",
      },
    ],
    jo: [
      {
        match: /(أمان|امان|خصوصية|بيانات|تسجيل|صوت)/i,
        text: "هاد الجلسة بتحتفظ بنص المحادثة بس، وما بيتم تخزين صوت الميكروفون. سجلات المحادثة والاستخدام بتتبع مؤسستك، وما بتقرا إلا بطلب معاه جلسة موثقة، فما في جهة تانية تقدر توصل لها.",
      },
    ],
  },
  telephony: {
    en: [
      {
        match: /(phone|call me|dial|pstn|sip|number|outbound|campaign)/i,
        text: "Calling a phone number is not part of this build. Voice sessions run in the browser; telephony routing is a later phase and will attach to this same orchestration layer.",
      },
    ],
    ar: [
      {
        match: /(هاتف|اتصال|رقم| outward|حملة)/i,
        text: "الاتصال بأرقام الهواتف غير مفعّل في هذا الإصدار. جلسات الصوت تعمل داخل المتصفح، وربط الهاتف مرحلة لاحقة تتصل بطبقة التنظيم نفسها.",
      },
    ],
    jo: [
      {
        match: /(هاتف|اتصال|رقم|حملة)/i,
        text: "الاتصال بأرقام الهواتف مش مفعّل بهالنسخة. جلسات الصوت بتشتغل جوا المتصفح، وربط الهاتف مرحلة لاحقة وبتتعامل مع نفس طبقة التنظيم.",
      },
    ],
  },
  price: {
    en: [
      {
        match: /(price|cost|quote|plan|billing|how much)/i,
        text: "I don't have pricing in this demonstration and I won't guess. Commercial terms are usage-based and confirmed with the CenterAI team for the scope, volume and deployment model you need.",
      },
    ],
    ar: [
      {
        match: /(سعر|أسعار|تكلفة|باقة|فاتورة)/i,
        text: "لا أملك معلومات تسعير في هذا العرض التجريبي ولن أخمّن. الشروط التجارية تعتمد على الاستخدام وتُحدد مع فريق CenterAI حسب النطاق والحجم ونموذج التشغيل.",
      },
    ],
    jo: [
      {
        match: /(سعر|أسعار|تكلفة|باقة|فاتورة)/i,
        text: "ما عندي معلومات تسعير بهالعرض التجريبي وما بخمن. الشروط التجارية بتعتمد على الاستخدام وبتتحدد مع فريق CenterAI حسب النطاق والحجم ونموذج التشغيل.",
      },
    ],
  },
  handover: {
    en: [
      {
        match: /(human|agent please|representative|manager|escalat|transfer)/i,
        text: "A handover to a human is a configured step in a real deployment: the agent keeps the context, writes the summary, and passes the caller on. In this demonstration there is no live queue to transfer you to, so nothing was transferred.",
      },
    ],
    ar: [
      {
        match: /(موظف|إنسان|أدير|تحويل|مسؤول)/i,
        text: "التحويل إلى موظف خطوة معرّفة في التشغيل الفعلي: يحتفظ الوكيل بالسياق ويكتب الملخص ويسلم المكالمة. في هذا العرض لا يوجد قائمة انتظار حقيقية، لذلك لم يتم تحويلك.",
      },
    ],
    jo: [
      {
        match: /(موظف|إنسان|أنسان|تحويل|مسؤول)/i,
        text: "التحويل لموظف خطوة معرّفة بالبيئة الحقيقية: الوكيل بيحتفظ بالسياق وبيكتب الملخص وبيسلّم المكالمة. بهال العرض ما في قائمة انتظار حقيقية، فما تم تحويلك.",
      },
    ],
  },
  identity: {
    en: [
      {
        match: /(who are you|what are you|are you (a )?(bot|human|real)|name)/i,
        text: "I'm the demonstration voice agent running in your CenterAI workspace, using the configuration stored for this agent. I'm not a person, and I'm not connected to a phone line.",
      },
    ],
    ar: [
      {
        match: /(من أنت|ما أنت|هل أنت روبوت|اسمك)/i,
        text: "أنا وكيل صوتي تجريبي يعمل في مساحة CenterAI الخاصة بك، باستخدام الإعدادات المحفوظة لهذا الوكيل. لست شخصاً ولست موصولاً بخط هاتفي.",
      },
    ],
    jo: [
      {
        match: /(مين انت|شو انت|هل انت روبوت|اسمك)/i,
        text: "أنا وكيل صوتي تجريبي بشغّل بمساحة CenterAI تبعك، بحسب الإعدادات المحفوظة لهالوكيل. ما أنا شخص، وما أنا موصول على خط هاتفي.",
      },
    ],
  },
};

const GREETING_FALLBACK: Record<AgentLanguage, string> = {
  en: "Hello, this is the CenterAI demonstration agent speaking. I can answer questions about what this agent does, its language settings, and how data is handled.",
  ar: "مرحباً، معك وكيل CenterAI التجريبي. أستطيع الإجابة عن طريقة عمل هذا الوكيل، وإعدادات اللغة، وآلية التعامل مع البيانات.",
  jo: "أهلاً، معك وكيل CenterAI التجريبي. بقدر جاوبك عن طريقة عمل هالوكيل، وإعدادات اللغة، وكيف بتتعامل المنصة مع البيانات.",
};

const FALLBACK: Record<AgentLanguage, string> = {
  en: "I can help with questions about this agent's configuration, the languages it speaks, and how this demo handles data. Anything that needs your customer records or a real action has to come from a connected system, and this workspace isn't connected to one.",
  ar: "أستطيع المساعدة في الأسئلة حول إعدادات هذا الوكيل، واللغات التي يتحدثها، وطريقة تعامل العرض التجريبي مع البيانات. أي أمر يحتاج سجلات عملائك أو إجراءً فعلياً يتطلب نظاماً مربوطاً، وهذه المساحة غير مربوطة بأي نظام.",
  jo: "بقدر ساعدك بأسئلة عن إعدادات هالوكيل، واللغات اللي بيعتمدھا، وكيف بالعرض التجريبي بتتعامل مع البيانات. أي شي بيحتاج سجلات عملائك أو إجراء فعلي لازم يكون مع نظام مربوط، وهالمساحة مش مربوطة على أي نظام.",
};

export class DemoConversationProvider implements AIConversationProvider {
  readonly name = "DemoConversationProvider";
  /** Chunks its own answer so the Studio can show incremental output. */
  readonly canStream = true;

  available() {
    return true;
  }

  /**
   * Yields the composed answer in sentence-sized chunks. Chunking is real; the text itself is
   * rule-based, so this never pretends to be model output.
   */
  async *generateStream(request: ConversationRequest): AsyncGenerator<StreamChunk, void, undefined> {
    const reply = await this.generate(request);
    const parts = reply.text.split(/(?<=[.!?؟\u061F])\s+/).filter(Boolean);
    for (let index = 0; index < parts.length; index += 1) {
      if (request.signal?.aborted) return;
      yield { delta: `${parts[index]}${index < parts.length - 1 ? " " : ""}`, firstToken: index === 0 };
      await new Promise((resolve) => setTimeout(resolve, 90));
    }
  }

  async generate(request: ConversationRequest): Promise<ConversationReply> {
    const started = performance.now();
    const language = request.language;
    const input = request.userInput.trim();

    // Greeting comes from the persisted agent record, not a constant.
    if (!input) {
      const welcome = request.agent.welcomeMessage?.trim();
      return {
        text: welcome || GREETING_FALLBACK[language],
        latencyMs: Math.round(performance.now() - started),
        engine: "demo",
      };
    }

    const buckets = ANSWERS[Object.keys(ANSWERS).find((key) =>
      ANSWERS[key]![language]!.some((rule) => rule.match.test(input))
    ) ?? ""] as Record<AgentLanguage, { match: RegExp; text: string }[]> | undefined;

    const rule = buckets?.[language]?.find((entry) => entry.match.test(input));
    const base = rule?.text ?? FALLBACK[language];

    const tail =
      request.agent.name && !base.includes(request.agent.name)
        ? language === "en"
          ? ` This run uses the “${request.agent.name}” configuration${request.testMode ? " in Studio Test Mode" : ""}.`
          : language === "ar"
            ? ` هذا الرد يستخدم إعدادات “${request.agent.name}”${request.testMode ? " ضمن وضع الاختبار في الاستوديو" : ""}.`
            : `هاد الرد بيستخدم إعدادات “${request.agent.name}”${request.testMode ? " بوضع الاختبار بالاستوديو" : ""}.`
        : "";

    // A small, deliberate pacing pause so the UI's THINKING state is observable.
    await new Promise((resolve) => setTimeout(resolve, 220));

    return {
      text: `${base}${tail}`,
      latencyMs: Math.round(performance.now() - started),
      engine: "demo",
    };
  }
}

/* ── OpenAI provider: server-side only, key never leaves the process ─── */

export interface OpenAIOptions {
  apiKey: () => string | null;
  baseUrl: () => string;
  model: () => string;
  timeoutMs: () => number;
  temperature: () => number;
  maxHistoryTurns: () => number;
}

export class OpenAIConversationProvider implements AIConversationProvider {
  readonly name = "OpenAIConversationProvider";
  /** Uses the streaming responses API when the adapter can flush frames. */
  readonly canStream = true;

  constructor(private readonly options: OpenAIOptions) {}

  available() {
    return Boolean(this.options.apiKey());
  }

  /**
   * Incremental generation using the provider's documented streaming response for
   * /v1/chat/completions (`stream: true`, SSE). Only the text delta leaves this function —
   * raw provider events, ids and usage blocks never reach the browser.
   */
  async *generateStream(request: ConversationRequest): AsyncGenerator<StreamChunk, void, undefined> {
    const apiKey = this.options.apiKey();
    if (!apiKey) throw new Error("PROVIDER_UNAVAILABLE");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs());
    const onAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onAbort);

    try {
      const response = await fetch(`${this.options.baseUrl()}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: this.options.model(),
          temperature: this.options.temperature(),
          stream: true,
          messages: this.messagesFor(request),
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(`PROVIDER_STATUS_${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let first = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const event = JSON.parse(payload) as {
              choices?: { delta?: { content?: string } }[];
            };
            const delta = event.choices?.[0]?.delta?.content;
            if (delta) {
              yield { delta, firstToken: first };
              first = false;
            }
          } catch {
            /* ignore keep-alive or partial frames; the buffered path still completes */
          }
        }
      }
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onAbort);
    }
  }

  /** Shared message assembly for both buffered and streamed calls. */
  private messagesFor(request: ConversationRequest) {
    const history = request.history
      .filter((turn) => turn.role !== "system")
      .slice(-this.options.maxHistoryTurns() * 2);
    return [
      {
        role: "system",
        content: request.systemPrompt ?? systemPromptFor(request.agent, request.language),
      },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: request.userInput.trim() || "(the caller connected silently)" },
    ];
  }

  async generate(request: ConversationRequest): Promise<ConversationReply> {
    const apiKey = this.options.apiKey();
    if (!apiKey) throw new Error("PROVIDER_UNAVAILABLE");

    const started = performance.now();
    const history = request.history
      .filter((turn) => turn.role !== "system")
      .slice(-this.options.maxHistoryTurns() * 2);

    const messages: ChatTurn[] = [
      { role: "system", content: systemPromptFor(request.agent, request.language) },
      ...history,
      { role: "user", content: request.userInput.trim() || "(the caller connected silently)" },
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs());
    const onAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onAbort);

    try {
      const response = await fetch(`${this.options.baseUrl()}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        // Transcript text only, for this request only: nothing is logged or persisted by us.
        body: JSON.stringify({
          model: this.options.model(),
          temperature: this.options.temperature(),
          messages: messages.map((turn) => ({ role: turn.role, content: turn.content })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Status only — provider bodies can contain request echoes.
        throw new Error(`PROVIDER_STATUS_${response.status}`);
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = payload.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("PROVIDER_EMPTY");

      return { text, latencyMs: Math.round(performance.now() - started), engine: "openai" };
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onAbort);
    }
  }
}

/* ── browser-side providers, described here so the contract is complete ─ */

export const browserSpeechProvider: SpeechToTextProvider = {
  name: "BrowserSpeechProvider",
  available: () =>
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
};

export const browserTtsProvider: TextToSpeechProvider = {
  name: "BrowserTTSProvider",
  available: () => typeof window !== "undefined" && "speechSynthesis" in window,
  voiceFor: (agent) => agent.voice,
};

export const providerUnavailableError = (reason: unknown): string => {
  const raw = String((reason as Error)?.message ?? reason ?? "");
  if (raw.includes("PROVIDER_STATUS_4")) return "The AI provider rejected the request.";
  if (raw.includes("PROVIDER_STATUS_5")) return "The AI provider is unavailable right now.";
  if (raw.includes("abort")) return "The AI provider did not respond in time.";
  return "The AI provider could not be reached.";
};
