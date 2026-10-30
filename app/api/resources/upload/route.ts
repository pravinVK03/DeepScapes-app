import { databaseEnabled, getSupabase } from "@/lib/db";
import { Scape } from "@/lib/mock-data";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bucket = "deepscapes-resources";

async function currentUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return undefined;
  const { data } = await getSupabase().auth.getUser(token);
  return data.user;
}

function canEdit(scape: Scape, userId: string, email?: string) {
  if (scape.ownerId === userId) return true;
  return scape.collaborators?.some((person) => (person.id === userId || person.email === email) && person.permission === "edit") ?? false;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-180) || "upload";
}

async function getEditableScape(request: Request, scapeId: string) {
  if (!databaseEnabled) return { error: "Database is not configured", status: 503 } as const;
  const user = await currentUser(request);
  if (!user) return { error: "Sign in required", status: 401 } as const;
  if (!scapeId) return { error: "A Scape is required", status: 400 } as const;
  const supabase = getSupabase();
  const [{ data: row, error }, { data: collabs }] = await Promise.all([
    supabase.from("scapes").select("owner_id, payload").eq("id", scapeId).maybeSingle(),
    supabase.from("scape_collaborators").select("user_id, email, permission").eq("scape_id", scapeId),
  ]);
  const scape = row?.payload as Scape | undefined;
  const ownerId = row?.owner_id || scape?.ownerId;
  const isOwner = ownerId === user.id;
  const isCollabEditor = (collabs || []).some(
    (c) => (c.user_id === user.id || (user.email && c.email?.toLowerCase() === user.email.toLowerCase())) && c.permission === "edit"
  );
  if (error || (!row && !scape)) return { error: "Scape not found", status: 404 } as const;
  if (!isOwner && !isCollabEditor && (!scape || !canEdit(scape, user.id, user.email))) {
    return { error: "Editor access is required", status: 403 } as const;
  }
  return { supabase, user, scape: { ...(scape || {}), id: scapeId, ownerId } as Scape } as const;
}

let bucketEnsured = false;

async function ensureBucket() {
  if (bucketEnsured) return undefined;
  const supabase = getSupabase();
  const { error: existingError } = await supabase.storage.getBucket(bucket);
  if (!existingError) {
    bucketEnsured = true;
    return undefined;
  }
  const { error: createError } = await supabase.storage.createBucket(bucket, { public: false, fileSizeLimit: 20 * 1024 * 1024 });
  if (createError && !/already exists/i.test(createError.message)) return createError.message;
  bucketEnsured = true;
  return undefined;
}

export async function POST(request: Request) {
  const isJson = request.headers.get("content-type")?.includes("application/json");
  if (isJson) {
    const body = await request.json().catch(() => undefined) as { action?: "prepare" | "complete"; scapeId?: string; fileName?: string; mimeType?: string; path?: string; size?: number } | undefined;
    if (!body) return Response.json({ error: "Invalid upload request" }, { status: 400 });
    const access = await getEditableScape(request, body.scapeId ?? "");
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const quota = await rateLimit(request, body.action === "prepare" ? "upload-prepare" : "upload-complete", body.action === "prepare" ? 250 : 500, 60 * 60 * 1000, access.user.id);
    if (!quota.allowed) return rateLimited(quota.retryAfter);
    const bucketError = await ensureBucket();
    if (bucketError) return Response.json({ error: `Storage setup failed: ${bucketError}` }, { status: 500 });
    if (body.action === "prepare") {
      if (!Number.isSafeInteger(body.size) || body.size! <= 0 || body.size! > 20 * 1024 * 1024) return Response.json({ error: "Files must be smaller than 20 MB." }, { status: 413 });
      const path = `${access.user.id}/${access.scape.id}/${crypto.randomUUID()}-${safeFileName(body.fileName ?? "upload")}`;
      const { data, error } = await access.supabase.storage.from(bucket).createSignedUploadUrl(path);
      if (error || !data?.token) return Response.json({ error: error?.message ?? "Could not prepare the upload" }, { status: 500 });
      return Response.json({ bucket, path, token: data.token, mimeType: body.mimeType || "application/octet-stream" });
    }
    if (body.action === "complete" && body.path?.startsWith(`${access.user.id}/${access.scape.id}/`)) {
      const [preview, download] = await Promise.all([
        access.supabase.storage.from(bucket).createSignedUrl(body.path, 60 * 60 * 24 * 365),
        access.supabase.storage.from(bucket).createSignedUrl(body.path, 60 * 60 * 24 * 365, { download: body.fileName || true }),
      ]);
      if (preview.error || !preview.data?.signedUrl || download.error || !download.data?.signedUrl) return Response.json({ error: preview.error?.message ?? download.error?.message ?? "Could not create a file link" }, { status: 500 });
      return Response.json({ url: preview.data.signedUrl, downloadUrl: download.data.signedUrl });
    }
    return Response.json({ error: "Invalid upload request" }, { status: 400 });
  }

  const form = await request.formData();
  const scapeId = String(form.get("scapeId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "A file is required" }, { status: 400 });
  const access = await getEditableScape(request, scapeId);
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
  const quota = await rateLimit(request, "upload-legacy", 60, 60 * 60 * 1000, access.user.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  if (file.size > 20 * 1024 * 1024) return Response.json({ error: "Files must be smaller than 20 MB." }, { status: 413 });
  const bucketError = await ensureBucket();
  if (bucketError) return Response.json({ error: `Storage setup failed: ${bucketError}` }, { status: 500 });
  const path = `${access.user.id}/${access.scape.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await access.supabase.storage.from(bucket).upload(path, await file.arrayBuffer(), { contentType: file.type || "application/octet-stream" });
  if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });
  const [signed, download] = await Promise.all([
    access.supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365),
    access.supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365, { download: file.name }),
  ]);
  if (signed.error || !signed.data?.signedUrl || download.error || !download.data?.signedUrl) return Response.json({ error: signed.error?.message ?? download.error?.message ?? "Could not create a file link" }, { status: 500 });
  return Response.json({ url: signed.data.signedUrl, downloadUrl: download.data.signedUrl, path, name: file.name, mimeType: file.type || "application/octet-stream" });
}
