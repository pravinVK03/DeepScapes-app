"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { Icon } from "./icons";

interface NavItem { label: string; href: string; }
const navItems: NavItem[] = [];

export function AppHeader({ compact = false }: { compact?: boolean }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [gmailMessage, setGmailMessage] = useState("");
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [canConnectGmail, setCanConnectGmail] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem("deepscapes-theme");
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
  });
  const profileRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();
  const username = typeof user?.user_metadata.username === "string" ? user.user_metadata.username : user?.email?.split("@")[0];

  useEffect(() => {
    if (!profileOpen) return;
    function dismiss(event: PointerEvent) { if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false); }
    function dismissWithKeyboard(event: KeyboardEvent) { if (event.key === "Escape") setProfileOpen(false); }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismissWithKeyboard);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", dismissWithKeyboard); };
  }, [profileOpen]);

  useEffect(() => {
    if (!profileOpen || !user) return;
    let active = true;
    void (async () => {
      const token = (await getBrowserSupabase()?.auth.getSession())?.data.session?.access_token;
      const response = await fetch("/api/feedback/gmail/connect", { headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => undefined);
      const data = await response?.json().catch(() => undefined) as { owner?: boolean } | undefined;
      if (active) setCanConnectGmail(Boolean(data?.owner));
    })();
    return () => { active = false; };
  }, [profileOpen, user]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && media.matches));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  function chooseTheme(next: "light" | "dark" | "system") {
    setTheme(next);
    window.localStorage.setItem("deepscapes-theme", next);
  }

  async function connectGmail() {
    setGmailMessage("");
    setConnectingGmail(true);
    const token = (await getBrowserSupabase()?.auth.getSession())?.data.session?.access_token;
    const response = await fetch("/api/feedback/gmail/connect", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => undefined);
    const data = await response?.json().catch(() => undefined) as { url?: string; error?: string } | undefined;
    if (data?.url) { window.location.assign(data.url); return; }
    setGmailMessage(data?.error || "Gmail could not be connected.");
    setConnectingGmail(false);
  }

  return (
    <header className="border-b border-[#d8dcd7]">
      <div className="flex w-full items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
        <div className="flex items-center gap-8">
          <Link href={user ? "/scapes" : "/"} className="group flex items-center rounded-xl py-1" aria-label="DeepScapes home">
            <Image src="/deepscapes-logo-black.png?v=20260908" alt="DeepScapes" width={228} height={45} className="logo-light h-auto w-40 sm:w-48" priority unoptimized />
            <Image src="/deepscapes-logo-white.png?v=20260908" alt="DeepScapes" width={228} height={45} className="logo-dark h-auto w-40 sm:w-48" priority unoptimized />
          </Link>
          {!compact && <nav className="hidden items-center gap-1 sm:flex" aria-label="Main navigation">
            {navItems.map((item) => <Link href={item.href} key={item.href} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${item.href === "/" ? pathname === "/" ? "bg-[#edf0df] text-[#17231d]" : "text-[#718077] hover:bg-[#edf0df] hover:text-[#17231d]" : pathname.startsWith(item.href) ? "bg-[#edf0df] text-[#17231d]" : "text-[#718077] hover:bg-[#edf0df] hover:text-[#17231d]"}`}>{item.label}</Link>)}
          </nav>}
        </div>
        <div className="flex items-center gap-2">
          {user && pathname.match(/^\/workspace\/[^/]+$/) && <Link href={`${pathname}/share`} className="hidden rounded-lg border border-[#dce1d9] px-3 py-2 text-sm sm:inline-flex">Share</Link>}
          {user ? <div ref={profileRef} className="relative">
            <button onClick={() => { setCanConnectGmail(false); setProfileOpen((open) => !open); }} className="profile-trigger flex h-9 items-center gap-2 rounded-lg border border-[#dce1d9] px-2 text-sm transition" aria-expanded={profileOpen} aria-label="Open profile menu">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#315443] text-xs font-semibold text-white">{username?.slice(0, 1).toUpperCase()}</span>
              <span className="hidden max-w-28 truncate sm:inline">{username}</span>
            </button>
            {profileOpen && <div className="profile-menu absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-[#dce1d9] bg-white p-1 shadow-xl">
              <div className="border-b border-[#e5e8e2] px-3 py-2"><p className="truncate text-sm font-medium">{username}</p><p className="truncate text-xs text-[#718077]">{user.email}</p></div>
              <Link onClick={() => setProfileOpen(false)} href="/scapes" className="block rounded-lg px-3 py-2 text-sm hover:bg-[#edf0df]">Your Scapes</Link>
              <Link onClick={() => setProfileOpen(false)} href="/create" className="block rounded-lg px-3 py-2 text-sm hover:bg-[#edf0df]">Create Scape</Link>
              {canConnectGmail && <div className="mx-2 my-1 border-t border-[#e5e8e2] pt-1">
                <button type="button" onClick={() => void connectGmail()} disabled={connectingGmail} className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-[#edf0df] disabled:opacity-50">{connectingGmail ? "Opening Gmail…" : "Connect feedback inbox"}</button>
                {gmailMessage && <p className="px-2 pb-2 text-xs text-[#a95b54]">{gmailMessage}</p>}
              </div>}
              <div className="mx-2 my-1 border-t border-[#e5e8e2] pt-2"><p className="px-1 pb-2 text-xs font-medium uppercase tracking-[.12em] text-[#718077]">Appearance</p><div className="grid grid-cols-3 gap-1" role="group" aria-label="Choose app theme">{(["light", "dark", "system"] as const).map((option) => <button key={option} type="button" onClick={() => chooseTheme(option)} className="theme-choice rounded-md px-2 py-2 text-xs capitalize transition" data-selected={theme === option} aria-pressed={theme === option}>{option}</button>)}</div></div>
              <button onClick={() => { setProfileOpen(false); void signOut(); }} className="profile-signout block w-full rounded-lg px-3 py-2 text-left text-sm text-[#a95b54] hover:bg-[#edf0df]">Sign out</button>
            </div>}
          </div> : !loading && !compact && <Link href="/login" className="hidden rounded-lg px-2 py-2 text-sm text-[#718077] sm:block">Sign in</Link>}
          {!compact && user && <Link href="/create" className="inline-flex items-center gap-2 rounded-lg bg-[#315443] px-3.5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#254235]"><Icon name="plus" className="h-4 w-4" /><span className="hidden sm:inline">New Scape</span></Link>}
        </div>
      </div>
    </header>
  );
}
