"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/ui/app-header";
import { Icon } from "@/components/ui/icons";
import { getScapes, loadRemoteScapes, saveScapes, useScapes } from "@/lib/scape-store";

export default function HomeScreen() {
  const scapes = useScapes();
  const [query, setQuery] = useState("");
  useEffect(() => {
    void loadRemoteScapes().then((remote) => {
      if (!remote.length) return;
      const local = getScapes();
      const localIds = new Set(local.map((scape) => scape.id));
      saveScapes([...local, ...remote.filter((scape) => !localIds.has(scape.id))]);
    });
  // Read local changes first; the database only fills in Scapes not already in this browser.
  }, []);
  const showing = scapes.filter((scape) => scape.title.toLowerCase().includes(query.toLowerCase()));

  return <main className="min-h-screen"><AppHeader /><section className="mx-auto max-w-7xl px-5 pb-8 pt-9 sm:px-8 sm:pt-12"><p className="mb-4 text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Your workspace</p><div className="max-w-3xl"><h1 className="text-5xl font-medium tracking-[-.065em] text-[#17231d] sm:text-7xl">Everything in<br /><em className="font-serif font-normal">one space.</em></h1><p className="mt-5 max-w-lg text-base leading-7 text-[#718077]">Keep project notes, tasks, documents, media, and references together.</p></div><div className="mt-8 flex max-w-xl items-center gap-3 rounded-2xl border border-[#e5e8e2] bg-white px-4 py-3 shadow-sm"><Icon name="search" className="h-5 w-5 text-[#718077]" /><input suppressHydrationWarning value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Scapes" className="w-full border-0 bg-transparent text-sm outline-none placeholder:text-[#a0aaa3]" /></div></section><section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8"><div className="mb-5 flex items-end justify-between"><div><h2 className="text-xl font-semibold tracking-[-.04em]">Recent Scapes</h2><p className="mt-1 text-sm text-[#718077]">Open a project or create a new Scape.</p></div><Link href="/templates" className="hidden text-sm font-medium text-[#315443] sm:block">Browse templates →</Link></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{showing.map((scape, index) => <Link href={`/workspace/${scape.id}`} className="rise group overflow-hidden rounded-2xl border border-[#e5e8e2] bg-white shadow-[0_8px_30px_rgba(23,35,29,.035)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(23,35,29,.09)]" style={{ animationDelay: `${index * 70}ms` }} key={scape.id}><div className="h-36 p-4" style={{ background: scape.cover.startsWith("data:") ? "#315443" : scape.cover }}><div className="flex h-full items-end"><span className="rounded-full bg-black/20 px-3 py-1 text-xs text-white backdrop-blur">{scape.template}</span></div></div><div className="p-4"><div className="flex items-center justify-between"><h3 className="font-semibold tracking-[-.03em]">{scape.title}</h3><Icon name="arrow" className="h-4 w-4 text-[#718077] transition group-hover:translate-x-1" /></div>{scape.description && <p className="mt-2 line-clamp-2 text-sm leading-5 text-[#718077]">{scape.description}</p>}<p className="mt-4 text-xs text-[#9aa39d]">{scape.updated}</p></div></Link>)}<Link href="/create" className="group grid min-h-[240px] place-items-center rounded-2xl border border-dashed border-[#cbd3ca] bg-[#f2f4ed] p-6 transition hover:border-[#315443] hover:bg-[#edf0df]"><div className="text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-[#315443] shadow-sm"><Icon name="plus" className="h-5 w-5" /></span><p className="mt-3 text-sm font-medium">Start a new Scape</p><p className="mt-1 text-xs text-[#718077]">Blank or template-based</p></div></Link></div></section></main>;
}
