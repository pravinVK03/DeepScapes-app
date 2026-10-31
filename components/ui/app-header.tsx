"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { loadRemoteScapes } from "@/lib/scape-store";
import type { Scape } from "@/lib/mock-data";
import { Icon } from "./icons";

interface NavItem { label: string; href: string; }
const navItems: NavItem[] = [];

export function AppHeader({ compact = false }: { compact?: boolean }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [invitations, setInvitations] = useState<Scape[]>([]);
  const [gmailMessage, setGmailMessage] = useState("");
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [canConnectGmail, setCanConnectGmail] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem("deepscapes-theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const username = typeof user?.user_metadata.username === "string" ? user.user_metadata.username : user?.email?.split("@")[0];
  const displayName = typeof user?.user_metadata.display_name === "string" ? user.user_metadata.display_name : username;
  const avatar = typeof user?.user_metadata.avatar === "string" ? user.user_metadata.avatar : "";
  const avatarImage = /^(data:image\/|https?:\/\/)/i.test(avatar);

  useEffect(() => {
    if (!profileOpen && !notificationsOpen) return;
    function dismiss(event: PointerEvent) { if (!profileRef.current?.contains(event.target as Node) && !notificationRef.current?.contains(event.target as Node)) { setProfileOpen(false); setNotificationsOpen(false); } }
    function dismissWithKeyboard(event: KeyboardEvent) { if (event.key === "Escape") { setProfileOpen(false); setNotificationsOpen(false); } }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismissWithKeyboard);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", dismissWithKeyboard); };
  }, [notificationsOpen, profileOpen]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    // Invites must not wait for the dashboard's five-minute Scape cache.
    // This is a one-time, deduplicated refresh when the signed-in header mounts.
    void loadRemoteScapes({ force: true }).then((scapes) => { if (active && scapes) setInvitations(scapes.filter((scape) => scape.pendingInvite)); });
    return () => { active = false; };
  }, [user]);

  const checkedGmailOwner = useRef(false);

  useEffect(() => {
    if (!profileOpen || !user || checkedGmailOwner.current) return;
    let active = true;
    void (async () => {
      const token = (await getBrowserSupabase()?.auth.getSession())?.data.session?.access_token;
      const response = await fetch("/api/feedback/gmail/connect", { headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => undefined);
      const data = await response?.json().catch(() => undefined) as { owner?: boolean } | undefined;
      if (active) {
        checkedGmailOwner.current = true;
        setCanConnectGmail(Boolean(data?.owner));
      }
    })();
    return () => { active = false; };
  }, [profileOpen, user]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (!user || window.localStorage.getItem("deepscapes-theme")) return;
    const preference = user.user_metadata.appearance_preference;
    if (preference !== "light" && preference !== "dark") return;
    const frame = window.requestAnimationFrame(() => setTheme(preference));
    return () => window.cancelAnimationFrame(frame);
  }, [user]);

  function chooseTheme(next: "light" | "dark") {
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
          <Link href={user ? "/scapes" : "/"} className="app-logo group flex shrink-0 items-center rounded-xl py-1" aria-label="DeepScapes home">
            <Image src="/deepscapes-logo-black.svg" alt="DeepScapes" width={238} height={59} className="logo-light h-auto w-40 sm:w-48" priority />
            <Image src="/deepscapes-logo-white.svg" alt="DeepScapes" width={238} height={59} className="logo-dark h-auto w-40 sm:w-48" priority />
          </Link>
          {!compact && <nav className="hidden items-center gap-1 sm:flex" aria-label="Main navigation">
            {navItems.map((item) => <Link href={item.href} key={item.href} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${item.href === "/" ? pathname === "/" ? "bg-[#edf0df] text-[#17231d]" : "text-[#718077] hover:bg-[#edf0df] hover:text-[#17231d]" : pathname.startsWith(item.href) ? "bg-[#edf0df] text-[#17231d]" : "text-[#718077] hover:bg-[#edf0df] hover:text-[#17231d]"}`}>{item.label}</Link>)}
          </nav>}
        </div>
        <div className="flex items-center gap-2">
          {user && <div ref={notificationRef} className="relative">
            <button type="button" onClick={() => { setProfileOpen(false); setNotificationsOpen((open) => !open); }} className="notification-trigger relative grid h-9 w-9 place-items-center rounded-lg border border-[#dce1d9] text-[#4e6056] transition" aria-expanded={notificationsOpen} aria-label={`${invitations.length ? `${invitations.length} collaboration invitation${invitations.length === 1 ? "" : "s"}` : "Open notifications"}`}>
              <Icon name="bell" className="h-4 w-4" />
              {invitations.length > 0 && <span className="notification-badge" aria-hidden="true">{invitations.length > 9 ? "9+" : invitations.length}</span>}
            </button>
            {notificationsOpen && <div className="notification-menu absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden rounded-xl border border-[#dce1d9] bg-white p-2 shadow-xl"><div className="flex items-center justify-between px-3 py-2"><div><p className="text-sm font-semibold">Notifications</p><p className="mt-0.5 text-xs text-[#718077]">Collaboration and workspace updates</p></div>{invitations.length > 0 && <span className="rounded-full bg-[#edf0df] px-2 py-1 text-xs font-medium text-[#315443]">{invitations.length} new</span>}</div><div className="notification-menu-list border-t border-[#e5e8e2] pt-1">{invitations.length ? invitations.map((scape) => <button key={scape.id} type="button" onClick={() => { setNotificationsOpen(false); router.push(`/workspace/${scape.id}`); }} className="notification-menu-item w-full"><span className="notification-menu-mark"><Icon name="share" className="h-4 w-4" /></span><span className="min-w-0 flex-1 text-left"><strong className="block truncate text-sm">Invitation to {scape.title}</strong><small className="mt-0.5 block truncate text-xs text-[#718077]">You can {scape.invitePermission === "edit" ? "edit" : "view"} this Scape.</small></span><Icon name="arrow" className="h-4 w-4 text-[#718077]" /></button>) : <div className="px-3 py-7 text-center"><span className="notification-menu-mark mx-auto"><Icon name="bell" className="h-4 w-4" /></span><p className="mt-3 text-sm font-medium">You&apos;re all caught up.</p><p className="mt-1 text-xs text-[#718077]">Collaboration invitations will appear here.</p></div>}</div></div>}
          </div>}
          {user ? <div ref={profileRef} className="relative">
            <button onClick={() => setProfileOpen((open) => !open)} className="profile-trigger flex h-9 items-center gap-2 rounded-lg border border-[#dce1d9] px-2 text-sm transition" aria-expanded={profileOpen} aria-label="Open profile menu">
              <span className="profile-avatar grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-[#315443] text-xs font-semibold text-white">{avatarImage ? <Image src={avatar} alt="" width={24} height={24} unoptimized className="h-full w-full object-cover" /> : <Icon name="user" className="profile-avatar-icon h-4 w-4" strokeWidth={2.25} />}</span>
              <span className="hidden max-w-28 truncate sm:inline">{displayName}</span>
            </button>
            {profileOpen && <div className="profile-menu absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-[#dce1d9] p-2 shadow-xl">
              <div className="profile-menu-identity px-3 pb-3 pt-2"><p className="truncate text-sm font-semibold">{displayName}</p><p className="mt-1 truncate text-xs text-[#718077]">{user.email}</p></div>
              <div className="py-2">
                <Link href="/settings/profile" onClick={() => setProfileOpen(false)} className="profile-menu-action"><Icon name="note" className="h-4 w-4" />Profile settings</Link>
                <Link href="/help" onClick={() => setProfileOpen(false)} className="profile-menu-action"><Icon name="help" className="h-4 w-4" />Help &amp; guide</Link>
              </div>
              {canConnectGmail && <div className="profile-menu-section py-2">
                <button type="button" onClick={() => void connectGmail()} disabled={connectingGmail} className="profile-menu-action w-full disabled:opacity-50"><Icon name="link" className="h-4 w-4" />{connectingGmail ? "Opening Gmail…" : "Connect feedback inbox"}</button>
                {gmailMessage && <p className="px-2 pb-2 text-xs text-[#a95b54]">{gmailMessage}</p>}
              </div>}
              <div className="profile-menu-section px-2 pb-2 pt-3">
                <p className="pb-2 text-xs font-medium uppercase tracking-[.12em] text-[#718077]">Appearance</p>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-[#f2f4ed] px-2 py-2">
                  <span className="text-sm text-[#718077]">Light</span>
                  <button type="button" role="switch" aria-checked={theme === "dark"} aria-label="Toggle dark appearance" onClick={() => chooseTheme(theme === "dark" ? "light" : "dark")} className="theme-toggle" data-checked={theme === "dark"}>
                    <span className="theme-toggle-thumb" />
                  </button>
                  <span className="text-sm text-[#718077]">Dark</span>
                </div>
              </div>
              <div className="profile-menu-section pt-2"><button onClick={() => { setProfileOpen(false); void signOut(); }} className="profile-signout profile-menu-action w-full text-[#a95b54]">Sign out</button></div>
            </div>}
          </div> : !loading && !compact && <Link href="/login" className="hidden rounded-lg px-2 py-2 text-sm text-[#718077] sm:block">Sign in</Link>}
          {!compact && user && <Link href="/create" className="inline-flex items-center gap-2 rounded-lg bg-[#315443] px-3.5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#254235]"><Icon name="plus" className="h-4 w-4" /><span className="hidden sm:inline">New Scape</span></Link>}
        </div>
      </div>
    </header>
  );
}
