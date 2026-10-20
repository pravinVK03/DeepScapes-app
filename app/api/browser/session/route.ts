import { databaseEnabled, getSupabase } from "@/lib/db";
import { BrowserActivity, Scape } from "@/lib/mock-data";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

async function currentUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return undefined;
  const { data } = await getSupabase().auth.getUser(token);
  return data.user;
}

function canAccess(scape: Scape, userId: string, email?: string) {
  if (scape.ownerId === userId) return true;
  return scape.collaborators?.some((person) => person.id === userId || person.email === email) ?? false;
}

function destination(value?: string) {
  const input = value?.trim();
  if (!input) return { url: "https://www.google.com", label: "Google" };
  if (/^https?:\/\//i.test(input)) return { url: input, label: input };
  if (input.includes(".") && !/\s/.test(input)) return { url: "https://" + input, label: input };
  return { url: "https://www.google.com/search?q=" + encodeURIComponent(input), label: input };
}

async function openRemotePage(connectUrl: string, url: string) {
  const socket = new WebSocket(connectUrl);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("CDP connection timed out")), 3_500);
    socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP connection failed")); }, { once: true });
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Navigation timed out")), 3_500);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; error?: unknown };
      if (message.id !== 1) return;
      clearTimeout(timeout);
      if (message.error) reject(new Error("Remote browser rejected navigation"));
      else resolve();
    });
    socket.send(JSON.stringify({ id: 1, method: "Target.createTarget", params: { url } }));
  });
  socket.close();
}

function interactiveViewerUrl(value: string) {
  const url = new URL(value);
  url.searchParams.set("interactive", "true");
  url.searchParams.set("showControls", "true");
  return url.toString();
}

function steelConnectUrl(sessionId: string, apiKey: string) {
  const url = new URL("wss://connect.steel.dev");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("sessionId", sessionId);
  return url.toString();
}

type SteelSession = { id?: string; debugUrl?: string; sessionViewerUrl?: string; websocketUrl?: string; expiresAt?: string; profileId?: string };

function steelHeaders(apiKey: string) { return { "Content-Type": "application/json", "steel-api-key": apiKey }; }

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

function cleanTrace(event: unknown, sessionId: string, index: number): BrowserActivity {
  const source = event as { id?: string; type?: string; timestamp?: string; page?: { url?: string }; target?: unknown; value?: unknown; input?: unknown };
  const type = String(source.type || "browser activity").slice(0, 80);
  // Never retain typed values: traces can include credentials and form entries.
  const target = type === "input" ? "Form field" : safeTraceText(source.target)?.slice(0, 180);
  return { id: String(source.id || `${sessionId}-${source.timestamp || Date.now()}-${index}`), type, time: source.timestamp || new Date().toISOString(), url: source.page?.url?.slice(0, 2048), target, detail: type === "input" ? "Text entered (redacted)" : target, sessionId };
}

async function loadScape(request: Request, scapeId?: string) {
  const user = await currentUser(request);
  if (!user) return { error: Response.json({ error: "Sign in required" }, { status: 401 }) };
  if (!scapeId) return { error: Response.json({ error: "Scape is required" }, { status: 400 }) };
  const supabase = getSupabase();
  const { data: row, error: readError } = await supabase.from("scapes").select("payload").eq("id", scapeId).maybeSingle();
  const scape = row?.payload as Scape | undefined;
  if (readError || !scape) return { error: Response.json({ error: "Scape not found" }, { status: 404 }) };
  if (!canAccess(scape, user.id, user.email)) return { error: Response.json({ error: "You do not have access to this Scape" }, { status: 403 }) };
  return { scape, user };
}

export async function POST(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const apiKey = process.env.STEEL_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Remote browsing is not configured" }, { status: 503 });
  }

  const { scapeId, target } = await request.json() as { scapeId?: string; target?: string };
  const loaded = await loadScape(request, scapeId);
  if (loaded.error) return loaded.error;
  const scape = loaded.scape!;
  const quota = rateLimit(request, "steel-session", 4, 60 * 60 * 1000, loaded.user!.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  const dailyQuota = rateLimit(request, "steel-session-daily", 20, 24 * 60 * 60 * 1000, loaded.user!.id);
  if (!dailyQuota.allowed) return rateLimited(dailyQuota.retryAfter);

  const viewerConfig = { debugConfig: { interactive: true, systemCursor: false }, inactivityTimeout: 120_000 };
  const sessionRequest = scape.browser?.profileId
    ? { ...viewerConfig, profileId: scape.browser.profileId, persistProfile: true }
    : { ...viewerConfig, persistProfile: true };
  let response = await fetch("https://api.steel.dev/v1/sessions", {
    method: "POST",
    headers: steelHeaders(apiKey),
    body: JSON.stringify(sessionRequest),
    cache: "no-store",
  }).catch(() => undefined);
  // A profile can be unavailable on an entry plan. Browsing must still work.
  if (response && !response.ok && scape.browser?.profileId) response = await fetch("https://api.steel.dev/v1/sessions", { method: "POST", headers: steelHeaders(apiKey), body: JSON.stringify(viewerConfig), cache: "no-store" }).catch(() => undefined);
  let session: SteelSession | undefined;
  try { session = response ? await response.json() as SteelSession : undefined; } catch { session = undefined; }
  if (!response?.ok || !session) {
    const status = response?.status;
    const message = status === 401 || status === 403
      ? "Steel rejected the configured API key. Create or update STEEL_API_KEY in Vercel, then retry."
      : status === 402 || status === 429
        ? "Steel account usage is unavailable. Check the Steel account credits or rate limit, then retry."
        : "Steel could not start a remote browser. Please retry shortly.";
    return Response.json({ error: message, providerStatus: status }, { status: 502 });
  }
  const viewer = session.debugUrl ?? session.sessionViewerUrl;
  if (!viewer) return Response.json({ error: "Steel did not provide a browser viewer." }, { status: 502 });
  const start = destination(target);
  if (session.id) {
    try {
      await openRemotePage(session.websocketUrl || steelConnectUrl(session.id, apiKey), start.url);
    } catch {
      // The embedded Steel controls remain available if the initial navigation is delayed.
    }
  }
  return Response.json({ sessionId: session.id, profileId: session.profileId || scape.browser?.profileId, liveViewUrl: interactiveViewerUrl(viewer), expiresAt: session.expiresAt, destination: start });
}

export async function GET(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const apiKey = process.env.STEEL_API_KEY;
  if (!apiKey) return Response.json({ error: "Remote browsing is not configured" }, { status: 503 });
  const { searchParams } = new URL(request.url); const scapeId = searchParams.get("scapeId") || undefined; const sessionId = searchParams.get("sessionId");
  const loaded = await loadScape(request, scapeId);
  if (loaded.error) return loaded.error;
  const quota = rateLimit(request, "steel-traces", 20, 60 * 1000, loaded.user!.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  if (!sessionId) return Response.json({ error: "Session is required" }, { status: 400 });
  const response = await fetch(`https://api.steel.dev/v1/sessions/${encodeURIComponent(sessionId)}/agent-traces`, { headers: { "steel-api-key": apiKey }, cache: "no-store" }).catch(() => undefined);
  if (!response?.ok) return Response.json({ error: "Browser activity is temporarily unavailable." }, { status: 502 });
  const data = await response.json() as { events?: unknown[] };
  return Response.json({ events: (data.events || []).map((event, index) => cleanTrace(event, sessionId, index)) });
}

export async function DELETE(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const apiKey = process.env.STEEL_API_KEY;
  if (!apiKey) return Response.json({ error: "Remote browsing is not configured" }, { status: 503 });
  const { scapeId, sessionId } = await request.json() as { scapeId?: string; sessionId?: string };
  const loaded = await loadScape(request, scapeId);
  if (loaded.error) return loaded.error;
  const quota = rateLimit(request, "steel-close", 12, 60 * 60 * 1000, loaded.user!.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  if (!sessionId) return Response.json({ error: "Session is required" }, { status: 400 });
  const response = await fetch(`https://api.steel.dev/v1/sessions/${encodeURIComponent(sessionId)}/release`, { method: "POST", headers: steelHeaders(apiKey), body: JSON.stringify({}), cache: "no-store" }).catch(() => undefined);
  if (!response?.ok && response?.status !== 404 && response?.status !== 409) return Response.json({ error: "Could not close the browser session." }, { status: 502 });
  return Response.json({ closed: true });
}
