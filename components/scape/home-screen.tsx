"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/ui/app-header";
import { useAuth } from "@/components/auth/auth-provider";
import { Icon } from "@/components/ui/icons";
import { Scape } from "@/lib/mock-data";
import { loadRemoteScapes, saveScapes, useScapes } from "@/lib/scape-store";

function createdLabel(createdAt?: string) {
  if (!createdAt) return "Created recently";
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (days <= 0) return "Created today";
  if (days === 1) return "Created 1 day ago";
  return `Created ${days} days ago`;
}

function ScapeCard({ scape, index }: { scape: Scape; index: number }) {
  const cover = { "--scape-cover": scape.cover.startsWith("data:") ? "url(" + scape.cover + ")" : scape.cover } as CSSProperties;

  return <Link href={`/workspace/${scape.id}`} className="scape-card rise group overflow-hidden rounded-2xl border border-[#e5e8e2] bg-white shadow-[0_8px_30px_rgba(23,35,29,.035)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(23,35,29,.09)]" style={{ animationDelay: `${index * 70}ms` }}>
    <div className="scape-card-cover h-36 p-4" style={cover}><div className="flex h-full items-end"><span className="rounded-full bg-black/30 px-3 py-1 text-xs text-white backdrop-blur">{scape.template}</span></div></div>
    <div className="p-4"><div className="flex items-center justify-between"><h3 className="font-semibold tracking-[-.03em]">{scape.title}</h3><Icon name="arrow" className="h-4 w-4 text-[#718077] transition group-hover:translate-x-1" /></div>{scape.description && <p className="mt-2 line-clamp-2 text-sm leading-5 text-[#718077]">{scape.description}</p>}<p className="mt-4 text-xs text-[#9aa39d]">{createdLabel(scape.createdAt)}</p></div>
  </Link>;
}

export default function HomeScreen() {
  const scapes = useScapes();
  const { user } = useAuth();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!user) return;
    void loadRemoteScapes().then(saveScapes);
  }, [user]);

  const { personalScape, recentScapes } = useMemo(() => {
    const personal = scapes.find((scape) => scape.id === `scape-${user?.id}`);
    const recent = scapes.filter((scape) => scape.id !== personal?.id);
    const matching = recent.filter((scape) => scape.title.toLowerCase().includes(query.toLowerCase()));
    return { personalScape: personal, recentScapes: matching };
  }, [query, scapes, user?.id]);

  return <main className="min-h-screen"><AppHeader /><section className="mx-auto max-w-7xl px-5 pb-8 pt-9 sm:px-8 sm:pt-12"><p className="mb-4 text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Your workspace</p><div className="max-w-3xl"><h1 className="text-5xl font-medium tracking-[-.065em] text-[#17231d] sm:text-7xl">Everything in<br /><em className="font-serif font-normal">one space.</em></h1><p className="mt-5 max-w-lg text-base leading-7 text-[#718077]">Keep project notes, tasks, documents, media, and references together.</p></div><div className="mt-8 flex max-w-xl items-center gap-3 rounded-2xl border border-[#e5e8e2] bg-white px-4 py-3 shadow-sm"><Icon name="search" className="h-5 w-5 text-[#718077]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Scapes" className="w-full border-0 bg-transparent text-sm outline-none placeholder:text-[#a0aaa3]" /></div></section><section className="mx-auto max-w-7xl space-y-8 px-5 pb-16 sm:px-8"><div className="border-b border-[#e5e8e2] pb-8"><div className="mb-5"><h2 className="text-xl font-semibold tracking-[-.04em]">Your Scape</h2></div>{personalScape ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><ScapeCard scape={personalScape} index={0} /></div> : <div className="rounded-2xl border border-dashed border-[#cbd3ca] p-6 text-sm text-[#718077]">Your personal Scape is being prepared.</div>}</div><div><div className="mb-5 flex items-end justify-between"><h2 className="text-xl font-semibold tracking-[-.04em]">Recent Scapes</h2><Link href="/templates" className="hidden text-sm font-medium text-[#315443] sm:block">Browse templates →</Link></div>{recentScapes.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{recentScapes.map((scape, index) => <ScapeCard scape={scape} index={index} key={scape.id} />)}<Link href="/create" className="new-scape-card grid min-h-[240px] place-items-center rounded-2xl border border-dashed border-[#cbd3ca] bg-[#f2f4ed] p-6 transition"><div className="text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-[#315443] shadow-sm"><Icon name="plus" className="h-5 w-5" /></span><p className="mt-3 text-sm font-medium">Start a new Scape</p><p className="mt-1 text-xs text-[#718077]">Blank or template-based</p></div></Link></div> : <div className="rounded-2xl border border-dashed border-[#cbd3ca] bg-[#f2f4ed] p-6"><p className="font-medium">No recent Scapes yet</p><Link href="/create" className="mt-4 inline-flex rounded-lg bg-[#315443] px-4 py-2 text-sm font-medium text-white">Create Scape</Link></div>}</div></section></main>;
}
