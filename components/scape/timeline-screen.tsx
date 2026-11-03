"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/ui/app-header";
import { Icon } from "@/components/ui/icons";
import { loadRemoteScape, useScape } from "@/lib/scape-store";

function relative(value: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  const mins = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + "m ago";
  if (mins < 1440) return Math.floor(mins / 60) + "h ago";
  return Math.floor(mins / 1440) + "d ago";
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Earlier" : new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
}

function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", dayPeriod: "short" }).format(date);
}

export default function TimelineScreen() {
  const params = useParams<{ id: string }>();
  const scape = useScape(params.id);
  const [loading, setLoading] = useState(!scape || Boolean(scape.summary));

  useEffect(() => {
    if (!params.id) return;
    let active = true;
    void loadRemoteScape(params.id).then(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [params.id]);

  if (loading && (!scape || scape.summary)) {
    return (
      <main className="min-h-screen">
        <AppHeader />
        <section className="mx-auto max-w-3xl px-5 py-20 text-center">
          <p className="text-sm font-medium">Loading activity…</p>
          <p className="mt-2 text-sm text-[#718077]">Restoring your Scape&apos;s timeline.</p>
        </section>
      </main>
    );
  }

  if (!scape) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Link href="/scapes" className="text-sm text-[#315443]">Return to your Scapes</Link>
      </main>
    );
  }

  const workspace = "/workspace/" + scape.id;
  const activities = scape.activity || [];
  const activityGroups = useMemo(() => activities.reduce<Record<string, typeof activities>>((groups, item) => {
    const date = new Date(item.time);
    const key = Number.isNaN(date.getTime()) ? "unknown" : date.toISOString().slice(0, 10);
    (groups[key] ||= []).push(item);
    return groups;
  }, {}), [activities]);

  return (
    <main className="min-h-screen">
      <AppHeader />
      <section className="mx-auto max-w-3xl px-5 pb-20 pt-10 sm:px-8">
        <Link href={workspace} className="inline-flex items-center gap-2 text-sm text-[#718077]">
          <Icon name="back" className="h-4 w-4" />Back to workspace
        </Link>
        <div className="mt-12 rounded-[2rem] bg-[#315443] p-7 text-white sm:p-10">
          <p className="text-sm text-white/60">Resume this Scape</p>
          <h1 className="mt-4 font-serif text-3xl sm:text-4xl">{scape.resources[0]?.title ?? "Your Scape is ready for its next thought."}</h1>
          <Link href={workspace} className="mt-7 inline-block rounded-full bg-white px-5 py-3 text-sm font-medium text-[#315443]">Resume Scape →</Link>
        </div>
        <div className="mt-14">
          <p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">{scape.title} activity</p>
          <h2 className="mt-3 text-3xl font-medium tracking-[-.05em]">Everything that happened<br /><em className="font-serif font-normal">inside this Scape.</em></h2>
          <div className="mt-10 space-y-4">
            {activities.length ? Object.entries(activityGroups).map(([day, entries], groupIndex) => <details key={day} open={groupIndex === 0} className="group overflow-hidden rounded-2xl border border-[#e5e8e2] bg-white"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4"><span><strong className="block text-sm">{dateLabel(entries[0]?.time || day)}</strong><span className="mt-1 block text-xs text-[#718077]">{entries.length} update{entries.length === 1 ? "" : "s"}</span></span><span className="text-sm text-[#718077] transition group-open:rotate-180">⌄</span></summary><div className="border-t border-[#e5e8e2] px-5 py-5"><div className="border-l border-[#cfdbcf] pl-6">{entries.map((item) => <div className="relative pb-7 last:pb-0" key={item.id}><span className="absolute -left-[31px] top-1 grid h-3 w-3 place-items-center rounded-full border-2 border-white bg-[#80a374]" /><p className="font-medium">{item.action}</p><p className="mt-1 text-sm text-[#718077]">{item.detail}</p><time dateTime={item.time} className="mt-2 block text-xs text-[#9aa39d]" title={item.time}>{timestamp(item.time)} · {relative(item.time)}</time></div>)}</div></div></details>) : <p className="text-sm text-[#718077]">No activity recorded yet.</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
