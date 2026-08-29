import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, API_BASE_URL } from "@/api";
import {
  DEMO_AGENTS,
  DEMO_CAMPAIGNS,
  DEMO_INTEGRATIONS,
  DEMO_NOTICE,
  DEMO_SESSIONS,
  DEFAULT_INSTRUCTIONS,
  demoAgentPerformance,
  demoDailySeries,
  demoLanguageMix,
  demoUsageTotals,
  type StudioAgent,
  type StudioCampaign,
  type StudioIntegration,
  type StudioSession,
} from "./data/demoWorkspace";
import type { AgentDto } from "../../shared/contracts";

export type DataOrigin = "loading" | "demo" | "live";
export type ToastTone = "info" | "success" | "warn";

export interface StudioToast {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface AgentDraft {
  name: string;
  industry: StudioAgent["industry"];
  language: StudioAgent["language"];
  voice: string;
  instructions: string;
  welcomeMessage: string;
  description?: string;
  status?: StudioAgent["status"];
}

interface StudioValue {
  origin: DataOrigin;
  originNote: string;
  demoNotice: string;
  agentsLoading: boolean;
  agentsError: string | null;
  agents: StudioAgent[];
  sessions: StudioSession[];
  campaigns: StudioCampaign[];
  integrations: StudioIntegration[];
  requested: string[];
  totals: ReturnType<typeof demoUsageTotals>;
  series: ReturnType<typeof demoDailySeries>;
  languages: ReturnType<typeof demoLanguageMix>;
  performance: ReturnType<typeof demoAgentPerformance>;
  query: string;
  setQuery: (value: string) => void;
  toast: StudioToast | null;
  pushToast: (message: string, tone?: ToastTone) => void;
  reloadAgents: () => Promise<void>;
  createAgent: (draft: AgentDraft) => Promise<boolean>;
  updateAgent: (id: string, patch: Partial<AgentDraft>) => Promise<boolean>;
  setAgentStatus: (id: string, status: StudioAgent["status"]) => Promise<boolean>;
  deleteAgent: (id: string) => Promise<boolean>;
  createCampaign: (input: {
    name: string;
    agentId: string;
    audience: string;
    audienceSize: number;
    scheduledFor: string | null;
  }) => StudioCampaign;
  setCampaignStatus: (id: string, status: StudioCampaign["status"]) => void;
  requestIntegration: (id: string) => void;
  resetWorkspace: () => void;
}

const StudioContext = createContext<StudioValue | null>(null);

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

const toStudioAgent = (dto: AgentDto): StudioAgent => ({
  id: dto.id,
  name: dto.name,
  industry: (dto.industry ?? "Banking") as StudioAgent["industry"],
  language: dto.language,
  voice: dto.voice,
  status: (dto.status ?? (dto.enabled ? "active" : "paused")) as StudioAgent["status"],
  instructions: DEFAULT_INSTRUCTIONS,
  welcomeMessage: dto.welcomeMessage ?? "",
  description: dto.description,
  createdAt: dto.createdAt || new Date().toISOString(),
  updatedAt: dto.updatedAt || new Date().toISOString(),
  recordSource: "server",
});

export function StudioProvider({ children }: { children: ReactNode }) {
  const [origin, setOrigin] = useState<DataOrigin>(API_BASE_URL ? "loading" : "demo");
  const [originNote, setOriginNote] = useState(
    API_BASE_URL ? "Loading agents from the CenterAI API…" : "Demo workspace — no API base URL configured"
  );
  const [agents, setAgents] = useState<StudioAgent[]>(() => clone(DEMO_AGENTS));
  const [agentsLoading, setAgentsLoading] = useState(Boolean(API_BASE_URL));
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<StudioSession[]>(() => clone(DEMO_SESSIONS));
  const [campaigns, setCampaigns] = useState<StudioCampaign[]>(() => clone(DEMO_CAMPAIGNS));
  const [integrations] = useState<StudioIntegration[]>(() => clone(DEMO_INTEGRATIONS));
  const [requested, setRequested] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<StudioToast | null>(null);
  const toastTimer = useRef(0);

  const pushToast = useCallback((message: string, tone: ToastTone = "info") => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(toastTimer.current);
  }, [toast]);

  const reloadAgents = useCallback(async () => {
    if (!API_BASE_URL) {
      setOrigin("demo");
      setAgentsLoading(false);
      return;
    }
    setAgentsLoading(true);
    const result = await api.agents();
    if (result.ok && result.data.length >= 0) {
      setAgents(result.data.map(toStudioAgent));
      setOrigin("live");
      setOriginNote(`Agents persisted by the CenterAI API (${result.data.length} rows)`);
      setAgentsError(null);
    } else {
      setOrigin("demo");
      setAgents(clone(DEMO_AGENTS));
      setOriginNote("Demo workspace — the API did not return agents");
      setAgentsError(result.ok ? null : result.error.message);
    }
    setAgentsLoading(false);
  }, []);

  useEffect(() => {
    void reloadAgents();
  }, [reloadAgents]);

  const persist = useCallback(
    async (run: () => Promise<{ ok: boolean; error?: { message: string } } | { ok: true; data: unknown }>) => {
      try {
        return await run();
      } catch {
        return { ok: false as const, error: { message: "Request failed" } };
      }
    },
    []
  );

  const createAgent = useCallback<StudioValue["createAgent"]>(
    async (draft) => {
      const payload = {
        name: draft.name.trim(),
        description: draft.description?.trim() ?? "",
        industry: draft.industry,
        language: draft.language,
        voice: draft.voice,
        systemPrompt: draft.instructions.trim(),
        welcomeMessage: draft.welcomeMessage.trim(),
        status: draft.status ?? "draft",
      };

      if (API_BASE_URL) {
        const result = await persist(() => api.createAgent(payload));
        if (!result.ok) {
          pushToast(result.error?.message ?? "Could not create the agent.", "warn");
          return false;
        }
        await reloadAgents();
        pushToast(`“${payload.name}” saved to your organization.`, "success");
        return true;
      }

      const stamp = new Date().toISOString();
      setAgents((prev) => [
        {
          ...draft,
          id: newId("agt"),
          welcomeMessage: payload.welcomeMessage,
          instructions: payload.systemPrompt,
          description: payload.description,
          status: (draft.status ?? "draft") as StudioAgent["status"],
          createdAt: stamp,
          updatedAt: stamp,
          recordSource: "demo",
        },
        ...prev,
      ]);
      pushToast("Draft saved in this browser session. No API is configured, so nothing was persisted.", "info");
      return true;
    },
    [persist, pushToast, reloadAgents]
  );

  const updateAgent = useCallback<StudioValue["updateAgent"]>(
    async (id, patch) => {
      if (API_BASE_URL) {
        const result = await persist(() =>
          api.updateAgent(id, {
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.description !== undefined ? { description: patch.description } : {}),
            ...(patch.industry !== undefined ? { industry: patch.industry } : {}),
            ...(patch.language !== undefined ? { language: patch.language } : {}),
            ...(patch.voice !== undefined ? { voice: patch.voice } : {}),
            ...(patch.instructions !== undefined ? { systemPrompt: patch.instructions } : {}),
            ...(patch.welcomeMessage !== undefined ? { welcomeMessage: patch.welcomeMessage } : {}),
            ...(patch.status !== undefined ? { status: patch.status } : {}),
          })
        );
        if (!result.ok) {
          pushToast(result.error?.message ?? "Could not update the agent.", "warn");
          return false;
        }
        await reloadAgents();
        pushToast("Agent saved.", "success");
        return true;
      }

      setAgents((prev) =>
        prev.map((agent) =>
          agent.id === id ? { ...agent, ...patch, updatedAt: new Date().toISOString() } : agent
        )
      );
      pushToast("Saved in this browser session only.", "info");
      return true;
    },
    [persist, pushToast, reloadAgents]
  );

  const setAgentStatus = useCallback<StudioValue["setAgentStatus"]>(
    async (id, status) => updateAgent(id, { status }),
    [updateAgent]
  );

  const deleteAgent = useCallback<StudioValue["deleteAgent"]>(
    async (id) => {
      const target = agents.find((agent) => agent.id === id);
      if (API_BASE_URL) {
        const result = await persist(() => api.deleteAgent(id));
        if (!result.ok) {
          pushToast(result.error?.message ?? "Could not delete the agent.", "warn");
          return false;
        }
        await reloadAgents();
        pushToast(`“${target?.name ?? "Agent"}” deleted.`, "success");
        return true;
      }
      setAgents((prev) => prev.filter((agent) => agent.id !== id));
      pushToast(`“${target?.name ?? "Agent"}” removed from this session.`, "info");
      return true;
    },
    [agents, persist, pushToast, reloadAgents]
  );

  const createCampaign = useCallback<StudioValue["createCampaign"]>(
    (input) => {
      const agent = agents.find((a) => a.id === input.agentId);
      const campaign: StudioCampaign = {
        id: newId("cmp"),
        name: input.name.trim(),
        agentId: input.agentId,
        agentName: agent?.name ?? input.agentId,
        audience: input.audience.trim(),
        audienceSize: Number.isFinite(input.audienceSize) ? Math.max(0, input.audienceSize) : 0,
        status: input.scheduledFor ? "scheduled" : "draft",
        scheduledFor: input.scheduledFor,
        window: "10:00–13:00 Asia/Amman",
      };
      setCampaigns((prev) => [campaign, ...prev]);
      return campaign;
    },
    [agents]
  );

  const setCampaignStatus = useCallback((id: string, status: StudioCampaign["status"]) => {
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
  }, []);

  const requestIntegration = useCallback(
    (id: string) => {
      setRequested((prev) => (prev.includes(id) ? prev : [...prev, id]));
      const target = integrations.find((item) => item.id === id);
      pushToast(
        `${target?.name ?? "Integration"} marked as requested. No connector is installed and no credential is stored in the browser.`,
        "info"
      );
    },
    [integrations, pushToast]
  );

  const resetWorkspace = useCallback(() => {
    setAgents(clone(DEMO_AGENTS));
    setSessions(clone(DEMO_SESSIONS));
    setCampaigns(clone(DEMO_CAMPAIGNS));
    setRequested([]);
    setQuery("");
    pushToast("Demo workspace restored to its seeded state. Real rows in your organization were not touched.", "info");
  }, [pushToast]);

  const derived = useMemo(
    () => ({
      totals: demoUsageTotals(),
      series: demoDailySeries(14),
      languages: demoLanguageMix(),
      performance: demoAgentPerformance(),
    }),
    []
  );

  const value = useMemo<StudioValue>(
    () => ({
      origin,
      originNote,
      demoNotice: DEMO_NOTICE,
      agentsLoading,
      agentsError,
      agents,
      sessions,
      campaigns,
      integrations,
      requested,
      ...derived,
      query,
      setQuery,
      toast,
      pushToast,
      reloadAgents,
      createAgent,
      updateAgent,
      setAgentStatus,
      deleteAgent,
      createCampaign,
      setCampaignStatus,
      requestIntegration,
      resetWorkspace,
    }),
    [
      origin,
      originNote,
      agentsLoading,
      agentsError,
      agents,
      sessions,
      campaigns,
      integrations,
      requested,
      derived,
      query,
      toast,
      pushToast,
      reloadAgents,
      createAgent,
      updateAgent,
      setAgentStatus,
      deleteAgent,
      createCampaign,
      setCampaignStatus,
      requestIntegration,
      resetWorkspace,
    ]
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used inside <StudioProvider>");
  return ctx;
}

/** Sessions narrowed by the topbar search — shared by Overview and Voice Sessions. */
export function useFilteredSessions(scope?: string) {
  const { sessions, query } = useStudio();
  return useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sessions.filter((session) => {
      if (scope && session.agentId !== scope) return false;
      if (!needle) return true;
      return (
        session.id.toLowerCase().includes(needle) ||
        session.agentName.toLowerCase().includes(needle) ||
        session.status.includes(needle)
      );
    });
  }, [sessions, query, scope]);
}