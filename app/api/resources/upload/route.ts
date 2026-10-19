import { databaseEnabled, getSupabase } from "@/lib/db";
import { Scape } from "@/lib/mock-data";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const form = await request.formData();
  const scapeId = String(form.get("scapeId") ?? "");
  const file = form.get("file");
  if (!scapeId || !(file instanceof File)) return Response.json({ error: "A Scape and file are required" }, { status: 400 });

  const supabase = getSupabase();
  const { data: row } = await supabase.from("scapes").select("payload").eq("id", scapeId).maybeSingle();
  const scape = row?.payload as Scape | undefined;
  if (!scape || !canEdit(scape, user.id, user.email)) return Response.json({ error: "Editor access is required" }, { status: 403 });

  const bucket = "deepscapes-resources";
  await supabase.storage.createBucket(bucket, { public: false }).catch(() => undefined);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${user.id}/${scapeId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, await file.arrayBuffer(), { contentType: file.type || "application/octet-stream" });
  if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });
  const { data: signed, error: signError } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signError || !signed?.signedUrl) return Response.json({ error: signError?.message ?? "Could not create a file link" }, { status: 500 });
  return Response.json({ url: signed.signedUrl, path, name: file.name, mimeType: file.type || "application/octet-stream" });
}
