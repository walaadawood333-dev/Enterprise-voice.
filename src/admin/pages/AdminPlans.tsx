export function AdminPlans() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <p className="text-xs font-display uppercase tracking-widest text-white/40 mb-1">Subscription Plans</p>
        <h2 className="text-2xl font-display font-bold tracking-tight">Plans & Pricing</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { name: "Starter", price: "$99", features: ["AI Agents", "Voice Calls", "Analytics"], limits: "5 users, 3 agents, 1000 min/mo" },
          { name: "Professional", price: "$499", features: ["Everything in Starter", "Inbound/Outbound Calls", "Advanced Analytics", "API Access"], limits: "25 users, 20 agents, 10000 min/mo" },
          { name: "Enterprise", price: "Custom", features: ["Everything in Professional", "Campaigns", "QA Evaluation", "Compliance", "Custom Branding"], limits: "Unlimited" },
        ].map((plan) => (
          <div key={plan.name} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h3 className="font-display text-lg font-bold">{plan.name}</h3>
            <p className="text-2xl font-display font-bold mt-1">{plan.price}<span className="text-sm text-white/40">/mo</span></p>
            <ul className="mt-4 space-y-1.5">
              {plan.features.map((f) => (
                <li key={f} className="text-xs text-white/50 flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-white/30" />{f}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-white/30 border-t border-white/5 pt-3">{plan.limits}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
