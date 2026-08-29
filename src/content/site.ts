/**
 * CenterAI — site content.
 * All marketing copy, navigation and section data lives here so UI components stay presentational.
 *
 * CLAIM POLICY (applies to every string in this file):
 *  - Capability and positioning language only. No fabricated customer results, benchmarks,
 *    volumes, accuracy scores, SLA values or certifications.
 *  - Product specifications (sub-300ms latency target, 10,000+ voices, 70+ languages, Arabic-first,
 *    inbound/outbound, PSTN + SIM routing, Jordan/MENA focus) are stated as design targets.
 *  - Anything that would normally be evidenced by telemetry or a reference customer is written as a
 *    neutral placeholder and labelled as such in the UI.
 */

export type NavItem = { label: string; target: string };

export const nav: NavItem[] = [
  { label: "Platform", target: "platform" },
  { label: "Solutions", target: "solutions" },
  { label: "Integrations", target: "integrations" },
  { label: "Pricing", target: "pricing" },
];

export const hero = {
  eyebrow: "Enterprise AI Voice Infrastructure",
  titleLead: "The Future of",
  titleAccent: "voice.",
  body: "Intelligent voice agents built for banking, finance and high-volume customer operations.",
  metrics: [
    { value: 300, prefix: "<", suffix: "ms", label: "Response Latency" },
    { value: 10000, prefix: "", suffix: "+", label: "Expressive Voices" },
    { value: 70, prefix: "", suffix: "+", label: "Languages & Dialects" },
  ],
  metricsNote: "Product design targets — not measured production benchmarks.",
};

export const consoleLanguages = [
  {
    id: "ar",
    chip: "العربية",
    dialect: "Jordanian / Najdi",
    direction: "rtl" as const,
    caller: "مرحباً، في تحويل مالي ما وصلني وحاب أتأكد منه.",
    agent: "أهلاً بك. أرى التحويل قيد المعالجة — هل تريد إرسال تأكيد على الرسائل النصية؟",
  },
  {
    id: "en",
    chip: "English",
    dialect: "Neutral / UK",
    direction: "ltr" as const,
    caller: "Hi, I made a transfer ten minutes ago and it hasn't arrived.",
    agent: "I can see the transfer is still in processing. Shall I send a written confirmation to your phone?",
  },
  {
    id: "fr",
    chip: "Français",
    dialect: "Levant / FR",
    direction: "ltr" as const,
    caller: "Bonjour, je souhaite vérifier le statut d'un virement émis ce matin.",
    agent: "Le virement est en cours de traitement. Voulez-vous une confirmation par message ?",
  },
];

export const valueProps = [
  {
    title: "24/7 Voice Coverage",
    body: "Always-on agents for customer operations.",
    icon: "clock" as const,
    stat: "Always-on",
    statLabel: "Coverage model",
    note: "A platform property: agents do not log off. Not a measured availability figure.",
  },
  {
    title: "Lower OpEx",
    body: "Automate repetitive customer tasks.",
    icon: "trending" as const,
    stat: "Automation",
    statLabel: "Of repeat contacts",
    note: "Positioning statement. CenterAI publishes no cost-saving percentage.",
  },
  {
    title: "Faster Response",
    body: "<300ms interaction for natural flow.",
    icon: "gauge" as const,
    stat: "<300ms",
    statLabel: "Design target",
    note: "Engineering target for a single agent turn, stated as a spec — not a benchmark result.",
  },
  {
    title: "Enterprise Scale",
    body: "Architecture sized for thousands of simultaneous calls.",
    icon: "layers" as const,
    stat: "Elastic",
    statLabel: "Concurrency model",
    note: "Capacity is sized per deployment. No throughput figure is published.",
  },
];

/** Rows in the impact card. Values are entered by the visitor — nothing is pre-filled by CenterAI. */
export const modelRows = [
  {
    id: "automation",
    label: "Share of repeat contacts you assume the agent can resolve",
    unit: "%",
    kind: "slider" as const,
  },
  {
    id: "response",
    label: "Response-time improvement you are targeting",
    unit: "%",
    kind: "slider" as const,
  },
  {
    id: "coverage",
    label: "Opening hours the agent covers",
    unit: "/7 days",
    kind: "fixed" as const,
    value: "24/7",
  },
];

export const voices = [
  { name: "Layla", locale: "AR-JO", style: "Warm · Service", pitch: "Mid" },
  { name: "Omar", locale: "AR-SA", style: "Formal · Banking", pitch: "Low" },
  { name: "Nour", locale: "AR-EG", style: "Bright · Retail", pitch: "High" },
  { name: "Yusuf", locale: "EN-GB", style: "Neutral · Collections", pitch: "Mid" },
  { name: "Camille", locale: "FR-FR", style: "Calm · Advisory", pitch: "Mid" },
  { name: "Salem", locale: "AR-AE", style: "Authorised · Ops", pitch: "Deep" },
];

export const dialects = [
  { text: "أهلاً بك", label: "Arabic — MSA" },
  { text: "كيف حالك؟", label: "Levantine / Jordanian" },
  { text: "شنو تحتاج؟", label: "Gulf — Najdi" },
  { text: "Welcome", label: "English — Neutral" },
  { text: "Bonjour", label: "French — Levant" },
  { text: "مرحبا بيك", label: "Levantine — Egyptian" },
  { text: "أهلاً وسهلاً", label: "Arabic — Gulf" },
];

export const useCases = [
  {
    id: "fraud",
    title: "Fraud Detection",
    blurb: "Automated verification and suspicious-call workflows.",
    detail:
      "Real-time anomaly prompts on inbound calls, step-up verification, and instant case creation with the transcript attached to your core system.",
    placeholder: false,
    dialogue: [
      { role: "Agent", text: "We flagged a card transaction at 02:14 that does not match your usual pattern. Was this you?" },
      { role: "Caller", text: "No, that wasn't me." },
      { role: "Agent", text: "I've raised a card-freeze request and opened a case. A fraud officer will call you back." },
    ],
    tags: ["Step-up auth", "Case creation", "Freeze request"],
  },
  {
    id: "service",
    title: "Customer Service",
    blurb: "Voice support for balance and transaction enquiries.",
    detail:
      "Balance, IBAN, chequebook, card limits and statement requests handled end to end, with a warm handover to a human when policy requires it.",
    placeholder: false,
    dialogue: [
      { role: "Caller", text: "What's my available balance, and did my salary come in?" },
      { role: "Agent", text: "Your available balance is shown in the secure message I've just sent. Your salary posted this morning." },
      { role: "Agent", text: "Anything else I can handle for you?" },
    ],
    tags: ["Core API access", "Human handover", "Multi-dialect"],
  },
  {
    id: "identity",
    title: "Identity Verification",
    blurb: "Voice-based multi-factor authentication flows.",
    detail:
      "Voiceprint matching layered with knowledge-based checks and OTP over a separate channel, with every step written to an audit trail.",
    placeholder: false,
    dialogue: [
      { role: "Agent", text: "Please repeat the sentence shown in your app to complete voice verification." },
      { role: "Caller", text: "My voice is my password, verify me." },
      { role: "Agent", text: "Voice match accepted against your enrolled profile. Verification approved — reference logged." },
    ],
    tags: ["Voiceprint check", "OTP fallback", "Audit log"],
  },
  {
    id: "collections",
    title: "Collections",
    blurb: "Outbound customer engagement campaigns.",
    detail:
      "Policy-bounded outbound reminders with commitment capture, self-service payment links, and escalation rules per segment.",
    placeholder: false,
    dialogue: [
      { role: "Agent", text: "Good evening. This is a reminder on your instalment due Thursday. Would you like to pay now or reschedule?" },
      { role: "Caller", text: "Send me the link, I'll pay today." },
      { role: "Agent", text: "Sending a secure payment link now. Thank you — have a good evening." },
    ],
    tags: ["Guardrails", "Payment links", "Opt-out handling"],
  },
];

export const sectors = [
  {
    title: "Finance",
    body: "Wealth management and insurance automation.",
    image:
      "https://images.pexels.com/photos/5504088/pexels-photo-5504088.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    alt: "Black and white low-angle view of a modern financial district building",
    capabilities: ["Onboarding", "Claims", "Advisory booking"],
  },
  {
    title: "Healthcare",
    body: "Patient intake and appointment scheduling.",
    image:
      "https://images.pexels.com/photos/19814026/pexels-photo-19814026.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    alt: "Monochrome close-up of sterile medical instruments prepared for a procedure",
    capabilities: ["Reminder calls", "Triage intake", "No-show recovery"],
  },
  {
    title: "Legal",
    body: "Transcription and case management assistants.",
    image:
      "https://images.pexels.com/photos/29861708/pexels-photo-29861708.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    alt: "Circular law library interior with tiered wooden bookshelves",
    capabilities: ["Bilingual transcripts", "Intake screening", "Deadline capture"],
  },
  {
    title: "Enterprise",
    body: "HR, IT support, and internal operations.",
    image:
      "https://images.pexels.com/photos/24235387/pexels-photo-24235387.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    alt: "Black and white geometric corner of a corporate headquarters facade",
    capabilities: ["Service desk", "HR line", "Field ops"],
  },
];

export const integrations = [
  { name: "ZainCash", note: "Rail adapter — in scope", icon: "wallet" as const },
  { name: "Orange Money", note: "Rail adapter — in scope", icon: "mobile" as const },
  { name: "UWallet", note: "Wallet ops adapter — in scope", icon: "wallet" as const },
  { name: "CliQ", note: "Payment network adapter — scoped", icon: "bolt" as const },
  { name: "Core Banking", note: "Host adapters, scoped per bank", icon: "bank" as const },
  { name: "CRM", note: "Salesforce · HubSpot · Zoho via API", icon: "users" as const },
  { name: "CCaaS", note: "Genesys · Twilio · Avaya interop targets", icon: "headset" as const },
];

export const integrationIntro =
  "Engineered to connect with local payment systems and Arabic-first voice experiences. Named systems are integration targets we scope with you — not certifications, endorsements, or existing marketplace listings.";

export const integrationDisclaimer =
  "Adapter names indicate engineering intent only. Certification status, commercial agreements and go-live dates are confirmed in writing per deployment.";

export const arabicSample = {
  ar: "أهلاً بك في CenterAI. نقدّر نتكلم معك بالعربي — بالعامية الأردنية أو بالفصحى — ونكمل بالإنجليزي إذا فضّلت.",
  en: "“Welcome to CenterAI. We can speak with you in Arabic — Jordanian dialect or MSA — and continue in English if you prefer.”",
  note: "Dialect handling is tuned for the Arabic varieties listed here. Detection quality is assessed during your evaluation; no accuracy figure is published.",
};

export const menaPillars = [
  { title: "Local Connectivity", body: "Payment-rail adapters in scope." },
  { title: "Arabic-First", body: "Dialect-aware agent behaviour." },
  { title: "MENA Infrastructure", body: "Regional deployment planning." },
];

export const regions = [
  { code: "AMM", name: "Amman", status: "Headquarters" },
  { code: "ALR", name: "Riyadh", status: "Not launched" },
  { code: "DXB", name: "Dubai", status: "Not launched" },
  { code: "CAI", name: "Cairo", status: "Under discussion" },
  { code: "DOH", name: "Doha", status: "Roadmap" },
  { code: "KWI", name: "Kuwait City", status: "Roadmap" },
];

export const regionsNote =
  "Jordan is the announced base of operations. No other market is claimed as live, licensed or serving customers today.";

export const stack = [
  { label: "Caller", sub: "PSTN / Mobile" },
  { label: "Gateway", sub: "Real SIM · Number routing" },
  { label: "Media Engine", sub: "Sub-300ms target" },
  { label: "Voice Agent", sub: "Intent · Reason · Act" },
  { label: "Your Systems", sub: "Core · CRM · Payments" },
];

export const infraStats = [
  {
    value: "Per contract",
    label: "Uptime SLA",
    placeholder: false,
    note: "No standard SLA number is published. Availability commitments are negotiated per deployment.",
  },
  {
    value: "Measured in pilot",
    label: "Jitter & packet loss",
    placeholder: false,
    note: "No design figure is claimed. These are instrumented against your circuits during evaluation.",
  },
  {
    value: "In-region",
    label: "Media + inference placement",
    placeholder: false,
    note: "Architecture intent: media and reasoning placed in the same region as the call.",
  },
  {
    value: "2N",
    label: "Gateway redundancy pattern",
    placeholder: false,
    note: "Describes the redundancy approach — it is not an availability guarantee.",
  },
];

export const infraStatsNote =
  "This section describes how the platform is built. It deliberately contains no uptime, latency or quality numbers until they are measured on a real deployment.";

export const proofStats = [
  {
    value: "—",
    label: "Daily calls handled",
    placeholder: true,
    note: "No volume figure is published for this platform.",
  },
  {
    value: "Jordan",
    label: "Headquarters",
    placeholder: false,
    note: "Registered and operating out of Amman.",
  },
  {
    value: "Arabic",
    label: "Dialect-first engineering",
    placeholder: false,
    note: "Primary tuning focus of the voice stack.",
  },
  {
    value: "Fintech",
    label: "Priority sector",
    placeholder: false,
    note: "A chosen focus area — not a certification, endorsement or customer count.",
  },
];

export const evaluationStages = [
  { stage: "Stage 1", title: "Scope & telephony", body: "Use cases, number ranges, recording consent language." },
  { stage: "Stage 2", title: "Agent build", body: "Flows, dialect tuning, tool access to core systems." },
  { stage: "Stage 3", title: "Shadow traffic", body: "Silent evaluation against your QA rubric before go-live." },
  { stage: "Stage 4", title: "Gradual rollout", body: "Percentage ramp with human handover and kill switch." },
];

export const evaluationNote =
  "An indicative sequence, not a delivery commitment. Timelines depend on your telephony, data access and compliance review.";

export const pricing = [
  {
    name: "Starter",
    tagline: "For small businesses and testing.",
    price: "Usage-based",
    priceNote: "No public rate card. A monthly commitment is quoted from your expected volume.",
    cta: "Request Access",
    recommended: false,
    features: [
      { label: "One inbound voice agent", on: true },
      { label: "Shared voice library", on: true },
      { label: "Basic integrations", on: true },
      { label: "Usage-based billing", on: true },
      { label: "Outbound campaigns", on: false },
      { label: "Dedicated infrastructure", on: false },
    ],
  },
  {
    name: "Business",
    tagline: "For growing enterprises.",
    price: "Usage-based",
    priceNote: "Committed-minute tiers are quoted per scope, not published.",
    cta: "Book a Pilot",
    recommended: true,
    features: [
      { label: "Inbound + outbound agents", on: true },
      { label: "CRM and core-system integrations (scoped)", on: true },
      { label: "Automated voice campaigns", on: true },
      { label: "Real number routing", on: true },
      { label: "Priority support", on: true },
      { label: "Dedicated infrastructure", on: false },
    ],
  },
  {
    name: "Enterprise",
    tagline: "Custom deployment and scale.",
    price: "Contact sales",
    priceNote: "Private or hybrid deployment, security review and SLA terms agreed per institution.",
    cta: "Talk to Sales",
    recommended: false,
    features: [
      { label: "Dedicated infrastructure", on: true },
      { label: "Negotiated SLA & security review", on: true },
      { label: "Custom voice solutions & cloning", on: true },
      { label: "Private model / isolated deployment options", on: true },
      { label: "Named solutions architect", on: true },
      { label: "24/7 incident escalation", on: true },
    ],
  },
];

export const pricingDisclaimer =
  "Plan structure shows how engagements are shaped. Nothing on this page is a quote, a price list, or a commitment to a specific commercial term.";

export const billingModel =
  "Indicative model: minutes are metered on connected agent time, telephony is billed at the underlying carrier rate, and Enterprise terms (capacity, security review, SLA) are agreed per market. Exact mechanics are set in the contract.";

export const ctaFootnote = "Demo requests are handled by the founding team in Amman. No response time is promised.";

export const statusTooltip =
  "Demonstration indicator. This build does not publish a live status feed; operational status is shared with customers during onboarding.";

export const footerColumns = [
  {
    title: "Platform",
    links: [
      { label: "Voice Platform", target: "platform" },
      { label: "Infrastructure", target: "infrastructure" },
      { label: "Integrations", target: "integrations" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Banking", target: "solutions" },
      { label: "Healthcare", target: "solutions" },
      { label: "Enterprise", target: "solutions" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Interactive Voice Demo", target: "voice-demo" },
      { label: "Business Value", target: "value" },
      { label: "Evidence & Placeholders", target: "proof" },
      { label: "Pricing", target: "pricing" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", legal: "privacy" },
      { label: "Terms", legal: "terms" },
      { label: "Data & Compliance", legal: "data" },
    ],
  },
];

export const legalCopy: Record<string, { title: string; body: string[] }> = {
  privacy: {
    title: "Privacy",
    body: [
      "Call audio, transcripts and metadata are processed to operate the voice agent for the purposes agreed in your service schedule.",
      "Retention windows, access roles and sub-processor lists are defined contractually per deployment. This summary is a placeholder for the published policy.",
    ],
  },
  terms: {
    title: "Terms of Service",
    body: [
      "Platform access is governed by a master services agreement plus the applicable acceptable-use and telephony regulations policy for each country of operation.",
      "Placeholder summary — the executed terms document is published before general availability.",
    ],
  },
  data: {
    title: "Data & Compliance",
    body: [
      "Data residency, recording consent prompts and outbound calling hours are configured per market and per campaign before any number goes live.",
      "Security review artefacts (penetration test summary, DR plan, access model) are provided under NDA during enterprise evaluation. No certification is claimed on this site.",
    ],
  },
};
