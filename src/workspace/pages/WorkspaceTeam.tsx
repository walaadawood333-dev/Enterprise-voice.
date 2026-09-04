import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Users } from "lucide-react";
import { apiFetch } from "@/api";

interface TeamMember { id: string; name: string; email: string; role: string; createdAt: string }

export function WorkspaceTeam() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch("/api/users").then(async (response) => {
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? "Your role cannot view the team directory.");
      } else {
        const payload = await response.json();
        setMembers(Array.isArray(payload) ? payload : []);
      }
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6 p-8">
      <div>
        <p className="font-display text-[10px] uppercase tracking-[0.2em] text-black/35">Tenant administration</p>
        <h2 className="mt-1 font-display text-2xl font-bold">Team & roles</h2>
        <p className="mt-2 text-sm text-black/45">Membership is read from the authenticated organization only.</p>
      </div>
      {loading ? <p className="inline-flex items-center gap-2 text-sm text-black/45"><Loader2 size={14} className="animate-spin" /> Loading team…</p> : null}
      {error ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</p> : null}
      {!loading && !error && members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 bg-white p-10 text-center"><Users className="mx-auto text-black/15" /><p className="mt-3 text-sm text-black/45">No team members found.</p></div>
      ) : null}
      {members.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-hair bg-white">
          <table className="w-full text-sm">
            <thead className="bg-mist text-left text-[10px] uppercase tracking-wider text-black/40"><tr><th className="px-4 py-3">Member</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Joined</th></tr></thead>
            <tbody className="divide-y divide-hair">
              {members.map((member) => (
                <tr key={member.id}><td className="px-4 py-3"><strong>{member.name}</strong><span className="block text-xs text-black/40">{member.email}</span></td><td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-2 py-1 text-xs"><ShieldCheck size={12} /> {member.role}</span></td><td className="px-4 py-3 text-xs text-black/45">{new Date(member.createdAt).toLocaleDateString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="rounded-xl border border-hair bg-white p-4 text-xs text-black/45">Role assignment and invitations are <strong>not configured</strong> in this build; no inactive control is presented as a live action.</p>
    </div>
  );
}
