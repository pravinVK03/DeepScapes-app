"use client";

import { useState } from "react";
import { Collaborator, CollaborationPermission, Scape } from "@/lib/mock-data";
import { newId } from "@/lib/scape-store";
import { useNotifications } from "@/components/ui/notification-center";
import { Icon } from "@/components/ui/icons";

export function ShareScape({ scape, close, save }: { scape: Scape; close: () => void; save: (next: Scape) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<CollaborationPermission>("edit");
  const [saving, setSaving] = useState(false);
  const { notify } = useNotifications();
  const collaborators = scape.collaborators ?? [];

  async function update(next: Collaborator[]) {
    setSaving(true);
    try {
      await save({ ...scape, collaborators: next, activity: [{ id: newId("activity"), action: "Collaboration updated", detail: "Scape sharing settings changed", time: new Date().toISOString() }, ...scape.activity] });
      return true;
    } catch (cause) {
      notify({ tone: "error", title: "Collaboration was not updated", detail: cause instanceof Error ? cause.message : "Please try again." });
      return false;
    } finally { setSaving(false); }
  }

  async function invite() {
    const value = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      notify({ tone: "error", title: "Enter a valid email address", detail: "Use the collaborator's email to send an invitation." });
      return;
    }
    if (collaborators.some((person) => person.email === value)) {
      notify({ tone: "info", title: "Already invited", detail: `${value} already has access to this Scape.` });
      return;
    }
    if (await update([...collaborators, { id: newId("collaborator"), name: value.split("@")[0], email: value, permission, pending: true }])) {
      setEmail("");
      notify({ tone: "success", title: "Invitation ready", detail: `${value} can ${permission === "edit" ? "edit" : "view"} this Scape.` });
    }
  }

  async function setMemberPermission(id: string, next: CollaborationPermission) {
    if (await update(collaborators.map((person) => person.id === id ? { ...person, permission: next } : person))) {
      notify({ tone: "success", title: "Permission updated", detail: `Collaborator can now ${next} this Scape.` });
    }
  }

  async function remove(id: string) {
    const person = collaborators.find((member) => member.id === id);
    if (await update(collaborators.filter((person) => person.id !== id))) notify({ tone: "success", title: "Collaborator removed", detail: person?.email || "Access has been removed." });
  }

  return <div className="fixed inset-0 z-40 grid place-items-end bg-black/65 p-4 backdrop-blur-[2px] sm:place-items-center" onMouseDown={close}>
    <section onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="share-title" className="share-dialog w-full max-w-xl rounded-[1.75rem] border border-[#e5e8e2] bg-[#f9faf7] p-5 shadow-2xl sm:p-7">
      <header className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-medium uppercase tracking-[.16em] text-[#718077]">Collaboration</p><h2 id="share-title" className="mt-2 text-2xl font-semibold tracking-[-.04em]">Share {scape.title}</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#718077]">Invite people to view or help shape this Scape. You can change access at any time.</p></div>
        <button type="button" onClick={close} className="share-close grid h-9 w-9 place-items-center rounded-full text-[#718077] transition" aria-label="Close sharing"><Icon name="close" className="h-4 w-4" /></button>
      </header>
      <div className="mt-7 rounded-2xl border border-[#e0e5df] bg-white p-3 sm:p-4">
        <label className="block text-xs font-medium uppercase tracking-[.12em] text-[#718077]">Invite a collaborator</label>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"><input autoFocus value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void invite()} type="email" placeholder="name@example.com" className="min-w-0 rounded-xl border border-[#dce1d9] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#315443] focus:ring-4 focus:ring-[#315443]/10" /><select value={permission} onChange={(event) => setPermission(event.target.value as CollaborationPermission)} aria-label="Invitation permission" className="permission-select rounded-xl border border-[#dce1d9] bg-white px-3 py-2.5 text-sm"><option value="edit">Can edit</option><option value="view">Can view</option></select><button disabled={saving} onClick={() => void invite()} className="rounded-xl bg-[#315443] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#254235] disabled:cursor-wait disabled:opacity-50">{saving ? "Inviting…" : "Invite"}</button></div>
      </div>
      <section className="mt-6"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">People with access</h3><p className="mt-1 text-xs text-[#718077]">{collaborators.length ? `${collaborators.length} collaborator${collaborators.length === 1 ? "" : "s"}` : "Only you have access"}</p></div></div><div className="mt-3 space-y-2">{collaborators.length === 0 ? <div className="rounded-2xl border border-dashed border-[#dce1d9] px-4 py-6 text-center text-sm text-[#718077]">Invite a teammate to start collaborating.</div> : collaborators.map((person) => { const isOwner = person.id === scape.ownerId; return <div key={person.id} className="share-member flex flex-wrap items-center gap-3 rounded-2xl border border-[#e5e8e2] bg-white p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf0df] text-sm font-semibold text-[#315443]">{person.name.slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{person.name}{person.pending && <span className="ml-2 rounded-full bg-[#f2f4ed] px-2 py-0.5 text-[11px] font-medium text-[#718077]">Invited</span>}</p><p className="mt-1 truncate text-xs text-[#718077]">{person.email}</p></div>{isOwner ? <span className="rounded-full bg-[#edf0df] px-2.5 py-1 text-xs font-medium text-[#315443]">Owner</span> : <div className="ml-auto flex items-center gap-1"><button type="button" disabled={saving} onClick={() => void setMemberPermission(person.id, "view")} aria-pressed={person.permission === "view"} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${person.permission === "view" ? "bg-[#edf0df] text-[#315443]" : "text-[#718077] hover:bg-[#f2f4ed]"}`}>View</button><button type="button" disabled={saving} onClick={() => void setMemberPermission(person.id, "edit")} aria-pressed={person.permission === "edit"} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${person.permission === "edit" ? "bg-[#edf0df] text-[#315443]" : "text-[#718077] hover:bg-[#f2f4ed]"}`}>Edit</button><button type="button" disabled={saving} onClick={() => void remove(person.id)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#a95b54] transition hover:bg-[#f7e8e5]">Remove</button></div>}</div>; })}</div></section>
    </section>
  </div>;
}
