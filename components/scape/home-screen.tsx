"use client";

import Link from "next/link";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/ui/app-header";
import { useAuth } from "@/components/auth/auth-provider";
import { Icon } from "@/components/ui/icons";
import { Scape } from "@/lib/mock-data";
import { loadRemoteScapes, saveScape, saveScapes, useScapes } from "@/lib/scape-store";
import { getBrowserSupabase } from "@/lib/supabase-browser";

function dateLabel(prefix: "Created" | "Updated", value?: string) {
  if (!value) return `${prefix} recently`;
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed)) return `${prefix} recently`;
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (prefix === "Updated" && minutes < 1) return "Updated just now";
  if (minutes < 60) return `${prefix} ${minutes || 1}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${prefix} ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return `${prefix} yesterday`;
  if (days < 14) return `${prefix} ${days} days ago`;
  return `${prefix} ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))}`;
}

function ScapeCard({ scape, index }: { scape: Scape; index: number }) {
  const cover = { "--scape-cover": scape.cover.startsWith("data:") ? `url(${scape.cover})` : scape.cover, backgroundPosition: scape.coverPosition || "center", backgroundSize: scape.coverZoom && scape.coverZoom > 1 ? `${scape.coverZoom * 100}% auto` : "cover", backgroundRepeat: "no-repeat" } as CSSProperties;
  return <Link href={`/workspace/${scape.id}`} className="scape-card rise group overflow-hidden rounded-2xl border border-[#e5e8e2] bg-white shadow-[0_8px_30px_rgba(23,35,29,.035)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(23,35,29,.09)]" style={{ animationDelay: `${index * 70}ms` }}>
    <div className="scape-card-cover h-36 p-4" style={cover}><div className="flex h-full items-end"><span className="rounded-full bg-black/30 px-3 py-1 text-xs text-white backdrop-blur">{scape.template}</span></div></div>
    <div className="p-4"><div className="flex items-center justify-between"><h3 className="font-semibold tracking-[-.03em]">{scape.title}</h3><Icon name="arrow" className="h-4 w-4 text-[#718077] transition group-hover:translate-x-1" /></div>{scape.description && <p className="mt-2 line-clamp-2 text-sm leading-5 text-[#718077]">{scape.description}</p>}<div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-[#edf0eb] pt-3 text-xs"><span className="text-[#9aa39d]">{dateLabel("Created", scape.createdAt)}</span><span className="font-medium text-[#607168]">{dateLabel("Updated", scape.updatedAt ?? scape.createdAt)}</span></div></div>
  </Link>;
}

function FeedbackForm() {
  const [category, setCategory] = useState("experience");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setStatus("");
    if (message.trim().length < 10) { setStatus("Please add at least 10 characters."); return; }
    setSending(true);
    const token = (await getBrowserSupabase()?.auth.getSession())?.data.session?.access_token;
    const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ category, rating: rating || undefined, message, page: window.location.pathname }) }).catch(() => undefined);
    let data: { error?: string; emailed?: boolean; delivery?: string } | undefined;
    try { data = response ? await response.json() as typeof data : undefined; } catch { data = undefined; }
    if (!response?.ok) { setStatus(data?.error || "Feedback could not be sent. Please try again."); setSending(false); return; }
    setMessage(""); setRating(0); setStatus(data?.emailed ? "Thank you — your feedback was saved and emailed to DeepScapes." : "Thank you — your feedback was saved.");
    setSending(false);
  }

  return <footer className="feedback-footer mt-16 border-t border-white/20">
    <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 lg:grid-cols-[.75fr_1.25fr] lg:items-start">
      <div className="flex flex-col"><p className="text-xs font-medium uppercase tracking-[.18em] text-white/55">Feedback</p><h2 className="mt-3 text-4xl font-medium leading-[1.02] tracking-[-.055em] text-white sm:text-[2.65rem]">Help shape<br /><em className="font-serif font-normal">DeepScapes.</em></h2><div className="mt-8 border-t border-white/15 pt-5"><p className="text-xs uppercase tracking-[.16em] text-white/40">Contact</p><a href="mailto:padmanathank.dev@gmail.com" className="mt-2 inline-block text-base text-white/75 transition hover:text-[#d4af37]">padmanathank.dev@gmail.com</a></div><div className="mt-10 max-w-sm lg:mt-auto lg:pt-10"><p className="text-2xl leading-[.98] tracking-[-.045em] text-white sm:text-[1.8rem]">We&apos;d love<br />to hear <em className="font-serif font-normal">from you.</em></p><span aria-hidden="true" className="mt-4 block h-px w-14 bg-[#d4af37]/80" /></div></div>
      <form onSubmit={submit} className="feedback-panel rounded-2xl border p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap gap-2">{[["experience", "Experience"], ["idea", "Idea"], ["issue", "Issue"], ["other", "Other"]].map(([value, label]) => <button key={value} type="button" data-active={category === value} onClick={() => setCategory(value)} className="feedback-category rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/65 transition hover:border-[#d4af37] hover:text-[#d4af37]">{label}</button>)}</div>
        <div className="mt-5 flex flex-wrap items-center gap-3"><span className="text-sm text-white/60">Rating</span><div className="flex gap-1" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" role="radio" data-active={value <= rating} onClick={() => setRating(value)} aria-label={`${value} star${value === 1 ? "" : "s"}`} aria-checked={rating === value} className="feedback-star group grid h-12 w-12 place-items-center rounded-lg transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]"><svg viewBox="0 0 24 24" className="h-10 w-10 transition" aria-hidden="true"><path d="m12 2.4 2.86 5.79 6.39.93-4.62 4.5 1.09 6.36L12 16.97l-5.72 3.01 1.09-6.36-4.62-4.5 6.39-.93L12 2.4Z" /></svg></button>)}</div></div>
        <label className="mt-5 block text-sm font-medium text-white">Your feedback<textarea required minLength={10} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What should we improve?" className="mt-2 h-28 w-full resize-none rounded-xl border border-white/15 bg-black px-4 py-3 font-normal text-white outline-none transition placeholder:text-white/35 focus:border-white/50 focus:ring-4 focus:ring-white/10" /></label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p role="status" aria-live="polite" className={`text-sm ${status.includes("saved") ? "text-[#9ed6b5]" : "text-[#ff9b92]"}`}>{status}</p><button disabled={sending} className="feedback-submit rounded-lg border px-4 py-2.5 text-sm font-medium shadow-sm transition duration-200 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">{sending ? "Saving…" : "Send feedback"}</button></div>
      </form>
    </div>
  </footer>;
}

export default function HomeScreen() {
  const scapes = useScapes(); const { user } = useAuth(); const [query, setQuery] = useState(""); const [showArchived, setShowArchived] = useState(false); const loadedUser = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!user) { loadedUser.current = undefined; return; }
    if (loadedUser.current === user.id) return;
    loadedUser.current = user.id;
    // Render the cached workspace immediately, then reconcile it quietly.
    // Clearing the cache here caused the empty loading panels on every revisit.
    void loadRemoteScapes().then((remoteScapes) => {
      // Do not replace a user's local view with an empty list after an
      // intermittent network or server failure.
      if (remoteScapes) saveScapes(remoteScapes);
    });
  }, [user]);
  const { personalScape, recentScapes, archivedScapes } = useMemo(() => {
    const active = scapes.filter((scape) => !scape.archived);
    const personal = active.find((scape) => scape.id === `scape-${user?.id}`);
    const recent = active.filter((scape) => scape.id !== personal?.id).sort((left, right) => Number(Boolean(right.starred)) - Number(Boolean(left.starred)));
    return { personalScape: personal, recentScapes: recent.filter((scape) => scape.title.toLowerCase().includes(query.toLowerCase())), archivedScapes: scapes.filter((scape) => scape.archived).filter((scape) => scape.title.toLowerCase().includes(query.toLowerCase())) };
  }, [query, scapes, user?.id]);

  // Keep the workspace visible during a refresh. A full-screen loading state
  // here made normal navigation feel like the app had stopped responding.
  if (!user) return null;

  return <main className="min-h-screen"><AppHeader />
    <section className="mx-auto max-w-7xl px-5 pb-8 pt-9 sm:px-8 sm:pt-12"><p className="mb-4 text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Your workspace</p><div className="max-w-3xl"><h1 className="text-5xl font-medium tracking-[-.065em] text-[#17231d] sm:text-7xl">Everything in<br /><em className="font-serif font-normal">one space.</em></h1><p className="mt-5 max-w-lg text-base leading-7 text-[#718077]">Keep project notes, tasks, documents, media, and references together.</p></div><div className="mt-8 flex max-w-xl items-center gap-3 rounded-2xl border border-[#e5e8e2] bg-white px-4 py-3 shadow-sm"><Icon name="search" className="h-5 w-5 text-[#718077]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Scapes" className="w-full border-0 bg-transparent text-sm outline-none placeholder:text-[#a0aaa3]" /></div></section>
    <section className="mx-auto max-w-7xl space-y-8 px-5 pb-16 sm:px-8"><div className="border-b border-[#e5e8e2] pb-8"><div className="mb-5"><h2 className="text-xl font-semibold tracking-[-.04em]">Your Scape</h2></div>{personalScape ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><ScapeCard scape={personalScape} index={0} /></div> : <div className="rounded-2xl border border-dashed border-[#cbd3ca] p-6 text-sm text-[#718077]">Create your first Scape to begin.</div>}</div><div><div className="mb-5 flex items-end justify-between"><h2 className="text-xl font-semibold tracking-[-.04em]">Recent Scapes</h2><Link href="/templates" className="hidden text-sm font-medium text-[#315443] sm:block">Browse templates →</Link></div>{recentScapes.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{recentScapes.map((scape, index) => <ScapeCard scape={scape} index={index} key={scape.id} />)}<Link href="/create" className="new-scape-card grid min-h-[240px] place-items-center rounded-2xl border border-dashed border-[#cbd3ca] bg-[#f2f4ed] p-6 transition"><div className="text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-[#315443] shadow-sm"><Icon name="plus" className="h-5 w-5" /></span><p className="mt-3 text-sm font-medium">Start a new Scape</p><p className="mt-1 text-xs text-[#718077]">Blank or template-based</p></div></Link></div> : <div className="rounded-2xl border border-dashed border-[#cbd3ca] bg-[#f2f4ed] p-6"><p className="font-medium">No recent Scapes yet</p><Link href="/create" className="mt-4 inline-flex rounded-lg bg-[#315443] px-4 py-2 text-sm font-medium text-white">Create Scape</Link></div>}</div>{archivedScapes.length > 0 && <div className="border-t border-[#e5e8e2] pt-6"><button onClick={() => setShowArchived((visible) => !visible)} className="flex items-center gap-2 text-sm font-medium text-[#718077] hover:text-[#17231d]"><Icon name="archive" className="h-4 w-4" />Archived Scapes <span className="text-xs">({archivedScapes.length})</span><span>{showArchived ? "−" : "+"}</span></button>{showArchived && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{archivedScapes.map((scape) => <div key={scape.id} className="rounded-2xl border border-[#e5e8e2] bg-white p-4"><p className="truncate font-medium">{scape.title}</p><p className="mt-1 truncate text-sm text-[#718077]">{scape.description || "Archived Scape"}</p><button onClick={() => void saveScape({ ...scape, archived: false, activity: [{ id: `activity-${Date.now()}`, action: "Scape restored", detail: scape.title, time: new Date().toISOString() }, ...scape.activity] })} className="mt-4 rounded-lg border px-3 py-2 text-sm hover:bg-[#edf0df]">Restore</button></div>)}</div>}</div>}</section>
    <FeedbackForm />
  </main>;
}
