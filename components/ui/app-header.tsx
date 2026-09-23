"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
const navItems = [];
export function AppHeader({ compact = false }: { compact?: boolean }) { const [dark, setDark] = useState(true); const pathname = usePathname(); const toggle = () => { const next = !document.documentElement.classList.contains("dark"); document.documentElement.classList.toggle("dark", next); setDark(next); };
  return <header className="border-b border-[#d8dcd7]"><div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 sm:px-8"><div className="flex items-center gap-8"><Link href="/" className="group flex items-center rounded-xl py-1" aria-label="DeepScapes home"><Image src="/deepscapes-logo-black.png?v=20260908" alt="DeepScapes" width={228} height={45} className="logo-light h-auto w-40 sm:w-48" priority unoptimized/><Image src="/deepscapes-logo-white.png?v=20260908" alt="DeepScapes" width={228} height={45} className="logo-dark h-auto w-40 sm:w-48" priority unoptimized/></Link>{!compact && <nav className="hidden items-center gap-1 sm:flex" aria-label="Main navigation">{navItems.map((item) => { const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href); return <Link href={item.href} key={item.href} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-[#edf0df] text-[#17231d]" : "text-[#718077] hover:bg-[#edf0df] hover:text-[#17231d]"}`}>{item.label}</Link>; })}</nav>}</div><div className="flex items-center gap-2"><button suppressHydrationWarning onClick={toggle} className="grid h-9 w-9 place-items-center rounded-lg border border-[#dce1d9] bg-white text-sm text-[#315443] transition hover:bg-[#edf0df]" aria-label="Toggle dark mode">{dark ? "☀" : "◐"}</button><Link href="/create" className="inline-flex items-center gap-2 rounded-lg bg-[#315443] px-3.5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#254235]"><Icon name="plus" className="h-4 w-4"/><span className={compact ? "sr-only" : "hidden sm:inline"}>New Scape</span></Link></div></div></header>;
}


