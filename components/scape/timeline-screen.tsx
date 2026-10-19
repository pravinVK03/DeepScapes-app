"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppHeader } from "@/components/ui/app-header";
import { Icon } from "@/components/ui/icons";
import { useScape } from "@/lib/scape-store";

function relative(value: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  const mins = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + "m ago";
  if (mins < 1440) return Math.floor(mins / 60) + "h ago";
  return Math.floor(mins / 1440) + "d ago";
}

export default function TimelineScreen() {
  const params = useParams<{ id: string }>();
  const scape = useScape(params.id);
  if (!scape) return <main className="grid min-h-screen place-items-center"><Link href="/scapes" className="text-sm text-[#315443]">Return to your Scapes</Link></main>;
  const workspace = "/workspace/" + scape.id;
  return <main className="min-h-screen"><AppHeader /><section className="mx-auto max-w-3xl px-5 pb-20 pt-10 sm:px-8"><Link href={workspace} className="inline-flex items-center gap-2 text-sm text-[#718077]"><Icon name="back" className="h-4 w-4" />Back to workspace</Link><div className="mt-12 rounded-[2rem] bg-[#315443] p-7 text-white sm:p-10"><p className="text-sm text-white/60">Continue where you left off</p><h1 className="mt-4 font-serif text-3xl sm:text-4xl">{scape.resources[0]?.title ?? "Your Scape is ready for its next thought."}</h1><Link href={workspace} className="mt-7 inline-block rounded-full bg-white px-5 py-3 text-sm font-medium text-[#315443]">Resume Scape →</Link></div><div className="mt-14"><p className="text-sm font-medium uppercase tracking-[.18em] text-[#718077]">Your project story</p><h2 className="mt-3 text-3xl font-medium tracking-[-.05em]">A complete timeline of<br /><em className="font-serif font-normal">what&apos;s taken shape.</em></h2><div className="mt-10 border-l border-[#cfdbcf] pl-7">{scape.activity.map((item, index) => <div className="relative pb-10" key={item.id}><span className="absolute -left-[35px] top-1 grid h-4 w-4 place-items-center rounded-full border-4 border-[#f7f7f3] bg-[#80a374]" /><p className="font-medium">{item.action}</p><p className="mt-1 text-sm text-[#718077]">{item.detail}</p><p className="mt-2 text-xs text-[#9aa39d]">{relative(item.time)}</p>{index === scape.activity.length - 1 && <p className="mt-7 text-sm italic text-[#718077]">Every Scape starts with a single thought.</p>}</div>)}</div></div></section></main>;
}
