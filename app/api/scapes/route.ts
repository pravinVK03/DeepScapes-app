import { databaseEnabled, getSupabase } from "@/lib/db";
import { BrowserState, Collaborator, DEFAULT_SCAPE_COVER, Resource, Scape } from "@/lib/mock-data";
import { rateLimit, rateLimited } from "@/lib/rate-limit";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
const maxScapePayloadBytes = 2 * 1024 * 1024;
const coverBucket = "deepscapes-covers";

async function currentUser(request: Request) { const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""); if (!token) return undefined; return (await getSupabase().auth.getUser(token)).data.user; }
function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function bool(value: unknown) { return value === true || value === "true"; }
function access(scape: Scape, userId: string, email?: string, edit = false) { if (scape.ownerId === userId) return true; const person = scape.collaborators?.find((item) => item.id === userId || (email && item.email === email)); return Boolean(person && (!edit || person.permission === "edit")); }

async function signedCover(path?: string, fallback = DEFAULT_SCAPE_COVER) { if (!path) return fallback; return (await getSupabase().storage.from(coverBucket).createSignedUrl(path, 60 * 60 * 24 * 7)).data?.signedUrl || fallback; }

async function loadScape(id: string): Promise<Scape | undefined> {
  const supabase = getSupabase(); const { data: base, error } = await supabase.from("scapes").select("id,owner_id,title,description,template,cover_value,cover_path,cover_position,cover_zoom,starred,archived,hidden_sections,created_at,updated_at").eq("id", id).maybeSingle();
  if (error || !base) return undefined;
  const [people, resources, activity, state, sessions, events] = await Promise.all([
    supabase.from("scape_collaborators").select("user_id,email,name,permission,pending").eq("scape_id", id), supabase.from("scape_resources").select("id,type,title,detail,occurred_at,done,starred,group_name,content,download_url,mime_type").eq("scape_id", id).order("updated_at", { ascending: false }), supabase.from("scape_activity").select("id,action,detail,occurred_at,actor_id,actor_name,actor_email").eq("scape_id", id).order("occurred_at", { ascending: false }).limit(150), supabase.from("scape_browser_state").select("profile_id,active_session_id,active_session_name,live_view_url,expires_at,last_target,last_url,updated_at").eq("scape_id", id).maybeSingle(), supabase.from("scape_browser_sessions").select("session_id,name,captured_at,active_tab,tabs,source_session_id").eq("scape_id", id), supabase.from("scape_browser_events").select("id,session_id,type,occurred_at,url,target,detail").eq("scape_id", id).order("occurred_at", { ascending: false }).limit(750),
  ]);
  const rows = <T,>(data: unknown) => (Array.isArray(data) ? data : []) as T[];
  const stateRow = state.data as Record<string, unknown> | null; const sessionRows = rows<Record<string, unknown>>(sessions.data); const eventRows = rows<Record<string, unknown>>(events.data);
  const browser: BrowserState | undefined = stateRow || sessionRows.length || eventRows.length ? { profileId: text(stateRow?.profile_id) || undefined, activeSessionId: text(stateRow?.active_session_id) || undefined, activeSessionName: text(stateRow?.active_session_name) || undefined, liveViewUrl: text(stateRow?.live_view_url) || undefined, expiresAt: text(stateRow?.expires_at) || undefined, lastTarget: text(stateRow?.last_target) || undefined, lastUrl: text(stateRow?.last_url) || undefined, updatedAt: text(stateRow?.updated_at) || undefined, sessions: Object.fromEntries(sessionRows.map((row) => [text(row.session_id), { sessionId: text(row.session_id), name: text(row.name, "Browsing session"), capturedAt: text(row.captured_at), activeTab: typeof row.active_tab === "number" ? row.active_tab : undefined, tabs: Array.isArray(row.tabs) ? row.tabs : [], sourceSessionId: text(row.source_session_id) || undefined }])), activity: eventRows.map((row) => ({ id: text(row.id), sessionId: text(row.session_id), type: text(row.type), time: text(row.occurred_at), url: text(row.url) || undefined, target: text(row.target) || undefined, detail: text(row.detail) || undefined })) } : undefined;
  return { id: text(base.id), ownerId: text(base.owner_id) || undefined, title: text(base.title, "Untitled Scape"), description: text(base.description), template: text(base.template, "Blank Scape"), cover: await signedCover(text(base.cover_path) || undefined, text(base.cover_value, "#1d4ed8")), coverPosition: text(base.cover_position) || undefined, coverZoom: Number(base.cover_zoom) || undefined, starred: bool(base.starred), archived: bool(base.archived), hiddenSections: Array.isArray(base.hidden_sections) ? base.hidden_sections : [], createdAt: text(base.created_at) || undefined, updatedAt: text(base.updated_at) || undefined, updated: "Recently", collaborators: rows<Record<string, unknown>>(people.data).map((row) => ({ id: text(row.user_id), email: text(row.email), name: text(row.name), permission: text(row.permission, "view") as Collaborator["permission"], pending: bool(row.pending) })), resources: rows<Record<string, unknown>>(resources.data).map((row) => ({ id: text(row.id), type: text(row.type) as Resource["type"], title: text(row.title), detail: text(row.detail), date: text(row.occurred_at), done: bool(row.done), starred: bool(row.starred), group: text(row.group_name) || undefined, content: text(row.content) || undefined, downloadUrl: text(row.download_url) || undefined, mimeType: text(row.mime_type) || undefined })), activity: rows<Record<string, unknown>>(activity.data).map((row) => ({ id: text(row.id), action: text(row.action), detail: text(row.detail), time: text(row.occurred_at), actorId: text(row.actor_id) || undefined, actorName: text(row.actor_name) || undefined, actorEmail: text(row.actor_email) || undefined })), browser };
}

async function dashboard(userId: string, email?: string) {
  const supabase = getSupabase(); const [{ data: owned }, { data: direct }, { data: byEmail }] = await Promise.all([supabase.from("scapes").select("id,owner_id,title,description,template,cover_value,cover_path,cover_position,cover_zoom,starred,archived,created_at,updated_at").eq("owner_id", userId).order("updated_at", { ascending: false }), supabase.from("scape_collaborators").select("scape_id,pending,permission").eq("user_id", userId), email ? supabase.from("scape_collaborators").select("scape_id,pending,permission").eq("email", email) : Promise.resolve({ data: [] as { scape_id: string; pending?: boolean; permission?: string }[] })]);
  const ids = [...new Set([...(direct || []).map((row) => row.scape_id), ...(byEmail || []).map((row) => row.scape_id)])]; const { data: shared } = ids.length ? await supabase.from("scapes").select("id,owner_id,title,description,template,cover_value,cover_path,cover_position,cover_zoom,starred,archived,created_at,updated_at").in("id", ids) : { data: [] };
  const invitations = new Map([...(direct || []), ...(byEmail || [])].map((row) => [row.scape_id, { pending: Boolean(row.pending), permission: text(row.permission, "view") as Collaborator["permission"] }]));
  const unique = [...new Map([...(owned || []), ...(shared || [])].map((row) => [row.id, row])).values()];
  return await Promise.all(unique.map(async (row) => { const invitation = invitations.get(text(row.id)); return { id: text(row.id), ownerId: text(row.owner_id) || undefined, title: text(row.title, "Untitled Scape"), description: text(row.description), template: text(row.template, "Blank Scape"), cover: await signedCover(text(row.cover_path) || undefined, text(row.cover_value, "#1d4ed8")), coverPosition: text(row.cover_position) || undefined, coverZoom: Number(row.cover_zoom) || undefined, starred: bool(row.starred), archived: bool(row.archived), createdAt: text(row.created_at) || undefined, updatedAt: text(row.updated_at) || undefined, updated: "Recently", collaborators: [], resources: [], activity: [], summary: true, pendingInvite: invitation?.pending, invitePermission: invitation?.permission } as Scape; }));
}

async function storeCover(scape: Scape, ownerId: string, previous?: { cover_value?: unknown; cover_path?: unknown } | null) {
  // Dashboard cards receive a time-bound signed Storage URL. Treat it as a
  // read-only reference to the existing thumbnail, never as replacement cover
  // data, otherwise actions such as archive/restore would overwrite a durable
  // thumbnail with an expired URL.
  if (/^https?:/i.test(scape.cover)) return { value: text(previous?.cover_value, "#1d4ed8"), path: text(previous?.cover_path) || undefined };
  if (!scape.cover.startsWith("data:image/")) return { value: scape.cover, path: undefined };
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(scape.cover); if (!match) throw new Error("Choose a JPEG, PNG, or WebP thumbnail."); const bytes = Buffer.from(match[2], "base64"); if (bytes.byteLength > 1_000_000) throw new Error("Thumbnail is too large."); const ext = match[1] === "image/png" ? "png" : match[1] === "image/webp" ? "webp" : "jpg"; const path = `${ownerId}/${scape.id}/${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}.${ext}`; const { error } = await getSupabase().storage.from(coverBucket).upload(path, bytes, { contentType: match[1], upsert: true, cacheControl: "31536000" }); if (error) throw new Error("Thumbnail could not be saved to secure storage."); return { value: "#1d4ed8", path };
}

export async function GET(request: Request) {
  if (!databaseEnabled) return Response.json({ scapes: [], connected: false });
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const quota = await rateLimit(request, "scape-read", 200, 60 * 60 * 1000, user.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const scape = await loadScape(id);
    if (!scape || !access(scape, user.id, user.email)) return Response.json({ error: "Scape not found" }, { status: 404 });
    return Response.json({ scape, connected: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
  return Response.json({ scapes: await dashboard(user.id, user.email), connected: true }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!databaseEnabled) return Response.json({ connected: false }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const quota = await rateLimit(request, "scape-write", 300, 60 * 60 * 1000, user.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  const raw = await request.text().catch(() => "");
  if (new TextEncoder().encode(raw).byteLength > maxScapePayloadBytes) return Response.json({ error: "This Scape is too large to save." }, { status: 413 });
  const received = (() => { try { return JSON.parse(raw) as Scape; } catch { return undefined; } })();
  if (!received?.id || !received.title || !Array.isArray(received.resources) || !Array.isArray(received.activity)) return Response.json({ error: "A valid Scape payload is required" }, { status: 400 });
  const existing = await loadScape(received.id);
  if (existing && !access(existing, user.id, user.email, true)) return Response.json({ error: "Editor access is required" }, { status: 403 });
  const now = new Date().toISOString();
  const ownerId = existing?.ownerId || user.id;
  const supabase = getSupabase();
  const { data: previousCover, error: previousCoverError } = await supabase.from("scapes").select("cover_value,cover_path").eq("id", received.id).maybeSingle();
  if (previousCoverError) return Response.json({ error: previousCoverError.message }, { status: 500 });

  // Summary cards intentionally omit resources and collaborators. Server-side
  // hydration protects all content if an action reaches this endpoint before
  // the client has loaded the complete Scape.
  const isSummaryUpdate = Boolean(received.summary || (existing && existing.resources.length > 0 && received.resources.length === 0));
  const incoming: Scape = isSummaryUpdate && existing
    ? {
        ...existing,
        ...received,
        collaborators: existing.collaborators,
        resources: existing.resources,
        browser: existing.browser,
        activity: [...received.activity, ...existing.activity].slice(0, 150),
      }
    : received;

  let cover;
  try { cover = await storeCover(incoming, ownerId, previousCover); } catch (cause) { return Response.json({ error: cause instanceof Error ? cause.message : "Thumbnail could not be saved." }, { status: 413 }); }
  const scape: Scape = { ...incoming, ownerId, cover: cover.value, createdAt: existing?.createdAt || incoming.createdAt || now, updatedAt: now, collaborators: ownerId === user.id ? incoming.collaborators : existing?.collaborators || [], activity: incoming.activity.slice(0, 150) };
  const { error } = await supabase.from("scapes").upsert({ id: scape.id, payload: scape, owner_id: ownerId, title: scape.title, description: scape.description, template: scape.template, cover_value: cover.value, cover_path: cover.path || null, cover_position: scape.coverPosition || null, cover_zoom: scape.coverZoom || null, starred: Boolean(scape.starred), archived: Boolean(scape.archived), hidden_sections: scape.hiddenSections || [], updated_at: now }, { onConflict: "id" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await Promise.all([supabase.from("scape_collaborators").delete().eq("scape_id", scape.id), supabase.from("scape_resources").delete().eq("scape_id", scape.id), supabase.from("scape_activity").delete().eq("scape_id", scape.id), supabase.from("scape_browser_sessions").delete().eq("scape_id", scape.id), supabase.from("scape_browser_events").delete().eq("scape_id", scape.id), supabase.from("scape_browser_state").delete().eq("scape_id", scape.id)]);
  const collaboratorEmails = [...new Set((scape.collaborators || []).map((item) => item.email?.trim().toLowerCase()).filter((email): email is string => Boolean(email)))];
  const matchedProfiles = collaboratorEmails.length ? await supabase.from("profiles").select("id,email").in("email", collaboratorEmails) : { data: [], error: null };
  if (matchedProfiles.error) return Response.json({ error: matchedProfiles.error.message }, { status: 500 });
  const profileIds = new Map((matchedProfiles.data || []).map((profile) => [text(profile.email).toLowerCase(), text(profile.id)]));
  const people = (scape.collaborators || []).map((item) => {
    const email = item.email?.trim().toLowerCase() || "";
    const suppliedUserId = item.id && !item.id.startsWith("collaborator-") ? item.id : undefined;
    const userId = profileIds.get(email) || suppliedUserId || null;
    return { scape_id: scape.id, collaborator_key: userId ? `user:${userId}` : `email:${email}`, user_id: userId, email: email || null, name: item.name || "", permission: item.permission, pending: Boolean(item.pending) };
  });
  const resources = scape.resources.map((item) => ({ id: item.id, scape_id: scape.id, type: item.type, title: item.title, detail: item.detail || "", occurred_at: /^\d{4}-/.test(item.date || "") ? item.date : now, done: Boolean(item.done), starred: Boolean(item.starred), group_name: item.group || null, content: item.content || null, download_url: item.downloadUrl || null, mime_type: item.mimeType || null, updated_at: now }));
  const activities = scape.activity.map((item) => ({ id: item.id, scape_id: scape.id, action: item.action, detail: item.detail || "", occurred_at: /^\d{4}-/.test(item.time || "") ? item.time : now, actor_id: user.id, actor_name: text(user.user_metadata?.username, user.email?.split("@")[0] || "Collaborator"), actor_email: user.email || null }));
  const browser = scape.browser;
  const sessions = Object.values(browser?.sessions || {}).map((item) => ({ session_id: item.sessionId, scape_id: scape.id, name: item.name, captured_at: item.capturedAt, active_tab: item.activeTab ?? null, tabs: item.tabs, source_session_id: item.sourceSessionId || null }));
  const events = (browser?.activity || []).map((item) => ({ id: item.id, scape_id: scape.id, session_id: item.sessionId || null, type: item.type, occurred_at: /^\d{4}-/.test(item.time || "") ? item.time : now, url: item.url || null, target: item.target || null, detail: item.detail || null }));
  const writes = await Promise.all([people.length ? supabase.from("scape_collaborators").insert(people) : Promise.resolve({ error: null }), resources.length ? supabase.from("scape_resources").insert(resources) : Promise.resolve({ error: null }), activities.length ? supabase.from("scape_activity").insert(activities) : Promise.resolve({ error: null }), sessions.length ? supabase.from("scape_browser_sessions").insert(sessions) : Promise.resolve({ error: null }), events.length ? supabase.from("scape_browser_events").insert(events) : Promise.resolve({ error: null }), browser ? supabase.from("scape_browser_state").upsert({ scape_id: scape.id, profile_id: browser.profileId || null, active_session_id: browser.activeSessionId || null, active_session_name: browser.activeSessionName || null, live_view_url: browser.liveViewUrl || null, expires_at: browser.expiresAt || null, last_target: browser.lastTarget || null, last_url: browser.lastUrl || null, updated_at: now }) : Promise.resolve({ error: null })]);
  const failure = writes.find((result) => result.error)?.error;
  if (failure) return Response.json({ error: failure.message }, { status: 500 });
  return Response.json({ connected: true, scape: await loadScape(scape.id) });
}

export async function DELETE(request: Request) {
  if (!databaseEnabled) return Response.json({ connected: false }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const quota = await rateLimit(request, "scape-delete", 60, 60 * 60 * 1000, user.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Scape id is required" }, { status: 400 });
  const supabase = getSupabase();
  const { data: scape, error: lookupError } = await supabase.from("scapes").select("id,owner_id,cover_path").eq("id", id).maybeSingle();
  if (lookupError) return Response.json({ error: "DeepScapes could not verify this Scape." }, { status: 500 });
  if (!scape) return Response.json({ error: "This Scape no longer exists." }, { status: 404 });
  if (scape.owner_id !== user.id) return Response.json({ error: "Only the owner can delete this Scape" }, { status: 403 });
  const { data: deleted, error } = await supabase.from("scapes").delete().eq("id", id).select("id").maybeSingle();
  if (error || !deleted) return Response.json({ error: error?.message || "DeepScapes could not delete this Scape." }, { status: 500 });
  if (scape.cover_path) await supabase.storage.from(coverBucket).remove([scape.cover_path]);
  return Response.json({ connected: true, id });
}
