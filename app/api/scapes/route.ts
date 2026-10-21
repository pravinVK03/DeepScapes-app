import { databaseEnabled, getSupabase } from "@/lib/db";
import { Activity, Scape } from "@/lib/mock-data";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

async function currentUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return undefined;
  const { data } = await getSupabase().auth.getUser(token);
  return data.user;
}

function canAccess(scape: Scape, userId: string, email?: string, needsEdit = false) {
  if (scape.ownerId === userId) return true;
  const collaborator = scape.collaborators?.find((person) => person.id === userId || person.email === email);
  return Boolean(collaborator && (!needsEdit || collaborator.permission === "edit"));
}

export async function GET(request: Request) {
  if (!databaseEnabled) return Response.json({ scapes: [], connected: false });
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const quota = rateLimit(request, "scape-read", 120, 60 * 60 * 1000, user.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  const { data, error } = await getSupabase()
    .from("scapes")
    .select("payload, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const scapes = data
    .map((row) => ({ ...(row.payload as Scape), createdAt: (row.payload as Scape).createdAt ?? row.created_at, updatedAt: row.updated_at ?? (row.payload as Scape).updatedAt }))
    .filter((scape) => canAccess(scape, user.id, user.email));
  return Response.json({ scapes, connected: true });
}

export async function POST(request: Request) {
  if (!databaseEnabled) return Response.json({ connected: false }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const quota = rateLimit(request, "scape-write", 90, 60 * 60 * 1000, user.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  const received = await request.json().catch(() => undefined) as Partial<Scape> | undefined;
  if (!received || typeof received.id !== "string" || !received.id.trim() || received.id.length > 200 || typeof received.title !== "string" || !Array.isArray(received.resources) || !Array.isArray(received.activity)) {
    return Response.json({ error: "A valid Scape payload is required" }, { status: 400 });
  }
  const nextScape = received as Scape;
  const { data: existing } = await getSupabase().from("scapes").select("payload, created_at").eq("id", nextScape.id).maybeSingle();
  const existingScape = existing?.payload as Scape | undefined;
  if (existingScape && !canAccess(existingScape, user.id, user.email, true)) return Response.json({ error: "Editor access is required" }, { status: 403 });
  const actor = { actorId: user.id, actorName: user.user_metadata?.username || user.email?.split("@")[0] || "Collaborator", actorEmail: user.email };
  const knownIds = new Set(existingScape?.activity.map((item) => item.id) || []);
  const newActivity = nextScape.activity.filter((item) => !knownIds.has(item.id)).map((item) => ({ ...item, ...actor, time: new Date(item.time).toString() === "Invalid Date" ? new Date().toISOString() : item.time }));
  const retainedActivity = existingScape?.activity || [];
  const activity: Activity[] = [...newActivity, ...retainedActivity].slice(0, 1000);
  const now = new Date().toISOString();
  const scape: Scape = existingScape
    ? { ...nextScape, ownerId: existingScape.ownerId, createdAt: existingScape.createdAt ?? existing?.created_at, updatedAt: now, collaborators: existingScape.ownerId === user.id ? nextScape.collaborators : existingScape.collaborators, activity }
    : { ...nextScape, activity: nextScape.activity.map((item) => ({ ...item, ...actor })), createdAt: nextScape.createdAt ?? now, updatedAt: now, ownerId: user.id, collaborators: nextScape.collaborators?.length ? nextScape.collaborators : [{ id: user.id, name: user.email?.split("@")[0] ?? "Owner", email: user.email ?? "", permission: "edit" }] };
  const { error } = await getSupabase().from("scapes").upsert(
    { id: scape.id, payload: scape, updated_at: now },
    { onConflict: "id" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ connected: true });
}

export async function DELETE(request: Request) {
  if (!databaseEnabled) return Response.json({ connected: false }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const quota = rateLimit(request, "scape-delete", 10, 60 * 60 * 1000, user.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Scape id is required" }, { status: 400 });
  const { data: existing } = await getSupabase().from("scapes").select("payload").eq("id", id).maybeSingle();
  const scape = existing?.payload as Scape | undefined;
  if (!scape || scape.ownerId !== user.id) return Response.json({ error: "Only the owner can delete this Scape" }, { status: 403 });
  const { error } = await getSupabase().from("scapes").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ connected: true });
}

