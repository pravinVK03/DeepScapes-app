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

export async function POST(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Database is not configured" }, { status: 503 });
  if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
    return Response.json({ error: "Remote browsing is not configured" }, { status: 503 });
  }

  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const { scapeId } = await request.json() as { scapeId?: string };
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

  const session = await browserbase.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    api_timeout: 3600,
    browserSettings: { context: { id: contextId, persist: true }, viewport: { width: 1440, height: 960 } },
    userMetadata: { scapeId: scape.id, userId: user.id },
  });
  const live = await browserbase.sessions.debug(session.id, { expiresIn: 3600 });
  return Response.json({ sessionId: session.id, liveViewUrl: live.debuggerFullscreenUrl, expiresAt: session.expiresAt });
}
