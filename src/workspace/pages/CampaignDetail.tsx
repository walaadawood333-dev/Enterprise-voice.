import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Users, PhoneCall, Calendar, CheckCircle, XCircle, Clock, Edit2, Trash2 } from "lucide-react";
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

export function CampaignDetail() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!campaignId) return;
    fetch(`/api/workspace/campaigns/${campaignId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setCampaign)
      .catch(() => setError(true));
  }, [campaignId]);

  const handleUpdateStatus = async (newStatus: Campaign["status"]) => {
    if (!campaignId) return;
    try {
      const res = await fetch(`/api/workspace/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCampaign(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!campaignId || !confirm("Are you sure you want to delete this campaign?")) return;
    try {
      const res = await fetch(`/api/workspace/campaigns/${campaignId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        window.location.href = "/workspace/campaigns";
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (error) {
    return (
      <div className="p-8">
        <Link to="/workspace/campaigns" className="inline-flex items-center gap-1.5 text-sm text-black/50 hover:text-black mb-4">
          <ArrowLeft size={14} /> Back to Campaigns
        </Link>
        <div className="rounded-xl border border-hair bg-white p-12 text-center">
          <p className="text-lg font-display font-bold text-black/60">Campaign not found</p>
          <p className="text-sm text-black/40 mt-1">This campaign may belong to another organization or no longer exists.</p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-8">
        <p className="text-sm text-black/50">Loading...</p>
      </div>
    );
  }

  const progress = campaign.totalContacts > 0
    ? (campaign.processedContacts / campaign.totalContacts) * 100
    : 0;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/workspace/campaigns" className="inline-flex items-center gap-1.5 text-sm text-black/50 hover:text-black mb-4">
            <ArrowLeft size={14} /> Back to Campaigns
          </Link>
          <p className="text-[10px] font-display uppercase tracking-[0.2em] text-black/35 mb-1">Campaign Detail</p>
          <h2 className="text-2xl font-display font-bold tracking-tight">{campaign.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-hair bg-white hover:bg-mist transition-colors text-sm"
          >
            <Edit2 size={14} />
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors text-sm"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-hair bg-white p-5">
          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-black/35 mb-4">Campaign Info</h3>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Status</p>
              <span
                className={clsx(
                  "px-2 py-0.5 rounded-full text-xs font-medium",
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
              <div>
                <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Description</p>
                <p className="text-sm">{campaign.description}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Agent</p>
              <p className="text-sm font-medium">{campaign.agentName || "Not assigned"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Direction</p>
              <div className="flex items-center gap-1.5">
                <PhoneCall size={14} className="text-black/40" />
                <span className="text-sm">{campaign.direction}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Created</p>
                <p className="text-xs">{new Date(campaign.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Updated</p>
                <p className="text-xs">{new Date(campaign.updatedAt).toLocaleString()}</p>
              </div>
            </div>
            {campaign.scheduledAt && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Scheduled</p>
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} className="text-black/40" />
                  <p className="text-sm">{new Date(campaign.scheduledAt).toLocaleString()}</p>
                </div>
              </div>
            )}
            {campaign.startedAt && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Started</p>
                <p className="text-xs">{new Date(campaign.startedAt).toLocaleString()}</p>
              </div>
            )}
            {campaign.completedAt && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Completed</p>
                <p className="text-xs">{new Date(campaign.completedAt).toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-hair bg-white p-5">
          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-black/35 mb-4">Progress</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Progress</span>
                <span className="text-sm font-bold">{progress.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-mist rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-mist">
                <div className="flex items-center gap-2 mb-1">
                  <Users size={14} className="text-black/40" />
                  <span className="text-xs text-black/50">Total Contacts</span>
                </div>
                <p className="text-2xl font-display font-bold">{campaign.totalContacts}</p>
              </div>
              <div className="p-3 rounded-lg bg-mist">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} className="text-black/40" />
                  <span className="text-xs text-black/50">Processed</span>
                </div>
                <p className="text-2xl font-display font-bold">{campaign.processedContacts}</p>
              </div>
              <div className="p-3 rounded-lg bg-green-50">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle size={14} className="text-green-600" />
                  <span className="text-xs text-black/50">Completed</span>
                </div>
                <p className="text-2xl font-display font-bold text-green-700">{campaign.completedCalls}</p>
              </div>
              <div className="p-3 rounded-lg bg-red-50">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle size={14} className="text-red-600" />
                  <span className="text-xs text-black/50">Failed</span>
                </div>
                <p className="text-2xl font-display font-bold text-red-700">{campaign.failedCalls}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-hair bg-white p-5">
        <h3 className="font-display text-xs font-bold uppercase tracking-widest text-black/35 mb-4">Actions</h3>
        <div className="flex flex-wrap gap-2">
          {campaign.status === "draft" && (
            <>
              <button
                onClick={() => handleUpdateStatus("scheduled")}
                className="px-4 py-2 rounded-lg bg-yellow-600 text-white text-sm font-medium hover:bg-yellow-700 transition-colors"
              >
                Schedule
              </button>
              <button
                onClick={() => handleUpdateStatus("running")}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Start Now
              </button>
            </>
          )}
          {campaign.status === "scheduled" && (
            <button
              onClick={() => handleUpdateStatus("running")}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Start Now
            </button>
          )}
          {campaign.status === "running" && (
            <button
              onClick={() => handleUpdateStatus("paused")}
              className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 transition-colors"
            >
              Pause
            </button>
          )}
          {campaign.status === "paused" && (
            <button
              onClick={() => handleUpdateStatus("running")}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Resume
            </button>
          )}
          {(campaign.status === "running" || campaign.status === "paused") && (
            <button
              onClick={() => handleUpdateStatus("completed")}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Complete
            </button>
          )}
          {campaign.status === "draft" && (
            <button
              onClick={() => handleUpdateStatus("cancelled")}
              className="px-4 py-2 rounded-lg border border-hair text-sm font-medium hover:bg-mist transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {editing && (
        <EditCampaignModal
          campaign={campaign}
          onClose={() => setEditing(false)}
          onUpdated={(updated) => {
            setCampaign(updated);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function EditCampaignModal({
  campaign,
  onClose,
  onUpdated,
}: {
  campaign: Campaign;
  onClose: () => void;
  onUpdated: (campaign: Campaign) => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description);
  const [totalContacts, setTotalContacts] = useState(campaign.totalContacts);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workspace/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          totalContacts,
        }),
      });

      if (!res.ok) throw new Error("Failed to update campaign");
      const updated = await res.json();
      onUpdated(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-lg p-6">
        <h3 className="text-xl font-display font-bold mb-4">Edit Campaign</h3>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-black/60 mb-1 block">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-hair focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-black/60 mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-hair focus:outline-none focus:ring-2 focus:ring-black/10"
              rows={3}
            />
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
            className="px-4 py-2 rounded-lg bg-black text-white text-sm font-medium hover:bg-black/90 transition-colors disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
