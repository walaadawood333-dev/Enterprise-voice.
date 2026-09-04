import { ContactRound } from "lucide-react";

export function WorkspaceContacts() {
  return (
    <div className="space-y-6 p-8">
      <div><p className="font-display text-[10px] uppercase tracking-[0.2em] text-black/35">Customer data</p><h2 className="mt-1 font-display text-2xl font-bold">Contacts</h2></div>
      <section className="max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-8">
        <ContactRound size={30} className="text-amber-700" />
        <h3 className="mt-4 font-display text-lg font-bold text-amber-950">Not configured</h3>
        <p className="mt-2 text-sm leading-relaxed text-amber-900/75">
          CenterAI does not expose a general contact repository API in this build. Do-not-call records and connector mappings are separate governed resources, so this page does not fabricate a contact list or offer inactive write controls.
        </p>
      </section>
    </div>
  );
}
