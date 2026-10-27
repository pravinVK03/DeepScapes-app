import { databaseEnabled, getSupabase } from "@/lib/db";
import { BrowserActivity, BrowserSessionSnapshot, BrowserTabSnapshot, Scape } from "@/lib/mock-data";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

async function currentUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return undefined;
  const { data } = await getSupabase().auth.getUser(token);
  return data.user;
}

function canAccess(scape: Scape, userId: string, email?: string, needsEdit = false) {
  if (scape.ownerId === userId) return true;
  return scape.collaborators?.some((person) => (person.id === userId || (Boolean(email) && person.email === email)) && (!needsEdit || person.permission === "edit")) ?? false;
}

function destination(value?: string) {
  const input = value?.trim();
  if (!input) return { url: "about:blank", label: "Blank tab" };
  if (/^https?:\/\//i.test(input)) return { url: input, label: input };
  if (input.includes(".") && !/\s/.test(input)) return { url: "https://" + input, label: input };
  return { url: "https://www.google.com/search?q=" + encodeURIComponent(input), label: input };
}

type CdpResult<T = unknown> = { id?: number; result?: T; error?: { message?: string }; sessionId?: string };

async function withCdp<T>(connectUrl: string, work: (send: <R = unknown>(method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<R>) => Promise<T>) {
  const socket = new WebSocket(connectUrl);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { socket.close(); reject(new Error("CDP connection timed out")); }, 8_000);
    socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP connection failed")); }, { once: true });
  });
  let sequence = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timeout: ReturnType<typeof setTimeout> }>();
  socket.addEventListener("message", (event) => {
    let message: CdpResult;
    try { message = JSON.parse(String(event.data)) as CdpResult; } catch { return; }
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timeout); pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message || "Remote browser command failed"));
    else request.resolve(message.result);
  });
  const send = <R,>(method: string, params: Record<string, unknown> = {}, sessionId?: string) => new Promise<R>((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 12_000);
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timeout });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  try { return await work(send); } finally {
    for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(new Error("CDP connection closed")); }
    pending.clear(); socket.close();
  }
}

async function openRemotePages(connectUrl: string, tabs: BrowserTabSnapshot[]) {
  const pages = tabs.filter((tab) => /^https?:\/\//i.test(tab.url)).slice(0, 20);
  if (!pages.length) return;
  await withCdp(connectUrl, async (send) => {
    const before = await send<{ targetInfos?: { targetId: string; type: string; url: string }[] }>("Target.getTargets");
    const emptyTargets = (before.targetInfos || []).filter((item) => item.type === "page" && (item.url === "about:blank" || !item.url));
    // Target creation is intentionally sequential: concurrent creation lets
    // Chrome race tabs into a different order. Rebuild in saved order and only
    // focus the last active tab after every page has been restored.
    const created: { tab: BrowserTabSnapshot; target: { targetId?: string } }[] = [];
    for (const tab of pages) created.push({ tab, target: await send<{ targetId?: string }>("Target.createTarget", { url: tab.url }) });
    let activeSessionId: string | undefined;
    for (const { tab, target } of created) {
      if (!target.targetId || (!tab.active && !tab.scrollX && !tab.scrollY && !tab.fields?.length)) continue;
      const attached = await send<{ sessionId?: string }>("Target.attachToTarget", { targetId: target.targetId, flatten: true });
      if (!attached.sessionId) continue;
      if (tab.scrollX || tab.scrollY || tab.fields?.length) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        const state = JSON.stringify({ scrollX: tab.scrollX || 0, scrollY: tab.scrollY || 0, fields: tab.fields || [] });
        const expression = `(() => { const state = ${state}; scrollTo(state.scrollX, state.scrollY); for (const field of state.fields) { const node = document.querySelector(field.selector); if (!node) continue; if (typeof field.checked === 'boolean') node.checked = field.checked; if (typeof field.selectedIndex === 'number') node.selectedIndex = field.selectedIndex; if (typeof field.value === 'string') node.value = field.value; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); } })()`;
        await send("Runtime.evaluate", { expression }, attached.sessionId).catch(() => undefined);
      }
      if (tab.active) activeSessionId = attached.sessionId;
    }
    for (const target of emptyTargets) await send("Target.closeTarget", { targetId: target.targetId }).catch(() => undefined);
    if (activeSessionId) await send("Page.bringToFront", {}, activeSessionId).catch(() => undefined);
  });
}

async function navigateRemotePage(connectUrl: string, url: string, activeUrl?: string) {
  await withCdp(connectUrl, async (send) => {
    const targets = await send<{ targetInfos?: { targetId: string; type: string; url: string }[] }>("Target.getTargets");
    const pages = (targets.targetInfos || []).filter((item) => item.type === "page" && !item.url.startsWith("devtools://"));
    const current = pages.find((page) => activeUrl && page.url === activeUrl) || pages.at(-1);
    if (!current) { await send("Target.createTarget", { url }); return; }
    const attached = await send<{ sessionId?: string }>("Target.attachToTarget", { targetId: current.targetId, flatten: true });
    if (!attached.sessionId) { await send("Target.createTarget", { url }); return; }
    await send("Page.navigate", { url }, attached.sessionId);
    await send("Page.bringToFront", {}, attached.sessionId).catch(() => undefined);
  });
}

async function captureRemoteSession(connectUrl: string, sessionId: string, name: string, activeUrl?: string): Promise<BrowserSessionSnapshot> {
  return withCdp(connectUrl, async (send) => {
    const targets = await send<{ targetInfos?: { targetId: string; type: string; url: string; title?: string }[] }>("Target.getTargets");
    const pages = (targets.targetInfos || []).filter((item) => item.type === "page" && /^https?:\/\//i.test(item.url)).slice(0, 20);
    const tabs: BrowserTabSnapshot[] = [];
    for (const page of pages) {
      const tab: BrowserTabSnapshot = { url: page.url, title: page.title, active: false };
      try {
        const attached = await send<{ sessionId?: string }>("Target.attachToTarget", { targetId: page.targetId, flatten: true });
        if (attached.sessionId) {
          const expression = `(() => { const sensitive = /pass|secret|token|card|cc-|otp|one-time/i; const esc = (value) => CSS.escape(String(value)); const selector = (node) => node.id ? '#' + esc(node.id) : node.name ? node.tagName.toLowerCase() + '[name="' + String(node.name).replace(/["\\]/g, '\\$&') + '"]' : ''; return { active: document.hasFocus(), scrollX, scrollY, fields: Array.from(document.querySelectorAll('input, textarea, select')).map((node) => { const key = selector(node); const type = String(node.type || '').toLowerCase(); const autocomplete = String(node.autocomplete || ''); if (!key || type === 'password' || sensitive.test(node.name || '') || sensitive.test(autocomplete)) return null; return { selector: key, value: type === 'checkbox' || type === 'radio' ? undefined : String(node.value || '').slice(0, 2000), checked: type === 'checkbox' || type === 'radio' ? Boolean(node.checked) : undefined, selectedIndex: node.tagName === 'SELECT' ? node.selectedIndex : undefined }; }).filter(Boolean).slice(0, 100) }; })()`;
          const evaluated = await send<{ result?: { value?: { active?: boolean; scrollX?: number; scrollY?: number; fields?: BrowserTabSnapshot["fields"] } } }>("Runtime.evaluate", { expression, returnByValue: true }, attached.sessionId);
          const value = evaluated.result?.value;
          tab.active = Boolean(value?.active); tab.scrollX = value?.scrollX; tab.scrollY = value?.scrollY; tab.fields = value?.fields;
        }
      } catch { /* Keep the URL even when a page blocks inspection. */ }
      tabs.push(tab);
    }
    if (tabs.length && !tabs.some((tab) => tab.active) && activeUrl) {
      const traceActive = tabs.find((tab) => tab.url === activeUrl);
      if (traceActive) traceActive.active = true;
    }
    if (tabs.length && !tabs.some((tab) => tab.active)) tabs[tabs.length - 1].active = true;
    return { sessionId, name, capturedAt: new Date().toISOString(), tabs, activeTab: Math.max(0, tabs.findIndex((tab) => tab.active)) };
  });
}

function interactiveViewerUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return undefined; }
  if (url.protocol !== "https:") return undefined;
  url.searchParams.set("interactive", "true");
  return url.toString();
}

async function usableViewerUrl(value: string) {
  const viewer = interactiveViewerUrl(value);
  if (!viewer) return undefined;
  // A sessionViewerUrl may redirect to Steel's account sign-in page. Verify
  // that an embed is a real live viewer before returning it to the iframe so
  // the application never displays a provider login or routing error.
  const response = await fetch(viewer, {
    headers: { Accept: "text/html,application/xhtml+xml" },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(6_000),
  }).catch(() => undefined);
  if (!response?.ok || !response.headers.get("content-type")?.includes("text/html")) return undefined;
  const preview = (await response.text().catch(() => "")).slice(0, 32_000);
  if (/sign in to steel|continue with github|continue with google/i.test(preview)) return undefined;
  return viewer;
}

function steelConnectUrl(sessionId: string, apiKey: string) {
  const url = new URL("wss://connect.steel.dev");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("sessionId", sessionId);
  return url.toString();
}

type SteelSession = { id?: string; debugUrl?: string; sessionViewerUrl?: string; websocketUrl?: string; expiresAt?: string; profileId?: string };

function steelHeaders(apiKey: string) { return { "Content-Type": "application/json", "steel-api-key": apiKey }; }

async function createSteelSession(apiKey: string, body: Record<string, unknown>) {
  return fetch("https://api.steel.dev/v1/sessions", { method: "POST", headers: steelHeaders(apiKey), body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
}

function safeTraceText(value: unknown) {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["label", "name", "text", "ariaLabel", "selector", "role"]) {
    const candidate = record[key]; if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function safeTraceUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/pass|secret|token|key|code|otp|session/i.test(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString().slice(0, 2048);
  } catch {
    return undefined;
  }
}

function cleanTrace(event: unknown, sessionId: string, index: number): BrowserActivity {
  const source = event as { id?: string; type?: string; timestamp?: string; page?: { url?: string }; target?: unknown; value?: unknown; input?: unknown };
  const type = String(source.type || "browser activity").slice(0, 80);
  // Never retain typed values: traces can include credentials and form entries.
  const target = type === "input" ? "Form field" : safeTraceText(source.target)?.slice(0, 180);
  return { id: String(source.id || `${sessionId}-${source.timestamp || Date.now()}-${index}`), type, time: source.timestamp || new Date().toISOString(), url: safeTraceUrl(source.page?.url), target, detail: type === "input" ? "Text entered (redacted)" : target, sessionId };
}

async function loadScape(request: Request, scapeId?: string, needsEdit = false) {
  const user = await currentUser(request);
  if (!user) return { error: Response.json({ error: "Sign in required" }, { status: 401 }) };
  if (!scapeId) return { error: Response.json({ error: "Scape is required" }, { status: 400 }) };
  const supabase = getSupabase();
  const { data: row, error: readError } = await supabase.from("scapes").select("payload").eq("id", scapeId).maybeSingle();
  const scape = row?.payload as Scape | undefined;
  if (readError || !scape) return { error: Response.json({ error: "Scape not found" }, { status: 404 }) };
  if (!canAccess(scape, user.id, user.email, needsEdit)) return { error: Response.json({ error: needsEdit ? "Editor access is required" : "You do not have access to this Scape" }, { status: 403 }) };
  return { scape, user };
}

async function requestBody<T>(request: Request): Promise<T | undefined> {
  try { return await request.json() as T; } catch { return undefined; }
}

export async function POST(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const apiKey = process.env.STEEL_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Remote browsing is not configured" }, { status: 503 });
  }

  const body = await requestBody<{ scapeId?: string; target?: string; sessionName?: string; snapshot?: BrowserSessionSnapshot; sourceSessionId?: string }>(request);
  if (!body) return Response.json({ error: "Invalid browser request" }, { status: 400 });
  const { scapeId, target, sessionName, snapshot, sourceSessionId } = body;
  if ((target?.length || 0) > 1_000 || (sessionName?.length || 0) > 120 || (snapshot?.tabs.length || 0) > 20) return Response.json({ error: "This browser request is too large." }, { status: 400 });
  const loaded = await loadScape(request, scapeId, true);
  if (loaded.error) return loaded.error;
  const scape = loaded.scape!;
  const quota = await rateLimit(request, "steel-session", 4, 60 * 60 * 1000, loaded.user!.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  const dailyQuota = await rateLimit(request, "steel-session-daily", 10, 24 * 60 * 60 * 1000, loaded.user!.id);
  if (!dailyQuota.allowed) return rateLimited(dailyQuota.retryAfter);

  // No inactivityTimeout: remote input may legitimately pause while the user reads.
  // Steel still enforces the plan's hard session lifetime.
  const requestedTimeout = Math.max(120_000, Math.min(900_000, Number(process.env.STEEL_SESSION_TIMEOUT_MS) || 600_000));
  // Steel's cursor tracks the streamed desktop and receives interactive input.
  // The host iframe pointer is hidden in the client so only this cursor shows.
  const viewerConfig = { debugConfig: { interactive: true, systemCursor: true }, timeout: requestedTimeout };
  const sessionRequest = scape.browser?.profileId
    ? { ...viewerConfig, profileId: scape.browser.profileId, persistProfile: true }
    : { ...viewerConfig, persistProfile: true };
  let response = await createSteelSession(apiKey, sessionRequest);
  // A persisted profile briefly uploads after release. Wait for it instead of
  // silently starting a disconnected browser identity without its cookies.
  if (scape.browser?.profileId) {
    for (let attempt = 0; response?.status === 409 && attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      response = await createSteelSession(apiKey, sessionRequest);
    }
  }
  // If the plan rejects the requested lifetime, retain the no-idle-shutdown behavior
  // and let Steel apply its account default.
  if (response && !response.ok && [400, 422].includes(response.status)) {
    const fallback = scape.browser?.profileId
      ? { debugConfig: viewerConfig.debugConfig, profileId: scape.browser.profileId, persistProfile: true }
      : { debugConfig: viewerConfig.debugConfig, persistProfile: true };
    response = await createSteelSession(apiKey, fallback);
  }
  // Do not silently create a fresh browser when a profile is still uploading:
  // that would discard the authenticated state users expect after resuming.
  if (response?.status === 409 && scape.browser?.profileId) {
    return Response.json({ error: "Your saved browser identity is still being secured. Please retry in a few seconds; your session has not been replaced." }, { status: 409 });
  }
  let session: SteelSession | undefined;
  try { session = response ? await response.json() as SteelSession : undefined; } catch { session = undefined; }
  if (!response?.ok || !session) {
    const status = response?.status;
    const message = status === 401 || status === 403 || status === 402 || status === 429
      ? "Remote browsing is temporarily unavailable. Please try again later."
      : "Steel could not start a remote browser. Please retry shortly.";
    return Response.json({ error: message, providerStatus: status }, { status: 502 });
  }
  // Steel's headful live viewer is the public debug URL. sessionViewerUrl is
  // kept only for accounts that do not return debugUrl, and is verified because
  // some Steel accounts route it to their own authenticated console.
  const viewer = await usableViewerUrl(session.debugUrl || "") || await usableViewerUrl(session.sessionViewerUrl || "");
  if (!viewer) {
    if (session.id) void fetch(`https://api.steel.dev/v1/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE", headers: { "steel-api-key": apiKey } }).catch(() => undefined);
    return Response.json({ error: "Steel started a browser but did not provide a usable viewer. Please retry." }, { status: 502 });
  }
  const start = destination(target);
  const shouldRestore = Boolean(snapshot?.tabs?.length);
  if (session.id && shouldRestore) {
    try {
      await openRemotePages(session.websocketUrl || steelConnectUrl(session.id, apiKey), snapshot!.tabs);
    } catch {
      // The live view stays available even if a page blocks state restoration.
    }
  }
  return Response.json({ sessionId: session.id, profileId: session.profileId || scape.browser?.profileId, liveViewUrl: viewer, expiresAt: session.expiresAt, destination: start, sessionName: sessionName?.trim() || snapshot?.name || start.label, sourceSessionId, deferredNavigation: Boolean(session.id && !shouldRestore && start.url !== "about:blank") });
}

export async function GET(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const apiKey = process.env.STEEL_API_KEY;
  if (!apiKey) return Response.json({ error: "Remote browsing is not configured" }, { status: 503 });
  const { searchParams } = new URL(request.url); const scapeId = searchParams.get("scapeId") || undefined; const sessionId = searchParams.get("sessionId");
  const loaded = await loadScape(request, scapeId, true);
  if (loaded.error) return loaded.error;
  const quota = await rateLimit(request, "steel-traces", 10, 60 * 1000, loaded.user!.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  if (!sessionId) return Response.json({ error: "Session is required" }, { status: 400 });
  const response = await fetch(`https://api.steel.dev/v1/sessions/${encodeURIComponent(sessionId)}/agent-traces`, { headers: { "steel-api-key": apiKey }, cache: "no-store" }).catch(() => undefined);
  if (!response?.ok) return Response.json({ error: "Browser activity is temporarily unavailable." }, { status: 502 });
  const data = await response.json() as { events?: unknown[] };
  return Response.json({ events: (data.events || []).map((event, index) => cleanTrace(event, sessionId, index)) });
}

export async function PATCH(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const apiKey = process.env.STEEL_API_KEY;
  if (!apiKey) return Response.json({ error: "Remote browsing is not configured" }, { status: 503 });
  const body = await requestBody<{ scapeId?: string; sessionId?: string; target?: string; action?: "navigate" | "checkpoint"; sessionName?: string; activeUrl?: string }>(request);
  if (!body) return Response.json({ error: "Invalid browser request" }, { status: 400 });
  const { scapeId, sessionId, target, action, sessionName, activeUrl } = body;
  if ((target?.length || 0) > 1_000 || (sessionName?.length || 0) > 120 || (activeUrl?.length || 0) > 2_048) return Response.json({ error: "This browser request is too large." }, { status: 400 });
  const loaded = await loadScape(request, scapeId, true);
  if (loaded.error) return loaded.error;
  const quota = await rateLimit(request, "steel-navigation", 24, 60 * 60 * 1000, loaded.user!.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  if (!sessionId) return Response.json({ error: "Session is required" }, { status: 400 });
  if (action === "checkpoint") {
    try {
      const snapshot = await captureRemoteSession(steelConnectUrl(sessionId, apiKey), sessionId, sessionName?.trim() || "Browsing session", activeUrl);
      return Response.json({ snapshot });
    } catch {
      return Response.json({ error: "The live browser is no longer reachable." }, { status: 409 });
    }
  }
  const next = destination(target);
  try {
    await navigateRemotePage(steelConnectUrl(sessionId, apiKey), next.url, activeUrl);
    return Response.json({ navigated: true, destination: next });
  } catch {
    return Response.json({ error: "The live browser disconnected. Reconnect or restore the saved session." }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const apiKey = process.env.STEEL_API_KEY;
  if (!apiKey) return Response.json({ error: "Remote browsing is not configured" }, { status: 503 });
  const body = await requestBody<{ scapeId?: string; sessionId?: string; sessionName?: string; activeUrl?: string }>(request);
  if (!body) return Response.json({ error: "Invalid browser request" }, { status: 400 });
  const { scapeId, sessionId, sessionName, activeUrl } = body;
  if ((sessionName?.length || 0) > 120 || (activeUrl?.length || 0) > 2_048) return Response.json({ error: "This browser request is too large." }, { status: 400 });
  const loaded = await loadScape(request, scapeId, true);
  if (loaded.error) return loaded.error;
  const quota = await rateLimit(request, "steel-close", 8, 60 * 60 * 1000, loaded.user!.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  if (!sessionId) return Response.json({ error: "Session is required" }, { status: 400 });
  let snapshot: BrowserSessionSnapshot | undefined;
  try { snapshot = await captureRemoteSession(steelConnectUrl(sessionId, apiKey), sessionId, sessionName?.trim() || "Browsing session", activeUrl); } catch { snapshot = undefined; }
  const response = await fetch(`https://api.steel.dev/v1/sessions/${encodeURIComponent(sessionId)}/release`, { method: "POST", headers: steelHeaders(apiKey), body: JSON.stringify({}), cache: "no-store" }).catch(() => undefined);
  if (!response?.ok && response?.status !== 404 && response?.status !== 409) return Response.json({ error: "Could not close the browser session." }, { status: 502 });
  return Response.json({ closed: true, snapshot });
}
