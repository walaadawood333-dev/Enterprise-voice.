import { apiFetch } from "@/api";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Plus, Calendar, PhoneCall, CheckCircle, XCircle } from "lucide-react";
import { clsx } from "clsx";

interface Campaign {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  agentId: string | null;
  agentName: string | null;
  status: "draft" | "scheduled" | "running" | "paused" | "completed" | "cancelled" | "failed";
  direction: "INBOUND" | "OUTBOUND";
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  totalContacts: number;
  processedContacts: number;
  completedCalls: number;
  failedCalls: number;
  configuration: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export function CampaignsList() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    apiFetch("/api/workspace/campaigns")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        setCampaigns(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-black/50">Loading campaigns...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.2em] text-black/35 mb-1">Operations</p>
          <h2 className="text-2xl font-display font-bold tracking-tight">Campaigns</h2>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black text-white text-sm font-medium hover:bg-black/90 transition-colors"
        >
          <Plus size={16} />
          New Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-hair bg-white p-12 text-center">
          <Users size={48} className="text-black/10 mx-auto mb-4" />
          <p className="text-lg font-display font-bold text-black/60">No campaigns yet</p>
          <p className="text-sm text-black/40 mt-1">
            Create your first campaign to start managing outreach operations.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              to={`/workspace/campaigns/${campaign.id}`}
              className="rounded-xl border border-hair bg-white p-5 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-display font-bold text-lg">{campaign.name}</h3>
                <span
                  className={clsx(
                    "px-2 py-0.5 rounded-full text-[10px] font-medium",
                    campaign.status === "draft" && "bg-gray-50 text-gray-700",
                    campaign.status === "scheduled" && "bg-yellow-50 text-yellow-700",
                    campaign.status === "running" && "bg-blue-50 text-blue-700",
                    campaign.status === "paused" && "bg-orange-50 text-orange-700",
                    campaign.status === "completed" && "bg-green-50 text-green-700",
                    campaign.status === "cancelled" && "bg-gray-50 text-gray-700",
                    campaign.status === "failed" && "bg-red-50 text-red-700"
                  )}
                >
                  {campaign.status}
                </span>
              </div>

              {campaign.description && (
                <p className="text-sm text-black/45 mb-3 line-clamp-2">{campaign.description}</p>
              )}

              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-black/50">
                  <Users size={12} />
                  <span>Agent: {campaign.agentName || "Not assigned"}</span>
                </div>
                <div className="flex items-center gap-2 text-black/50">
                  <PhoneCall size={12} />
                  <span>Direction: {campaign.direction}</span>
                </div>
                <div className="flex items-center gap-2 text-black/50">
                  <Calendar size={12} />
                  <span>Created: {new Date(campaign.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-hair">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <CheckCircle size={12} className="text-green-600" />
                      <span>{campaign.completedCalls}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <XCircle size={12} className="text-red-600" />
                      <span>{campaign.failedCalls}</span>
                    </div>
                  </div>
                  <span className="text-black/35">
                    {campaign.processedContacts} / {campaign.totalContacts}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateCampaignModal
          onClose={() => setShowCreate(false)}
          onCreated={(campaign) => {
            setCampaigns([campaign, ...campaigns]);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function CreateCampaignModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (campaign: Campaign) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentId, setAgentId] = useState("");
  const [direction, setDirection] = useState<"INBOUND" | "OUTBOUND">("OUTBOUND");
  const [totalContacts, setTotalContacts] = useState(0);
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch("/api/agents")
      .then((r) => (r.ok ? r.json() : []))
      .then(setAgents)
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);

    try {
      const res = await apiFetch("/api/workspace/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          agentId: agentId || null,
          direction,
          totalContacts,
        }),
      });

      if (!res.ok) throw new Error("Failed to create campaign");
      const campaign = await res.json();
      onCreated(campaign);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-lg p-6">
        <h3 className="text-xl font-display font-bold mb-4">Create Campaign</h3>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-black/60 mb-1 block">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-hair focus:outline-none focus:ring-2 focus:ring-black/10"
              placeholder="Campaign name"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-black/60 mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-hair focus:outline-none focus:ring-2 focus:ring-black/10"
              rows={3}
              placeholder="Campaign description"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-black/60 mb-1 block">Agent</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-hair focus:outline-none focus:ring-2 focus:ring-black/10"
            >
              <option value="">Select an agent (optional)</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-black/60 mb-1 block">Direction</label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-hair focus:outline-none focus:ring-2 focus:ring-black/10"
              >
                <option value="OUTBOUND">Outbound</option>
                <option value="INBOUND">Inbound</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-black/60 mb-1 block">Total Contacts</label>
              <input
                type="number"
                value={totalContacts}
                onChange={(e) => setTotalContacts(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-hair focus:outline-none focus:ring-2 focus:ring-black/10"
                min={0}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-hair text-sm font-medium hover:bg-mist transition-colors"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || submitting}
            className="px-4 py-2 rounded-lg bg-black text-white text-sm font-medium hover:bg-black/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating..." : "Create Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}
