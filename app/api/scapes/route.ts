import { databaseEnabled, getSupabase } from "@/lib/db";
import { Activity, Scape } from "@/lib/mock-data";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
const maxScapePayloadBytes = 2 * 1024 * 1024;

async function currentUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return undefined;
  const { data } = await getSupabase().auth.getUser(token);
  return data.user;
}

function canAccess(scape: Scape, userId: string, email?: string, needsEdit = false) {
  if (scape.ownerId === userId) return true;
  const collaborator = scape.collaborators?.find((person) => person.id === userId || (Boolean(email) && person.email === email));
  return Boolean(collaborator && (!needsEdit || collaborator.permission === "edit"));
}

export async function GET(request: Request) {
  if (!databaseEnabled) return Response.json({ scapes: [], connected: false });
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const quota = await rateLimit(request, "scape-read", 30, 60 * 60 * 1000, user.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  const supabase = getSupabase();
  const requestedId = new URL(request.url).searchParams.get("id");
  if (requestedId) {
    const { data: row, error } = await supabase.from("scapes").select("payload, created_at, updated_at").eq("id", requestedId).maybeSingle();
    const payload = row?.payload as Scape | undefined;
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!payload || !row || !canAccess(payload, user.id, user.email)) return Response.json({ error: "Scape not found" }, { status: 404 });
    return Response.json({ scape: { ...payload, createdAt: payload.createdAt ?? row.created_at, updatedAt: row.updated_at ?? payload.updatedAt }, connected: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
  // The dashboard needs only card metadata. Selecting JSON fields directly
  // prevents notes, activity logs, browser snapshots, and large documents from
  // leaving the database every time the home screen opens.
  const select = "id, created_at, updated_at, title:payload->>title, description:payload->>description, template:payload->>template, cover:payload->>cover, coverPosition:payload->>coverPosition, coverZoom:payload->>coverZoom, updated:payload->>updated, ownerId:payload->>ownerId, starred:payload->>starred, archived:payload->>archived, collaborators:payload->collaborators";
  const filters = [
    supabase.from("scapes").select(select).contains("payload", { ownerId: user.id }).order("updated_at", { ascending: false }),
    supabase.from("scapes").select(select).contains("payload", { collaborators: [{ id: user.id }] }).order("updated_at", { ascending: false }),
    ...(user.email ? [supabase.from("scapes").select(select).contains("payload", { collaborators: [{ email: user.email }] }).order("updated_at", { ascending: false })] : []),
  ];
  const results = await Promise.all(filters);
  const error = results.find((result) => result.error)?.error;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const rows = [...new Map(results.flatMap((result) => result.data || []).map((row) => [row.id, row])).values()]
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
  const scapes = rows
    .map((row) => {
      const value = row as Record<string, unknown>;
      return { id: String(value.id), title: String(value.title || "Untitled Scape"), description: String(value.description || ""), template: String(value.template || "Blank Scape"), cover: String(value.cover || "#1d4ed8"), coverPosition: typeof value.coverPosition === "string" ? value.coverPosition : undefined, coverZoom: Number(value.coverZoom) || undefined, updated: String(value.updated || "Recently"), createdAt: typeof value.created_at === "string" ? value.created_at : undefined, updatedAt: typeof value.updated_at === "string" ? value.updated_at : undefined, starred: value.starred === true || value.starred === "true", archived: value.archived === true || value.archived === "true", ownerId: typeof value.ownerId === "string" ? value.ownerId : undefined, collaborators: Array.isArray(value.collaborators) ? value.collaborators : [], resources: [], activity: [], summary: true } as Scape;
    })
    .filter((scape) => canAccess(scape, user.id, user.email));
  return Response.json({ scapes, connected: true }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!databaseEnabled) return Response.json({ connected: false }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const quota = await rateLimit(request, "scape-write", 45, 60 * 60 * 1000, user.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxScapePayloadBytes) return Response.json({ error: "This Scape is too large to save. Keep covers and embedded content compact." }, { status: 413 });
  const raw = await request.text().catch(() => "");
  if (new TextEncoder().encode(raw).byteLength > maxScapePayloadBytes) return Response.json({ error: "This Scape is too large to save. Keep covers and embedded content compact." }, { status: 413 });
  const received = (() => { try { return JSON.parse(raw) as Partial<Scape>; } catch { return undefined; } })();
  if (!received || typeof received.id !== "string" || !received.id.trim() || received.id.length > 200 || typeof received.title !== "string" || !Array.isArray(received.resources) || !Array.isArray(received.activity)) {
    return Response.json({ error: "A valid Scape payload is required" }, { status: 400 });
  }
  const nextScape = received as Scape;
  const { data: existing } = await getSupabase().from("scapes").select("payload, created_at").eq("id", nextScape.id).maybeSingle();
  const existingScape = existing?.payload as Scape | undefined;
  if (nextScape.cover.startsWith("data:") && nextScape.cover.length > 300_000 && existingScape?.cover !== nextScape.cover) return Response.json({ error: "Thumbnail is too large. Choose a smaller image and crop it before saving." }, { status: 413 });
  if (existingScape && !canAccess(existingScape, user.id, user.email, true)) return Response.json({ error: "Editor access is required" }, { status: 403 });
  const actor = { actorId: user.id, actorName: user.user_metadata?.username || user.email?.split("@")[0] || "Collaborator", actorEmail: user.email };
  const knownIds = new Set(existingScape?.activity.map((item) => item.id) || []);
  const newActivity = nextScape.activity.filter((item) => !knownIds.has(item.id)).map((item) => ({ ...item, ...actor, time: new Date(item.time).toString() === "Invalid Date" ? new Date().toISOString() : item.time }));
  const retainedActivity = existingScape?.activity || [];
  const activity: Activity[] = [...newActivity, ...retainedActivity].slice(0, 150);
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
  const quota = await rateLimit(request, "scape-delete", 10, 60 * 60 * 1000, user.id);
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

