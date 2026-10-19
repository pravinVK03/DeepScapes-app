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
    const timeout = setTimeout(() => reject(new Error("CDP connection timed out")), 7_000);
    socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP connection failed")); }, { once: true });
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Navigation timed out")), 7_000);
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

function steelConnectUrl(value: string, apiKey: string) {
  const url = new URL(value);
  url.searchParams.set("apiKey", apiKey);
  return url.toString();
}

type SteelSession = { id?: string; debugUrl?: string; sessionViewerUrl?: string; websocketUrl?: string; expiresAt?: string };

export async function POST(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const apiKey = process.env.STEEL_API_KEY;
  if (!apiKey) {
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

  const response = await fetch("https://api.steel.dev/v1/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "steel-api-key": apiKey },
    body: JSON.stringify({ timeout: 1_800_000, inactivityTimeout: 300_000, dimensions: { width: 1440, height: 960 }, debugConfig: { interactive: true } }),
    cache: "no-store",
  }).catch(() => undefined);
  let session: SteelSession | undefined;
  try { session = response ? await response.json() as SteelSession : undefined; } catch { session = undefined; }
  if (!response?.ok || !session) return Response.json({ error: "Steel could not start a remote browser. Check the Steel account and try again." }, { status: 502 });
  const viewer = session.debugUrl ?? session.sessionViewerUrl;
  if (!viewer) return Response.json({ error: "Steel did not provide a browser viewer." }, { status: 502 });
  const start = destination(target);
  if (session.websocketUrl) {
    try {
      await openRemotePage(steelConnectUrl(session.websocketUrl, apiKey), start.url);
    } catch {
      // The embedded Steel controls remain available if the initial navigation is delayed.
    }
  }
  return Response.json({ sessionId: session.id, liveViewUrl: interactiveViewerUrl(viewer), expiresAt: session.expiresAt, destination: start });
}
