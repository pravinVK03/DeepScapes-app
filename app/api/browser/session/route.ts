import Browserbase from "@browserbasehq/sdk";
import { databaseEnabled, getSupabase } from "@/lib/db";
import { Scape } from "@/lib/mock-data";

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
    const timeout = setTimeout(() => reject(new Error("CDP connection timed out")), 4_000);
    socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP connection failed")); }, { once: true });
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Navigation timed out")), 4_000);
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

export async function POST(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Database is not configured" }, { status: 503 });
  if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
    return Response.json({ error: "Remote browsing is not configured" }, { status: 503 });
  }

  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const { scapeId, target } = await request.json() as { scapeId?: string; target?: string };
  if (!scapeId) return Response.json({ error: "Scape is required" }, { status: 400 });

  const supabase = getSupabase();
  const { data: row, error: readError } = await supabase.from("scapes").select("payload").eq("id", scapeId).maybeSingle();
  const scape = row?.payload as Scape | undefined;
  if (readError || !scape) return Response.json({ error: "Scape not found" }, { status: 404 });
  if (!canAccess(scape, user.id, user.email)) return Response.json({ error: "You do not have access to this Scape" }, { status: 403 });

  const browserbase = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
  let contextId = scape.browserContexts?.[user.id];
  if (!contextId) {
    const context = await browserbase.contexts.create({
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      name: `deepscapes-${scape.id}-${user.id}`.slice(0, 120),
    });
    contextId = context.id;
    const updated = { ...scape, browserContexts: { ...scape.browserContexts, [user.id]: contextId } };
    const { error: writeError } = await supabase.from("scapes").upsert({ id: scape.id, payload: updated, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (writeError) return Response.json({ error: "Could not prepare your private browser" }, { status: 500 });
  }

  let session;
  try {
    session = await browserbase.sessions.create({
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      api_timeout: 3600,
      browserSettings: { context: { id: contextId, persist: true }, viewport: { width: 1440, height: 960 } },
      userMetadata: { scapeId: scape.id, userId: user.id },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The remote browser service is unavailable.";
    if (detail.includes("browser minutes limit reached")) {
      return Response.json({ error: "Remote browsing is unavailable because the Browserbase free browser-minute limit has been reached. Add browser time or migrate this panel to Steel." }, { status: 402 });
    }
    return Response.json({ error: "The remote browser service could not start. Please try again shortly." }, { status: 502 });
  }
  const start = destination(target);
  try {
    await openRemotePage(session.connectUrl, start.url);
  } catch {
    // The live view remains usable even if Browserbase is slow to accept navigation.
  }
  const live = await browserbase.sessions.debug(session.id, { expiresIn: 3600 });
  return Response.json({ sessionId: session.id, liveViewUrl: live.debuggerFullscreenUrl, expiresAt: session.expiresAt, destination: start });
}
