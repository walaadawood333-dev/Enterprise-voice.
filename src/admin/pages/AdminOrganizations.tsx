/**
 * Admin Organizations — List and manage customer organizations.
 */
import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";

interface OrgRow { id: string; name: string; slug: string; status: string; createdAt: string; }

export function AdminOrganizations() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/organizations")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => { setOrgs(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 space-y-6">
      <div>
        <p className="text-xs font-display uppercase tracking-widest text-white/40 mb-1">Organization Management</p>
        <h2 className="text-2xl font-display font-bold tracking-tight">Organizations</h2>
      </div>

      {loading ? (
        <p className="text-white/40 text-sm">Loading organizations...</p>
      ) : orgs.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <Building2 size={32} className="mx-auto text-white/20 mb-3" />
          <p className="text-white/40 text-sm">No organizations found</p>
          <p className="text-white/25 text-xs mt-1">Organizations will appear here when registered.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left text-xs font-display uppercase tracking-widest text-white/40">
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {orgs.map((org) => (
                <tr key={org.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium">{org.name}</td>
                  <td className="px-4 py-3 text-white/50 font-mono text-xs">{org.slug}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      org.status === "active" ? "bg-emerald-500/10 text-emerald-300" :
                      org.status === "trial" ? "bg-blue-500/10 text-blue-300" :
                      "bg-red-500/10 text-red-300"
                    }`}>{org.status}</span>
                  </td>
                  <td className="px-4 py-3 text-white/40 text-xs">{new Date(org.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
