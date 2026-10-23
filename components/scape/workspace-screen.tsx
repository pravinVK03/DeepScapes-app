"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/ui/app-header";
import { Icon } from "@/components/ui/icons";
import { BrowserActivity, BrowserSessionSnapshot, BrowserState, Resource, ResourceType, Scape } from "@/lib/mock-data";
import { deleteScape, getScape, newId, saveScape, useScape } from "@/lib/scape-store";
import { useAuth } from "@/components/auth/auth-provider";
import { getBrowserSupabase } from "@/lib/supabase-browser";

const sections: { label: string; type: ResourceType; icon: string }[] = [
  { label: "Notes", type: "note", icon: "note" }, { label: "Tasks", type: "task", icon: "task" },
  { label: "References", type: "link", icon: "link" }, { label: "Documents", type: "file", icon: "file" },
  { label: "Images", type: "image", icon: "image" }, { label: "Videos", type: "video", icon: "play" },
  { label: "Audio", type: "audio", icon: "audio" },
];
const icons: Record<ResourceType, string> = { note: "note", task: "task", file: "file", image: "image", video: "play", audio: "audio", link: "link" };
const log = (action: string, detail: string) => ({ id: newId("activity"), action, detail, time: new Date().toISOString() });
async function downloadResource(url: string, name: string) {
  const link = document.createElement("a");
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Download failed");
    const blobUrl = URL.createObjectURL(await response.blob());
    link.href = blobUrl; link.download = name; link.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);
  } catch {
    link.href = url; link.target = "_blank"; link.rel = "noreferrer"; link.click();
  }
}
function relative(value: string) { const time = new Date(value).getTime(); if (Number.isNaN(time)) return value; const mins = Math.max(0, Math.floor((Date.now() - time) / 60000)); if (mins < 1) return "Just now"; if (mins < 60) return mins + "m ago"; if (mins < 1440) return Math.floor(mins / 60) + "h ago"; return Math.floor(mins / 1440) + "d ago"; }
type WebLog = BrowserActivity;
type ResumeRequest = { key: string; mode: "resume" | "duplicate"; name: string; snapshot: BrowserSessionSnapshot };
type WebSession = { id: string; title: string; url?: string; startedAt: string; endedAt?: string; lastAt: string; status: "active" | "ended" | "interrupted"; events: WebLog[]; snapshot?: BrowserSessionSnapshot };
function sessionTitle(events: WebLog[]) {
  const started = events.find((item) => item.type === "session started");
  if (started?.target) return started.target;
  const event = events.find((item) => item.url);
  if (event?.url) { try { return new URL(event.url).hostname.replace(/^www\./, ""); } catch { return event.url; } }
  return "Browsing session";
}
function groupWebSessions(logs: WebLog[], activeSessionId?: string, snapshots: Record<string, BrowserSessionSnapshot> = {}, activeName?: string): WebSession[] {
  const grouped = new Map<string, WebLog[]>();
  for (const item of logs) grouped.set(item.sessionId, [...(grouped.get(item.sessionId) || []), item]);
  return [...grouped.entries()].map(([id, entries]) => {
    const events = entries.sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
    const started = events.find((item) => item.type === "session started");
    const ended = [...events].reverse().find((item) => item.type === "session ended");
    const lastUrl = [...events].reverse().find((item) => item.url)?.url;
    const status: WebSession["status"] = id === activeSessionId ? "active" : ended ? "ended" : "interrupted";
    const snapshot = snapshots[id];
    const title = id === activeSessionId && activeName ? activeName : snapshot?.name || sessionTitle(events);
    const activeTab = snapshot?.tabs[snapshot.activeTab ?? snapshot.tabs.findIndex((tab) => tab.active)] || snapshot?.tabs.find((tab) => tab.active);
    return { id, title, url: activeTab?.url || lastUrl || started?.url, startedAt: started?.time || events[0]?.time || new Date().toISOString(), endedAt: ended?.time, lastAt: snapshot?.capturedAt || events.at(-1)?.time || new Date().toISOString(), status, events, snapshot };
  }).sort((left, right) => new Date(right.lastAt).getTime() - new Date(left.lastAt).getTime());
}
function durationLabel(session: WebSession) {
  const end = new Date(session.endedAt || session.lastAt).getTime(); const start = new Date(session.startedAt).getTime();
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  if (minutes < 1) return "Under a minute"; if (minutes < 60) return `${minutes}m`; return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function eventTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function eventTarget(value?: string) { return value === "[object Object]" ? "Page element" : value; }

export default function WorkspaceScreen() {
  const params = useParams<{ id: string }>(); const { user } = useAuth(); const scape = useScape(params.id);
  const [adding, setAdding] = useState<ResourceType | null>(null); const [editing, setEditing] = useState(false); const [focused, setFocused] = useState<ResourceType | null>(null); const [webLogs, setWebLogs] = useState<WebLog[]>([]); const [webActivityOpen, setWebActivityOpen] = useState(false); const [resumeRequest, setResumeRequest] = useState<ResumeRequest>(); const [resumeChoice, setResumeChoice] = useState<WebSession>(); const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" }>();
  const done = useMemo(() => scape?.resources.filter((item) => item.type === "task" && item.done).length ?? 0, [scape]);
  const browserSessions = useMemo(() => groupWebSessions(webLogs, scape?.browser?.activeSessionId, scape?.browser?.sessions, scape?.browser?.activeSessionName), [scape?.browser?.activeSessionId, scape?.browser?.activeSessionName, scape?.browser?.sessions, webLogs]);
  useEffect(() => {
    if (!scape) return;
    const timer = window.setTimeout(() => setWebLogs(scape.browser?.activity || []), 0);
    return () => window.clearTimeout(timer);
  }, [scape]);
  if (!scape) return <main className="min-h-screen"><AppHeader /><p className="mx-auto max-w-7xl px-5 py-12 text-sm text-[#718077]">This Scape is unavailable.</p></main>;
  const canEdit = scape.ownerId === user?.id || scape.collaborators?.some((person) => (person.id === user?.id || person.email === user?.email) && person.permission === "edit") === true;
  const update = (next: Scape) => saveScape(next);
  function showNotice(text: string, tone: "success" | "error" = "success") { setNotice({ text, tone }); window.setTimeout(() => setNotice(undefined), 3200); }
  function resumeSession(session: WebSession) {
    setWebActivityOpen(false); document.getElementById("scape-browser")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (session.status === "active") { showNotice("Returned to the active browser session"); return; }
    if (!session.url) { showNotice("This session has no saved page to resume"); return; }
    const snapshot = session.snapshot || { sessionId: session.id, name: session.title, capturedAt: session.lastAt, tabs: [{ url: session.url, active: true }], activeTab: 0 };
    setResumeChoice({ ...session, snapshot });
  }
  function continueSession(mode: "resume" | "duplicate") {
    if (!resumeChoice?.snapshot) return;
    const name = mode === "duplicate" ? `${resumeChoice.title} copy` : resumeChoice.title;
    setResumeRequest({ key: crypto.randomUUID(), mode, name, snapshot: resumeChoice.snapshot });
    setResumeChoice(undefined); showNotice(mode === "duplicate" ? "Creating a copy of the saved session" : "Reconstructing the saved session");
  }
  function toggleTask(resource: Resource) { if (!canEdit) return; void update({ ...scape!, resources: scape!.resources.map((item) => item.id === resource.id ? { ...item, done: !item.done, detail: !item.done ? "Task · Complete" : "Task · In progress" } : item), activity: [log(resource.done ? "Task reopened" : "Task completed", resource.title), ...scape!.activity] }); }
  function toggleStar(resource: Resource) { if (!canEdit) return; void update({ ...scape!, resources: scape!.resources.map((item) => item.id === resource.id ? { ...item, starred: !item.starred } : item), activity: [log(resource.starred ? "Resource unstarred" : "Resource starred", resource.title), ...scape!.activity] }); }
  function removeResource(resource: Resource) { if (!canEdit || !window.confirm(`Delete ${resource.title}? This cannot be undone.`)) return; void update({ ...scape!, resources: scape!.resources.filter((item) => item.id !== resource.id), activity: [log("Resource deleted", resource.title), ...scape!.activity] }); }
  const cover = { background: scape.cover?.startsWith("data:") ? "#1d4ed8" : scape.cover || "#1d4ed8" };

  return <main className="min-h-screen"><AppHeader /><section className="mx-auto max-w-7xl px-5 pb-12 pt-6 sm:px-8">
    <Link href="/scapes" className="inline-flex items-center gap-2 text-sm text-[#718077] hover:text-[#17231d]"><Icon name="back" className="h-4 w-4" />All Scapes</Link>
    <div className="workspace-cover mt-5 rounded-[1.75rem] p-6 sm:p-8" style={cover}><p className="text-sm">{scape.template}</p><div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><h1 className="text-4xl font-medium tracking-[-.06em] sm:text-5xl">{scape.title}</h1>{scape.description && <p className="mt-3 max-w-xl leading-6">{scape.description}</p>}</div>{canEdit && <button onClick={() => setEditing(true)} className="workspace-edit rounded-lg border px-3 py-2 text-sm transition">Edit</button>}</div></div>
    <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_290px]"><div>{canEdit ? <InScapeBrowser key={scape.id} scape={scape} resumeRequest={resumeRequest} onBrowserChange={(browser) => { setWebLogs(browser.activity || []); void update({ ...scape, browser }); }} /> : <section className="rounded-2xl border border-[#e5e8e2] bg-white p-5"><p className="text-xs font-medium uppercase tracking-[.16em] text-[#718077]">Browse</p><h2 className="mt-2 text-lg font-semibold">Research is available to editors</h2><p className="mt-2 text-sm text-[#718077]">You can review the Scape and its saved activity, but only editors can open or manage its remote browser session.</p></section>}<div className="mb-5 mt-8 flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-[.16em] text-[#718077]">Project contents</p><h2 className="mt-1 text-2xl font-semibold tracking-[-.04em]">Everything in one place.</h2></div>{canEdit && <button onClick={() => setAdding("file")} className="inline-flex items-center gap-2 rounded-lg bg-[#315443] px-3 py-2 text-sm font-medium text-white"><Icon name="plus" className="h-4 w-4" />Add</button>}</div><div className="grid gap-x-8 gap-y-6 md:grid-cols-2">{sections.map((section) => <ResourceSection key={section.type} section={section} resources={scape.resources.filter((item) => item.type === section.type)} scape={scape} canEdit={canEdit} onAdd={() => setAdding(section.type)} onToggle={toggleTask} onStar={toggleStar} onDelete={removeResource} onMaximize={() => setFocused(section.type)} />)}</div></div>
      <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start"><Link href={"/timeline/" + scape.id} className="block rounded-2xl bg-[#315443] p-5 text-white"><span className="text-sm text-white/70">Resume this Scape</span><p className="mt-4 font-serif text-xl">{scape.resources[0]?.title ?? "Add your first resource"}</p><span className="mt-3 inline-block text-sm">Open activity →</span></Link><div className="rounded-2xl border border-[#e5e8e2] bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Activity</h2><Link href={"/timeline/" + scape.id} className="text-xs text-[#718077]">View all</Link></div><div className="mt-4 space-y-4">{scape.activity.slice(0, 4).map((item) => <div className="flex gap-3" key={item.id}><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#a7bf97]" /><div className="min-w-0"><p className="text-sm">{item.action}</p><p className="mt-0.5 truncate text-xs text-[#718077]">{item.detail} · {relative(item.time)}</p></div></div>)}</div></div><div className="rounded-2xl border border-[#e5e8e2] bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Web activity</h2><p className="mt-0.5 text-xs text-[#8b968e]">{browserSessions.length} session{browserSessions.length === 1 ? "" : "s"}</p></div>{browserSessions.length > 0 && <button onClick={() => setWebActivityOpen(true)} className="text-xs text-[#718077]">View all</button>}</div><div className="mt-4 space-y-2">{browserSessions.length ? browserSessions.slice(0, 3).map((session) => <WebSessionDisclosure key={session.id} session={session} compact onResume={resumeSession} />) : <p className="text-sm text-[#718077]">No web activity yet.</p>}</div></div><div className="rounded-2xl border border-[#e5e8e2] bg-[#f0f3eb] p-5"><p className="text-xs uppercase tracking-[.14em] text-[#718077]">Tasks</p><p className="mt-2 text-sm">{done} complete · {scape.resources.filter((item) => item.type === "task").length} total</p></div></aside>
    </div></section>{adding && <AddResource scape={scape} initialType={adding} close={() => setAdding(null)} onAdded={(resource) => showNotice(`${resource.title} added to this Scape`)} onPersistError={() => showNotice("Resource added on this device, but cloud sync failed. Retry when connected.", "error")} />}{editing && <ScapeEditor scape={scape} close={() => setEditing(false)} save={update} canDelete={scape.ownerId === user?.id} />}{focused && <FocusedSection label={sections.find((section) => section.type === focused)!.label} resources={scape.resources.filter((item) => item.type === focused)} scape={scape} canEdit={canEdit} close={() => setFocused(null)} onToggle={toggleTask} onStar={toggleStar} onDelete={removeResource} />}{webActivityOpen && <WebActivity sessions={browserSessions} close={() => setWebActivityOpen(false)} onResume={resumeSession} />}{resumeChoice && <ResumeSessionChoice session={resumeChoice} close={() => setResumeChoice(undefined)} choose={continueSession} />}{notice && <div role="status" aria-live="polite" className={`fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-white shadow-xl ${notice.tone === "error" ? "bg-[#9f4f47]" : "bg-[#315443]"}`}><span className="grid h-5 w-5 place-items-center rounded-full bg-white/20">{notice.tone === "error" ? "!" : "✓"}</span>{notice.text}</div>}</main>;
}

function InScapeBrowser({ scape, resumeRequest, onBrowserChange }: { scape: Scape; resumeRequest?: ResumeRequest; onBrowserChange: (browser: BrowserState) => void }) {
  const [liveViewUrl, setLiveViewUrl] = useState(scape.browser?.liveViewUrl || "");
  const [input, setInput] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [opening, setOpening] = useState(false); const [ending, setEnding] = useState(false); const [message, setMessage] = useState("");
  const [fullScreen, setFullScreen] = useState(false); const [paused, setPaused] = useState(false); const [viewerOpen, setViewerOpen] = useState(false); const [viewerKey, setViewerKey] = useState(0); const [disconnected, setDisconnected] = useState(false);
  const sessionId = scape.browser?.activeSessionId;
  const browserRef = useRef(scape.browser); const onBrowserChangeRef = useRef(onBrowserChange); const resumedRequestRef = useRef<string | undefined>(undefined); const checkpointFailuresRef = useRef(0); const releaseActiveRef = useRef<() => Promise<BrowserSessionSnapshot | false>>(async () => false); const startSessionRef = useRef<(target: string, request?: ResumeRequest) => Promise<void>>(async () => undefined);
  useEffect(() => { browserRef.current = scape.browser; onBrowserChangeRef.current = onBrowserChange; }, [onBrowserChange, scape.browser]);
  useEffect(() => {
    if (!fullScreen) return;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [fullScreen]);
  const persist = useCallback((next: Partial<BrowserState>) => {
    const browser = { ...browserRef.current, ...next, updatedAt: new Date().toISOString() };
    browserRef.current = browser; onBrowserChangeRef.current(browser);
  }, []);
  const syncActivity = useCallback(async (save = true) => {
    if (!sessionId) return;
    const token = (await getBrowserSupabase()?.auth.getSession())?.data.session?.access_token; if (!token) return;
    const response = await fetch(`/api/browser/session?scapeId=${encodeURIComponent(scape.id)}&sessionId=${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    if (!response?.ok) return;
    const data = await response.json() as { events?: WebLog[] };
    const current = browserRef.current?.activity || [];
    const merged = [...current, ...(data.events || [])].filter((item, index, all) => all.findIndex((entry) => entry.id === item.id) === index).sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime()).slice(0, 750);
    const lastUrl = merged.find((item) => item.url)?.url;
    if (save && (merged.length !== current.length || (lastUrl && lastUrl !== browserRef.current?.lastUrl))) persist({ activity: merged, lastUrl });
    return merged;
  }, [persist, scape.id, sessionId]);
  useEffect(() => { if (!sessionId || !viewerOpen) return; void syncActivity(); const timer = window.setInterval(() => void syncActivity(), 30_000); return () => window.clearInterval(timer); }, [sessionId, syncActivity, viewerOpen]);
  const checkpoint = useCallback(async () => {
    if (!sessionId || ending) return;
    const token = (await getBrowserSupabase()?.auth.getSession())?.data.session?.access_token; if (!token) return;
    const response = await fetch("/api/browser/session", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "checkpoint", scapeId: scape.id, sessionId, sessionName: sessionName.trim() || browserRef.current?.activeSessionName, activeUrl: browserRef.current?.lastUrl }) }).catch(() => undefined);
    let data: { snapshot?: BrowserSessionSnapshot } | undefined; try { data = response ? await response.json() as typeof data : undefined; } catch { data = undefined; }
    if (!response?.ok || !data?.snapshot) {
      checkpointFailuresRef.current += 1;
      if (checkpointFailuresRef.current > 1) { setDisconnected(true); setMessage("The live browser disconnected. Your latest checkpoint is ready to restore."); }
      return;
    }
    checkpointFailuresRef.current = 0; setDisconnected(false);
    persist({ sessions: { ...(browserRef.current?.sessions || {}), [sessionId]: data.snapshot } });
  }, [ending, persist, scape.id, sessionId, sessionName]);
  useEffect(() => {
    if (!sessionId || !viewerOpen) return;
    const first = window.setTimeout(() => void checkpoint(), 12_000);
    const timer = window.setInterval(() => void checkpoint(), 90_000);
    const onVisibility = () => { if (document.visibilityState === "hidden") void checkpoint(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearTimeout(first); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [checkpoint, sessionId, viewerOpen]);
  function saveSessionName() {
    if (!sessionId) return;
    const name = sessionName.trim() || "Browsing session";
    const activity = (browserRef.current?.activity || []).map((item) => item.id === `session-${sessionId}` ? { ...item, target: name } : item);
    setSessionName(name); persist({ activeSessionName: name, activity });
  }
  async function releaseActive() {
    if (!sessionId) return false;
    setEnding(true); setMessage("Saving this browsing session…");
    const token = (await getBrowserSupabase()?.auth.getSession())?.data.session?.access_token;
    if (!token) { setEnding(false); setMessage("Sign in again to save and end this session."); return false; }
    const activity = await syncActivity(false) || browserRef.current?.activity || [];
    const activeUrl = activity.find((item) => item.url)?.url || browserRef.current?.lastUrl;
    const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 55_000);
    const response = await fetch("/api/browser/session", { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ scapeId: scape.id, sessionId, sessionName: sessionName.trim() || browserRef.current?.activeSessionName, activeUrl }), signal: controller.signal }).catch(() => undefined); window.clearTimeout(timeout);
    let data: { error?: string; snapshot?: BrowserSessionSnapshot } | undefined; try { data = response ? await response.json() as typeof data : undefined; } catch { data = undefined; }
    if (!response?.ok) { setEnding(false); setMessage(data?.error || "The browser could not be ended. Please retry."); return false; }
    const snapshot = data?.snapshot || browserRef.current?.sessions?.[sessionId] || { sessionId, name: sessionName.trim() || browserRef.current?.activeSessionName || "Browsing session", capturedAt: new Date().toISOString(), tabs: browserRef.current?.lastUrl ? [{ url: browserRef.current.lastUrl, active: true }] : [] };
    const ended: WebLog = { id: `session-ended-${sessionId}`, type: "session ended", time: snapshot.capturedAt, target: snapshot.name, detail: `${snapshot.tabs.length} tab${snapshot.tabs.length === 1 ? "" : "s"} and browser state saved`, sessionId };
    persist({ activeSessionId: undefined, activeSessionName: undefined, liveViewUrl: undefined, expiresAt: undefined, lastTarget: undefined, lastUrl: undefined, sessions: { ...(browserRef.current?.sessions || {}), [sessionId]: snapshot }, activity: [ended, ...activity.filter((item) => item.id !== ended.id)] });
    setLiveViewUrl(""); setInput(""); setSessionName(""); setPaused(false); setViewerOpen(false); setFullScreen(false); setDisconnected(false); setEnding(false); setMessage("Session saved. The browser is clear."); return snapshot;
  }
  async function startSession(target: string, request?: ResumeRequest) {
    setOpening(true); setMessage("");
    const token = (await getBrowserSupabase()?.auth.getSession())?.data.session?.access_token;
    if (!token) { setOpening(false); setMessage("Sign in to open your private browser."); return; }
    const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 35_000);
    const name = request?.name || sessionName.trim() || target.trim() || "Browsing session";
    const response = await fetch("/api/browser/session", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ scapeId: scape.id, target, sessionName: name, snapshot: request?.snapshot, sourceSessionId: request?.snapshot.sessionId }), signal: controller.signal }).catch(() => undefined); window.clearTimeout(timeout);
    let data: { liveViewUrl?: string; error?: string; sessionId?: string; profileId?: string; expiresAt?: string; sessionName?: string; destination?: { url: string; label: string }; deferredNavigation?: boolean } | undefined;
    try { data = response ? await response.json() as typeof data : undefined; } catch { data = undefined; }
    if (!response?.ok || !data?.liveViewUrl) { setOpening(false); setMessage(data?.error ?? "Could not start the remote browser."); return; }
    const activeTab = request?.snapshot.tabs[request.snapshot.activeTab ?? 0] || request?.snapshot.tabs.find((tab) => tab.active);
    const event: WebLog = { id: `session-${data.sessionId}`, type: request ? `session ${request.mode}d` : "session started", time: new Date().toISOString(), url: activeTab?.url || data.destination?.url, target: data.sessionName || name, detail: request ? `${request.snapshot.tabs.length} saved tab${request.snapshot.tabs.length === 1 ? "" : "s"} reconstructed from ${request.snapshot.sessionId.slice(0, 8)}` : "Remote browser opened", sessionId: data.sessionId || "" };
    persist({ activeSessionId: data.sessionId, activeSessionName: data.sessionName || name, profileId: data.profileId || browserRef.current?.profileId, liveViewUrl: data.liveViewUrl, expiresAt: data.expiresAt, lastTarget: target, lastUrl: activeTab?.url || data.destination?.url, activity: [event, ...(browserRef.current?.activity || [])] });
    checkpointFailuresRef.current = 0; setDisconnected(false); setSessionName(data.sessionName || name); setLiveViewUrl(data.liveViewUrl); setViewerOpen(true); setViewerKey((value) => value + 1); setOpening(false); setMessage(request ? `${request.snapshot.tabs.length} saved tabs restored.` : "");
    // A brand-new browser can paint immediately. Send its first navigation in
    // the background instead of holding the viewer hostage to a CDP round trip.
    if (data.deferredNavigation && data.sessionId && target.trim()) {
      void (async () => {
        const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 20_000);
        const navigation = await fetch("/api/browser/session", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ scapeId: scape.id, sessionId: data.sessionId, target }), signal: controller.signal }).catch(() => undefined);
        window.clearTimeout(timeout);
        if (!navigation?.ok) setMessage("The browser opened, but the first page could not load. Enter an address and press Go to retry.");
      })();
    }
  }
  async function open(targetOverride?: string) {
    const target = targetOverride ?? input;
    if (!viewerOpen) {
      if (sessionId && !(await releaseActive())) return;
      await startSession(target);
      return;
    }
    if (!target.trim()) { setMessage("Enter a search or website first."); return; }
    if (!sessionId) { await startSession(target); return; }
    setOpening(true); setMessage("Opening in the current session…");
    const token = (await getBrowserSupabase()?.auth.getSession())?.data.session?.access_token;
    if (!token) { setOpening(false); setMessage("Sign in again to continue browsing."); return; }
    const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 20_000);
    const response = await fetch("/api/browser/session", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ scapeId: scape.id, sessionId, target, activeUrl: browserRef.current?.lastUrl }), signal: controller.signal }).catch(() => undefined); window.clearTimeout(timeout);
    let data: { error?: string; destination?: { url: string; label: string } } | undefined; try { data = response ? await response.json() as typeof data : undefined; } catch { data = undefined; }
    if (!response?.ok) { setOpening(false); setDisconnected(true); setMessage(data?.error || "The live browser needs repair. Your latest checkpoint is safe."); return; }
    const event: WebLog = { id: `navigate-${sessionId}-${Date.now()}`, type: "navigate", time: new Date().toISOString(), url: data?.destination?.url, target: data?.destination?.label, detail: "Opened in the current browser session", sessionId };
    // The live viewer receives the CDP navigation directly. Remounting its
    // WebRTC stream here introduced visible latency and avoidable disconnects.
    persist({ lastTarget: target, lastUrl: data?.destination?.url, activity: [event, ...(browserRef.current?.activity || [])] }); setViewerOpen(true); setOpening(false); setMessage("");
  }
  async function reconnect() {
    if (!sessionId) { await startSession(input || browserRef.current?.lastTarget || ""); return; }
    // Viewer URLs are scoped to a live Steel session. A stale or broken URL
    // cannot be fixed by reloading the iframe, so rebuild from the latest safe
    // snapshot and keep the same persisted browser profile.
    const saved = browserRef.current?.sessions?.[sessionId];
    setMessage("Repairing the browser from its latest checkpoint…");
    const endedSnapshot = await releaseActive();
    const snapshot = endedSnapshot || saved;
    if (!snapshot?.tabs.length) { setMessage("No recovery checkpoint is available for this session."); return; }
    const activeTab = snapshot.tabs[snapshot.activeTab ?? 0] || snapshot.tabs.find((tab) => tab.active);
    await startSession(activeTab?.url || "", { key: crypto.randomUUID(), mode: "resume", name: snapshot.name, snapshot });
  }
  async function continueSavedSession() {
    setInput(browserRef.current?.lastTarget || "");
    setSessionName(browserRef.current?.activeSessionName || "");
    await reconnect();
  }
  useEffect(() => { releaseActiveRef.current = releaseActive; startSessionRef.current = startSession; });
  useEffect(() => {
    if (!resumeRequest || resumedRequestRef.current === resumeRequest.key) return;
    resumedRequestRef.current = resumeRequest.key;
    const activeTab = resumeRequest.snapshot.tabs[resumeRequest.snapshot.activeTab ?? 0] || resumeRequest.snapshot.tabs.find((tab) => tab.active);
    const begin = async () => {
      if (sessionId && !(await releaseActiveRef.current())) return;
      setInput(activeTab?.url || ""); setSessionName(resumeRequest.name);
      await startSessionRef.current(activeTab?.url || "", resumeRequest);
    };
    void begin();
  }, [resumeRequest, sessionId]);
  useEffect(() => {
    if (!sessionId || !scape.browser?.expiresAt || !viewerOpen) return;
    const remaining = new Date(scape.browser.expiresAt).getTime() - Date.now() - 45_000;
    if (remaining <= 0) { const timer = window.setTimeout(() => setDisconnected(true), 0); return () => window.clearTimeout(timer); }
    const timer = window.setTimeout(async () => {
      setMessage("Saving a checkpoint before Steel's session limit…");
      const saved = await releaseActiveRef.current();
      if (!saved || !saved.tabs.length) return;
      const activeTab = saved.tabs[saved.activeTab ?? 0] || saved.tabs.find((tab) => tab.active);
      await startSessionRef.current(activeTab?.url || "", { key: crypto.randomUUID(), mode: "resume", name: saved.name, snapshot: saved });
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [scape.browser?.expiresAt, sessionId, viewerOpen]);
  const shell = fullScreen ? "fixed inset-0 z-[70] flex h-screen flex-col rounded-none border-0 bg-white" : "scroll-mt-5 overflow-hidden rounded-2xl border border-[#e5e8e2] bg-white";
  return <section id="scape-browser" className={shell}>
    <div className="flex flex-wrap items-center gap-2 border-b border-[#e5e8e2] p-3 sm:p-4">
      <div className="mr-auto min-w-[10rem]"><p className="text-xs font-medium uppercase tracking-[.14em] text-[#718077]">Browse</p><input value={sessionName} onChange={(event) => setSessionName(event.target.value)} onBlur={saveSessionName} placeholder="Name this session" className="mt-0.5 w-full bg-transparent text-sm font-semibold outline-none placeholder:text-[#9aa39d]" aria-label="Browser session name" /></div>
      <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && !opening && !ending && void open()} placeholder="Search the web or enter a website" className="min-w-0 flex-1 rounded-lg border border-[#dce1d9] bg-white px-3 py-2 text-sm outline-none sm:max-w-sm" />
      <button onClick={() => void open()} disabled={opening || ending} className="shrink-0 rounded-lg bg-[#315443] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{opening ? "Opening…" : viewerOpen ? "Go" : "Open"}</button>
      {liveViewUrl && !viewerOpen && <button onClick={() => void continueSavedSession()} disabled={ending || opening} className="shrink-0 rounded-lg border border-[#315443] px-3 py-2 text-sm font-medium text-[#315443] disabled:opacity-60">Restore session</button>}
      {liveViewUrl && viewerOpen && <><button onClick={() => setPaused((value) => !value)} disabled={ending} className="shrink-0 rounded-lg border px-3 py-2 text-sm disabled:opacity-60">{paused ? "Resume view" : "Pause"}</button><button onClick={() => void reconnect()} disabled={ending || opening} className="shrink-0 rounded-lg border px-3 py-2 text-sm disabled:opacity-60">{disconnected ? "Restore session" : "Repair connection"}</button><button onClick={() => setFullScreen((value) => !value)} className="shrink-0 rounded-lg border px-3 py-2 text-sm">{fullScreen ? "Exit full screen" : "Full screen"}</button></>}
      {liveViewUrl && <button onClick={() => void releaseActive()} disabled={ending || opening} className="shrink-0 rounded-lg border px-3 py-2 text-sm disabled:opacity-60">{ending ? "Saving…" : "Save & end"}</button>}
    </div>
    {message && <p role="status" aria-live="polite" className="border-b border-[#e5e8e2] px-4 py-2 text-sm text-[#718077]">{message}</p>}
    {!viewerOpen && <div className="min-h-56 border-t border-[#e5e8e2] bg-white" aria-label="Browser is closed" />}
    {liveViewUrl && viewerOpen && <div className={`relative border-t border-[#e5e8e2] ${fullScreen ? "min-h-0 flex-1" : ""}`}><iframe key={viewerKey} title="DeepScapes remote browser" src={liveViewUrl} loading="eager" referrerPolicy="no-referrer" onError={() => { setDisconnected(true); setMessage("The live viewer could not load. Repair the connection to restore your saved session."); }} className={`${fullScreen ? "h-full min-h-[30rem]" : "h-[42rem]"} w-full border-0 bg-white ${paused ? "pointer-events-none opacity-70" : ""}`} allow="clipboard-read; clipboard-write; fullscreen; pointer-lock" allowFullScreen />{paused && <div className="absolute inset-0 grid place-items-center bg-white/45 backdrop-blur-[1px]"><button onClick={() => setPaused(false)} className="rounded-full bg-[#315443] px-5 py-3 text-sm font-medium text-white shadow-lg">Resume browsing</button></div>}</div>}
  </section>;
}

function ResourceSection({ section, resources, scape, canEdit, onAdd, onToggle, onStar, onDelete, onMaximize }: { section: { label: string; type: ResourceType | "starred"; icon: string }; resources: Resource[]; scape: Scape; canEdit: boolean; onAdd: () => void; onToggle: (resource: Resource) => void; onStar: (resource: Resource) => void; onDelete: (resource: Resource) => void; onMaximize: () => void }) {
  return <section className="rounded-2xl border border-[#e5e8e2] bg-white p-4 shadow-[0_8px_24px_rgba(23,35,29,.025)]"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#edf0df] text-[#315443]"><Icon name={section.icon} className="h-4 w-4" /></span><div className="min-w-0 flex-1"><span className="block font-semibold">{section.label}</span><span className="text-xs text-[#8b968e]">{resources.length} item{resources.length === 1 ? "" : "s"}</span></div>{canEdit && <button onClick={onAdd} className="rounded-lg px-2 py-1 text-xs text-[#718077] hover:bg-[#edf0df]">Add</button>}<button onClick={onMaximize} className="grid h-8 w-8 place-items-center rounded-lg text-[#718077] hover:bg-[#edf0df]" aria-label={"Expand " + section.label}>↗</button></div><div className="mt-3 border-t border-[#e5e8e2] pt-2">{resources.length ? <div className="space-y-1">{resources.slice(0, 3).map((resource) => <ResourceItem key={resource.id} resource={resource} scape={scape} canEdit={canEdit} onToggle={onToggle} onStar={onStar} onDelete={onDelete} />)}{resources.length > 3 && <button onClick={onMaximize} className="px-2 pt-2 text-xs text-[#718077]">View all {resources.length} items →</button>}</div> : <button disabled={!canEdit} onClick={onAdd} className="w-full py-4 text-left text-sm text-[#8b968e] disabled:cursor-default">No {section.label.toLowerCase()} yet — add one</button>}</div></section>;
}

function FocusedSection({ label, resources, scape, canEdit, close, onToggle, onStar, onDelete }: { label: string; resources: Resource[]; scape: Scape; canEdit: boolean; close: () => void; onToggle: (resource: Resource) => void; onStar: (resource: Resource) => void; onDelete: (resource: Resource) => void }) {
  const [sort, setSort] = useState<"recent" | "name" | "starred">("recent"); const [appearance, setAppearance] = useState<"list" | "tiles" | "details">("list");
  const ordered = [...resources].sort((left, right) => sort === "name" ? left.title.localeCompare(right.title) : sort === "starred" ? Number(Boolean(right.starred)) - Number(Boolean(left.starred)) : 0);
  const layout = appearance === "tiles" ? "grid gap-3 sm:grid-cols-2" : "space-y-2";
  return <div className="fixed inset-0 z-30 bg-black/55 p-3 sm:p-8" onMouseDown={close}><section onMouseDown={(item) => item.stopPropagation()} className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-[1.75rem] bg-[#f9faf7] shadow-2xl"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e8e2] p-5 sm:p-7"><h2 className="text-2xl font-semibold">{label}</h2><div className="flex items-center gap-2"><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="rounded-lg border bg-white px-2 py-2 text-sm" aria-label="Sort content"><option value="recent">Recent</option><option value="name">Name</option><option value="starred">Starred</option></select><div className="flex rounded-lg border bg-white p-0.5" aria-label="Content appearance"><button onClick={() => setAppearance("list")} className={"rounded px-2 py-1 text-xs " + (appearance === "list" ? "bg-[#edf0df]" : "")}>List</button><button onClick={() => setAppearance("tiles")} className={"rounded px-2 py-1 text-xs " + (appearance === "tiles" ? "bg-[#edf0df]" : "")}>Tiles</button><button onClick={() => setAppearance("details")} className={"rounded px-2 py-1 text-xs " + (appearance === "details" ? "bg-[#edf0df]" : "")}>Details</button></div><button onClick={close} className="rounded-lg border px-3 py-2 text-sm">Close</button></div></header><div className={"flex-1 overflow-y-auto p-5 sm:p-7 " + layout}>{ordered.length ? ordered.map((resource) => <ResourceItem key={resource.id} resource={resource} scape={scape} canEdit={canEdit} onToggle={onToggle} onStar={onStar} onDelete={onDelete} appearance={appearance} expanded />) : <p className="text-sm text-[#718077]">No {label.toLowerCase()} yet.</p>}</div></section></div>;
}

function ResourceItem({ resource, scape, canEdit, onToggle, onStar, onDelete, appearance = "list", expanded = false }: { resource: Resource; scape: Scape; canEdit: boolean; onToggle: (resource: Resource) => void; onStar: (resource: Resource) => void; onDelete: (resource: Resource) => void; appearance?: "list" | "tiles" | "details"; expanded?: boolean }) {
  const preview = resource.type === "image" && resource.content?.startsWith("data:");
  const href = "/resource/" + scape.id + "/" + resource.id;
  const fileUrl = resource.downloadUrl || resource.content;
  const downloadable = expanded && resource.type !== "note" && resource.type !== "task" && resource.type !== "link" && Boolean(fileUrl?.startsWith("data:") || fileUrl?.startsWith("https://"));
  return <div className={"resource-item flex min-w-0 items-center gap-3 rounded-xl p-2 transition hover:bg-[#f9faf7] " + (appearance === "tiles" ? "border border-[#e5e8e2] p-4" : appearance === "details" ? "border-b border-[#e5e8e2] rounded-none py-3" : "")}>{resource.type !== "task" && (preview ? <Image src={resource.content!} alt="" width={72} height={52} unoptimized className="h-12 w-16 rounded-lg object-cover" /> : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#edf0df] text-[#315443]"><Icon name={icons[resource.type]} className="h-4 w-4" /></span>)}{resource.type === "task" && <input type="checkbox" checked={Boolean(resource.done)} onChange={() => onToggle(resource)} disabled={!canEdit} className="h-4 w-4 shrink-0 accent-[#315443]" aria-label={resource.done ? "Mark task incomplete" : "Mark task complete"} />}<div className="min-w-0 flex-1">{resource.type === "task" ? <button onClick={() => onToggle(resource)} disabled={!canEdit} className={"text-left text-sm font-medium " + (resource.done ? "text-[#8b968e] line-through" : "")}>{resource.title}</button> : <Link href={href} className="block truncate text-sm font-medium hover:underline">{resource.title}</Link>}<p className="truncate text-xs text-[#8b968e]">{appearance === "details" ? resource.detail + " · " + resource.date : resource.detail}</p></div>{canEdit && <div className="flex shrink-0 items-center gap-1"><button onClick={() => onStar(resource)} className="star-control grid h-10 w-10 place-items-center rounded-lg hover:bg-[#edf0df]" data-starred={resource.starred} aria-label={resource.starred ? "Unstar resource" : "Star resource"}>★</button>{downloadable && <button onClick={() => void downloadResource(fileUrl!, resource.title)} className="grid h-8 w-8 place-items-center rounded-lg text-[#315443] hover:bg-[#edf0df]" aria-label={"Download " + resource.title}><Icon name="download" className="h-4 w-4" /></button>}{expanded && <button onClick={() => onDelete(resource)} className="grid h-8 w-8 place-items-center rounded-lg text-[#a95b54] hover:bg-[#f7e8e5]" aria-label={"Delete " + resource.title}><Icon name="delete" className="h-4 w-4" /></button>}<Link href={href + "?edit=1"} className="rounded-lg px-2 py-1 text-xs text-[#718077] hover:bg-[#edf0df]">Edit</Link></div>}</div>;
}

function WebSessionDisclosure({ session, compact = false, onResume }: { session: WebSession; compact?: boolean; onResume?: (session: WebSession) => void }) {
  const visibleEvents = compact ? session.events.slice(-4).reverse() : session.events;
  const statusStyle = session.status === "active" ? "web-session-status-active bg-[#dcebd7] text-[#315443]" : session.status === "ended" ? "web-session-status-ended bg-[#edf0df] text-[#607168]" : "web-session-status-interrupted bg-[#f3e4dd] text-[#8a5545]";
  return <details className="web-session-card group overflow-hidden rounded-xl border border-[#e5e8e2] bg-[#fbfcf9] open:bg-white">
    <summary className="flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
      <span className={`h-2 w-2 shrink-0 rounded-full ${session.status === "active" ? "bg-[#65a66f]" : session.status === "ended" ? "bg-[#9aa39d]" : "bg-[#c68a72]"}`} />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{session.title}</p><p className="mt-0.5 truncate text-xs text-[#8b968e]">{relative(session.startedAt)} · {session.snapshot?.tabs.length ? `${session.snapshot.tabs.length} tab${session.snapshot.tabs.length === 1 ? "" : "s"} · ` : ""}{session.events.length} event{session.events.length === 1 ? "" : "s"}</p></div>
      {!compact && <span className={`rounded-full px-2 py-1 text-[10px] font-medium capitalize ${statusStyle}`}>{session.status}</span>}
      <span className="text-xs text-[#718077] transition group-open:rotate-180">⌄</span>
    </summary>
    <div className="border-t border-[#edf0eb] px-3 pb-3 pt-2">
      {session.url && onResume && <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-[#dce1d9] bg-white p-3"><div className="min-w-0"><p className="text-xs font-medium">{session.status === "active" ? "Current browser session" : "Continue where this session stopped"}</p><p className="mt-0.5 truncate text-[11px] text-[#8b968e]">{session.url}</p></div><button type="button" onClick={() => onResume(session)} className="shrink-0 rounded-lg bg-[#315443] px-3 py-2 text-xs font-medium text-white">{session.status === "active" ? "Return" : "Resume"}</button></div>}
      {!compact && <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-[#f2f4ed] p-3 text-xs text-[#718077] sm:grid-cols-4"><div><span className="block text-[10px] uppercase tracking-[.12em] text-[#9aa39d]">Started</span><span className="mt-1 block text-[#34443a]">{eventTime(session.startedAt)}</span></div><div><span className="block text-[10px] uppercase tracking-[.12em] text-[#9aa39d]">Last activity</span><span className="mt-1 block text-[#34443a]">{eventTime(session.lastAt)}</span></div><div><span className="block text-[10px] uppercase tracking-[.12em] text-[#9aa39d]">Duration</span><span className="mt-1 block text-[#34443a]">{durationLabel(session)}</span></div><div><span className="block text-[10px] uppercase tracking-[.12em] text-[#9aa39d]">Session</span><span className="mt-1 block truncate font-mono text-[#34443a]" title={session.id}>{session.id.slice(0, 8)}</span></div></div>}
      <div className="space-y-0">{visibleEvents.map((item, index) => <div className="relative flex gap-3 pb-3 last:pb-0" key={item.id}>{index < visibleEvents.length - 1 && <span className="absolute bottom-0 left-[3px] top-2 w-px bg-[#dce1d9]" />}<span className="relative mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#718077]" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-xs font-medium capitalize text-[#34443a]">{item.type}</p><time className="shrink-0 text-[10px] text-[#9aa39d]" title={eventTime(item.time)}>{relative(item.time)}</time></div>{eventTarget(item.target) && <p className="mt-0.5 truncate text-xs text-[#718077]">{eventTarget(item.target)}</p>}{item.detail && item.detail !== item.target && <p className="mt-0.5 text-xs leading-4 text-[#8b968e]">{item.detail}</p>}{item.url && <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[11px] text-[#315443] hover:underline">{item.url}</a>}</div></div>)}</div>
      {compact && session.events.length > visibleEvents.length && <p className="mt-2 text-xs text-[#8b968e]">{session.events.length - visibleEvents.length} earlier events · use View all for the complete log</p>}
    </div>
  </details>;
}

function WebActivity({ sessions, close, onResume }: { sessions: WebSession[]; close: () => void; onResume: (session: WebSession) => void }) {
  return <div className="fixed inset-0 z-30 grid place-items-center bg-black/55 p-4" onMouseDown={close}><section onMouseDown={(event) => event.stopPropagation()} className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-[#f9faf7] shadow-2xl"><header className="flex items-center justify-between border-b border-[#e5e8e2] p-5 sm:p-6"><div><h2 className="text-xl font-semibold">Web session history</h2><p className="mt-1 text-xs text-[#718077]">{sessions.length} session{sessions.length === 1 ? "" : "s"} · expand a session for its complete log</p></div><button onClick={close} className="rounded-lg border px-3 py-2 text-sm">Close</button></header><div className="space-y-3 overflow-y-auto p-4 sm:p-6">{sessions.map((session) => <WebSessionDisclosure key={session.id} session={session} onResume={onResume} />)}</div></section></div>;
}

function ResumeSessionChoice({ session, close, choose }: { session: WebSession; close: () => void; choose: (mode: "resume" | "duplicate") => void }) {
  const tabs = session.snapshot?.tabs.length || 1;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={close}><section onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-[#e5e8e2] bg-[#f9faf7] p-6 shadow-2xl"><p className="text-xs font-medium uppercase tracking-[.14em] text-[#718077]">Restore browser session</p><h2 className="mt-2 text-2xl font-semibold">{session.title}</h2><p className="mt-2 text-sm leading-6 text-[#718077]">{tabs} saved tab{tabs === 1 ? "" : "s"} will be reconstructed with the persisted browser profile, scroll positions, and safe form state.</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><button onClick={() => choose("resume")} className="rounded-xl bg-[#315443] p-4 text-left text-white"><span className="block font-semibold">Resume session</span><span className="mt-1 block text-xs text-white/75">Continue this session&apos;s history.</span></button><button onClick={() => choose("duplicate")} className="rounded-xl border border-[#dce1d9] bg-white p-4 text-left"><span className="block font-semibold">Create a copy</span><span className="mt-1 block text-xs text-[#718077]">Keep the original and branch from it.</span></button></div><button onClick={close} className="mt-4 w-full rounded-lg px-3 py-2 text-sm text-[#718077]">Cancel</button></section></div>;
}

async function prepareThumbnail(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file for the thumbnail.");
  const source = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("The image could not be read.")); reader.readAsDataURL(file); });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const next = new window.Image(); next.onload = () => resolve(next); next.onerror = () => reject(new Error("The image could not be prepared.")); next.src = source; });
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d"); if (!context) throw new Error("Your browser could not prepare this image.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.82);
}

function ScapeEditor({ scape, close, save, canDelete }: { scape: Scape; close: () => void; save: (scape: Scape) => Promise<void>; canDelete: boolean }) {
  const [title, setTitle] = useState(scape.title); const [description, setDescription] = useState(scape.description); const [cover, setCover] = useState(scape.cover); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [imageUploaded, setImageUploaded] = useState(scape.cover.startsWith("data:"));
  const router = useRouter();
  async function upload(file?: File) { if (!file) return; setError(""); try { setCover(await prepareThumbnail(file)); setImageUploaded(true); } catch (cause) { setError(cause instanceof Error ? cause.message : "The image could not be prepared."); } }
  async function submit() { if (!title.trim()) return; setSaving(true); setError(""); try { await save({ ...scape, title: title.trim(), description, cover, activity: [log("Scape information updated", title.trim()), ...scape.activity] }); close(); } catch { setError("Couldn’t save this Scape. Please try again."); } finally { setSaving(false); } }
  const preview = { "--scape-cover": cover.startsWith("data:") ? "url(" + cover + ")" : cover } as CSSProperties;
  function remove() { if (!window.confirm("Delete " + scape.title + "? This cannot be undone.")) return; deleteScape(scape.id); router.push("/scapes"); }
  return <div className="fixed inset-0 z-30 flex justify-end bg-black/50" onMouseDown={close}><aside onMouseDown={(item) => item.stopPropagation()} className="h-full w-full max-w-md overflow-y-auto bg-[#f9faf7] p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-2xl font-semibold">Edit Scape</h2><button onClick={close}><Icon name="close" className="h-5 w-5" /></button></div><label className="mt-8 block text-sm font-medium">Name<input value={title} onChange={(item) => setTitle(item.target.value)} className="mt-2 w-full rounded-lg border px-3 py-2" /></label><label className="mt-5 block text-sm font-medium">Description<textarea value={description} onChange={(item) => setDescription(item.target.value)} className="mt-2 h-28 w-full rounded-lg border px-3 py-2" /></label><div className="mt-5"><p className="text-sm font-medium">Thumbnail</p><div className="scape-thumbnail-preview mt-3 h-28 rounded-xl border border-[#e5e8e2]" style={preview} /><div className="mt-3 flex items-center gap-3"><input type="color" value={cover.startsWith("data:") ? "#1d4ed8" : cover} onChange={(item) => { setError(""); setImageUploaded(false); setCover(item.target.value); }} className="h-10 w-12 cursor-pointer rounded border p-1" aria-label="Choose thumbnail color" /><label className="cursor-pointer rounded-lg border px-3 py-2 text-sm">Upload image<input type="file" accept="image/*" onChange={(item) => void upload(item.target.files?.[0])} className="hidden" /></label></div>{imageUploaded && <p role="status" className="mt-2 text-xs text-[#718077]">Image uploaded</p>}{error && <p role="alert" className="mt-2 text-sm text-[#a95b54]">{error}</p>}</div><button disabled={saving} onClick={() => void submit()} className="mt-8 w-full rounded-lg bg-[#315443] py-3 text-sm font-medium text-white">{saving ? "Saving…" : "Save changes"}</button>{canDelete && <button onClick={remove} className="mt-4 w-full rounded-lg px-3 py-2 text-sm text-[#a95b54] hover:bg-[#f7e8e5]">Delete Scape</button>}</aside></div>;
}

function AddResource({ scape, initialType, close, onAdded, onPersistError }: { scape: Scape; initialType: ResourceType; close: () => void; onAdded: (resource: Resource) => void; onPersistError: () => void }) {
  const [type, setType] = useState<ResourceType>(initialType); const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [name, setName] = useState(""); const [data, setData] = useState(""); const [downloadUrl, setDownloadUrl] = useState(""); const [mime, setMime] = useState(""); const [uploading, setUploading] = useState(false); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  function classify(file: File): ResourceType { if (file.type.startsWith("image/")) return "image"; if (file.type.startsWith("video/")) return "video"; if (file.type.startsWith("audio/")) return "audio"; return "file"; }
  async function upload(file?: File) {
    if (!file) return;
    setMessage(""); setName(file.name); setMime(file.type); setType(classify(file)); if (!title) setTitle(file.name); setUploading(true);
    const client = getBrowserSupabase(); const token = (await client?.auth.getSession())?.data.session?.access_token;
    if (client && token) {
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const prepare = await fetch("/api/resources/upload", { method: "POST", headers, body: JSON.stringify({ action: "prepare", scapeId: scape.id, fileName: file.name, mimeType: file.type }) }).catch(() => undefined);
      let prepared: { bucket?: string; path?: string; token?: string; mimeType?: string; error?: string } | undefined;
      try { prepared = prepare ? await prepare.json() as typeof prepared : undefined; } catch { prepared = undefined; }
      if (prepare?.ok && prepared?.bucket && prepared.path && prepared.token) {
        const { error } = await client.storage.from(prepared.bucket).uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: prepared.mimeType || file.type || "application/octet-stream" });
        if (!error) {
          const complete = await fetch("/api/resources/upload", { method: "POST", headers, body: JSON.stringify({ action: "complete", scapeId: scape.id, path: prepared.path }) }).catch(() => undefined);
          let completed: { url?: string; downloadUrl?: string; error?: string } | undefined;
          try { completed = complete ? await complete.json() as typeof completed : undefined; } catch { completed = undefined; }
          if (complete?.ok && completed?.url) { setData(completed.url); setDownloadUrl(completed.downloadUrl || completed.url); setMime(prepared.mimeType || file.type); setUploading(false); return; }
          setMessage(completed?.error || "The file uploaded, but its secure link could not be created."); setUploading(false); return;
        }
        setMessage(error.message); setUploading(false); return;
      }
      setMessage(prepared?.error || "Could not prepare this file for upload."); setUploading(false); return;
    }
    if (file.size < 2_000_000) { const reader = new FileReader(); reader.onload = () => { const value = String(reader.result); setData(value); setDownloadUrl(value); setUploading(false); }; reader.readAsDataURL(file); return; }
    setUploading(false); setMessage("Sign in to upload files to your Scape.");
  }
  async function add() {
    if (uploading || saving) return;
    setSaving(true); setMessage("");
    const item: Resource = { id: newId("resource"), title: title || name || "Untitled resource", type, detail: (type === "file" ? "Document" : type) + " · " + (name || "Added"), date: "Just now", content: data || content, downloadUrl: downloadUrl || undefined, mimeType: mime };
    // saveScape updates the local store synchronously. Close immediately, then
    // finish the remote persistence without making the modal feel stuck.
    const current = getScape(scape.id) || scape;
    let persistence: Promise<void>;
    try { persistence = saveScape({ ...current, resources: [item, ...current.resources], activity: [log((type === "file" ? "File" : type) + " added", item.title), ...current.activity] }); }
    catch { setSaving(false); setMessage("Could not add this resource on this device. Please try again."); return; }
    close(); onAdded(item);
    try { await persistence; } catch { onPersistError(); }
  }
  return <div className="fixed inset-0 z-20 grid place-items-end bg-black/60 p-4 sm:place-items-center" onMouseDown={close}><div onMouseDown={(item) => item.stopPropagation()} className="w-full max-w-xl rounded-2xl bg-[#f9faf7] p-6 shadow-2xl"><div className="flex justify-between"><div><p className="text-sm text-[#718077]">Add resource</p><h2 className="mt-1 text-xl font-semibold">{scape.title}</h2></div><button onClick={close}><Icon name="close" className="h-5 w-5" /></button></div><div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-7">{(["note", "task", "file", "image", "video", "audio", "link"] as ResourceType[]).map((kind) => <button onClick={() => setType(kind)} className={"rounded-lg px-2 py-2 text-xs capitalize " + (type === kind ? "bg-[#315443] text-white" : "bg-white text-[#718077]")} key={kind}>{kind}</button>)}</div><label className="mt-5 block text-sm">Name<input value={title} onChange={(item) => setTitle(item.target.value)} className="mt-2 w-full rounded-lg border px-3 py-2" /></label>{(type === "note" || type === "link") && <label className="mt-4 block text-sm">{type === "link" ? "URL" : "Content"}<textarea value={content} onChange={(item) => setContent(item.target.value)} className="mt-2 h-24 w-full rounded-lg border px-3 py-2" /></label>}{["file", "image", "video", "audio"].includes(type) && <label className="mt-4 block cursor-pointer rounded-xl border border-dashed p-4 text-center text-sm text-[#718077]">{uploading ? "Uploading…" : name || "Choose any file — it will be sorted automatically"}<input type="file" onChange={(item) => void upload(item.target.files?.[0])} className="hidden" /></label>}{message && <p className="mt-3 text-sm text-[#a95b54]">{message}</p>}<button onClick={() => void add()} disabled={uploading || saving || (["file", "image", "video", "audio"].includes(type) && !data)} className="mt-5 w-full rounded-lg bg-[#315443] py-3 text-sm font-medium text-white disabled:opacity-50">{uploading ? "Uploading…" : saving ? "Adding…" : "Add resource"}</button></div></div>;
}
