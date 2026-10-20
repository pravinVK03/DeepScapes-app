"use client";

import Link from "next/link";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/ui/app-header";
import { useAuth } from "@/components/auth/auth-provider";
import { Icon } from "@/components/ui/icons";
import { Scape } from "@/lib/mock-data";
import { loadRemoteScapes, saveScapes, useScapes } from "@/lib/scape-store";
import { getBrowserSupabase } from "@/lib/supabase-browser";

function createdLabel(createdAt?: string) {
  if (!createdAt) return "Created recently";
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (days <= 0) return "Created today";
  if (days === 1) return "Created 1 day ago";
  return `Created ${days} days ago`;
}

function ScapeCard({ scape, index }: { scape: Scape; index: number }) {
  const cover = { "--scape-cover": scape.cover.startsWith("data:") ? `url(${scape.cover})` : scape.cover } as CSSProperties;
  return <Link href={`/workspace/${scape.id}`} className="scape-card rise group overflow-hidden rounded-2xl border border-[#e5e8e2] bg-white shadow-[0_8px_30px_rgba(23,35,29,.035)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(23,35,29,.09)]" style={{ animationDelay: `${index * 70}ms` }}>
    <div className="scape-card-cover h-36 p-4" style={cover}><div className="flex h-full items-end"><span className="rounded-full bg-black/30 px-3 py-1 text-xs text-white backdrop-blur">{scape.template}</span></div></div>
    <div className="p-4"><div className="flex items-center justify-between"><h3 className="font-semibold tracking-[-.03em]">{scape.title}</h3><Icon name="arrow" className="h-4 w-4 text-[#718077] transition group-hover:translate-x-1" /></div>{scape.description && <p className="mt-2 line-clamp-2 text-sm leading-5 text-[#718077]">{scape.description}</p>}<p className="mt-4 text-xs text-[#9aa39d]">{createdLabel(scape.createdAt)}</p></div>
  </Link>;
}

function FeedbackForm() {
  const [category, setCategory] = useState("experience");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setStatus(""); setSending(true);
    const token = (await getBrowserSupabase()?.auth.getSession())?.data.session?.access_token;
    const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ category, rating: rating || undefined, message, page: window.location.pathname }) }).catch(() => undefined);
    let data: { error?: string } | undefined;
    try { data = response ? await response.json() as typeof data : undefined; } catch { data = undefined; }
    if (!response?.ok) { setStatus(data?.error || "Feedback could not be sent. Please try again."); setSending(false); return; }
    setMessage(""); setRating(0); setStatus("Thank you — your feedback was saved."); setSending(false);
  }

  return <footer className="mt-16 border-t border-[#e5e8e2] bg-[#eef1e9]">
    <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 lg:grid-cols-[.75fr_1.25fr] lg:items-start">
      <div><p className="text-xs font-medium uppercase tracking-[.18em] text-[#718077]">Feedback</p><h2 className="mt-3 text-3xl font-medium tracking-[-.05em]">Help shape<br /><em className="font-serif font-normal">DeepScapes.</em></h2></div>
      <form onSubmit={submit} className="rounded-2xl border border-[#dce1d9] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap gap-2">{[["experience", "Experience"], ["idea", "Idea"], ["issue", "Issue"], ["other", "Other"]].map(([value, label]) => <button key={value} type="button" onClick={() => setCategory(value)} className={`rounded-full border px-3 py-1.5 text-xs transition ${category === value ? "border-[#315443] bg-[#315443] text-white" : "border-[#dce1d9] text-[#718077] hover:bg-[#f2f4ed]"}`}>{label}</button>)}</div>
        <div className="mt-5 flex items-center gap-3"><span className="text-sm text-[#718077]">Rating</span><div className="flex gap-1" aria-label="Rating">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} star${value === 1 ? "" : "s"}`} className={`text-xl ${value <= rating ? "text-[#315443]" : "text-[#c7cec7]"}`}>★</button>)}</div></div>
        <label className="mt-5 block text-sm font-medium">Your feedback<textarea required minLength={10} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What should we improve?" className="mt-2 h-28 w-full resize-none rounded-xl border border-[#dce1d9] px-4 py-3 font-normal outline-none transition placeholder:text-[#a0aaa3] focus:border-[#315443] focus:ring-4 focus:ring-[#315443]/10" /></label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p role="status" aria-live="polite" className={`text-sm ${status.startsWith("Thank") ? "text-[#315443]" : "text-[#a95b54]"}`}>{status}</p><button disabled={sending || message.trim().length < 10} className="rounded-lg bg-[#315443] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{sending ? "Sending…" : "Send feedback"}</button></div>
      </form>
    </div>
  </footer>;
}

export default function HomeScreen() {
  const scapes = useScapes(); const { user } = useAuth(); const [query, setQuery] = useState("");
  useEffect(() => { if (user) void loadRemoteScapes().then(saveScapes); }, [user]);
  const { personalScape, recentScapes } = useMemo(() => {
    const personal = scapes.find((scape) => scape.id === `scape-${user?.id}`);
    const recent = scapes.filter((scape) => scape.id !== personal?.id);
    return { personalScape: personal, recentScapes: recent.filter((scape) => scape.title.toLowerCase().includes(query.toLowerCase())) };
  }, [query, scapes, user?.id]);

  return <main className="min-h-screen"><AppHeader />
    <section className="mx-auto max-w-7xl px-5 pb-8 pt-9 sm:px-8 sm:pt-12"><p className="mb-4 text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Your workspace</p><div className="max-w-3xl"><h1 className="text-5xl font-medium tracking-[-.065em] text-[#17231d] sm:text-7xl">Everything in<br /><em className="font-serif font-normal">one space.</em></h1><p className="mt-5 max-w-lg text-base leading-7 text-[#718077]">Keep project notes, tasks, documents, media, and references together.</p></div><div className="mt-8 flex max-w-xl items-center gap-3 rounded-2xl border border-[#e5e8e2] bg-white px-4 py-3 shadow-sm"><Icon name="search" className="h-5 w-5 text-[#718077]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Scapes" className="w-full border-0 bg-transparent text-sm outline-none placeholder:text-[#a0aaa3]" /></div></section>
    <section className="mx-auto max-w-7xl space-y-8 px-5 pb-16 sm:px-8"><div className="border-b border-[#e5e8e2] pb-8"><div className="mb-5"><h2 className="text-xl font-semibold tracking-[-.04em]">Your Scape</h2></div>{personalScape ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><ScapeCard scape={personalScape} index={0} /></div> : <div className="rounded-2xl border border-dashed border-[#cbd3ca] p-6 text-sm text-[#718077]">Your personal Scape is being prepared.</div>}</div><div><div className="mb-5 flex items-end justify-between"><h2 className="text-xl font-semibold tracking-[-.04em]">Recent Scapes</h2><Link href="/templates" className="hidden text-sm font-medium text-[#315443] sm:block">Browse templates →</Link></div>{recentScapes.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{recentScapes.map((scape, index) => <ScapeCard scape={scape} index={index} key={scape.id} />)}<Link href="/create" className="new-scape-card grid min-h-[240px] place-items-center rounded-2xl border border-dashed border-[#cbd3ca] bg-[#f2f4ed] p-6 transition"><div className="text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-[#315443] shadow-sm"><Icon name="plus" className="h-5 w-5" /></span><p className="mt-3 text-sm font-medium">Start a new Scape</p><p className="mt-1 text-xs text-[#718077]">Blank or template-based</p></div></Link></div> : <div className="rounded-2xl border border-dashed border-[#cbd3ca] bg-[#f2f4ed] p-6"><p className="font-medium">No recent Scapes yet</p><Link href="/create" className="mt-4 inline-flex rounded-lg bg-[#315443] px-4 py-2 text-sm font-medium text-white">Create Scape</Link></div>}</div></section>
    <FeedbackForm />
  </main>;
}
