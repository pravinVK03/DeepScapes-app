import { databaseEnabled, getSupabase } from "@/lib/db";
import { Scape } from "@/lib/mock-data";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

function usernameFor(email: string, metadata: Record<string, unknown>) {
  const value = typeof metadata.username === "string" ? metadata.username : email.split("@")[0];
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "my-scape";
}

export async function POST(request: Request) {
  if (!databaseEnabled) return Response.json({ connected: false }, { status: 503 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in required" }, { status: 401 });
  const supabase = getSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData.user;
  if (userError || !user?.email) return Response.json({ error: "Session is invalid" }, { status: 401 });
  const quota = rateLimit(request, "auth-initialize", 12, 60 * 60 * 1000, user.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  let username = usernameFor(user.email, user.user_metadata as Record<string, unknown>);
  const { data: nameOwner } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
  if (nameOwner && nameOwner.id !== user.id) username = `${username.slice(0, 24)}-${user.id.slice(0, 6)}`;
  const { error: profileError } = await supabase.from("profiles").upsert({ id: user.id, username, email: user.email }, { onConflict: "id" });
  if (profileError) return Response.json({ error: profileError.message }, { status: 409 });

  const { data: existing, error: scapeError } = await supabase.from("scapes").select("id").contains("payload", { ownerId: user.id }).limit(1);
  if (scapeError) return Response.json({ error: scapeError.message }, { status: 500 });
  if (!existing.length) {
    const scape: Scape = {
      id: `scape-${user.id}`, title: `${username}'s Scape`, description: "A personal space for everything you are working on.", template: "Blank Scape", cover: "#315443", updated: "Just created", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ownerId: user.id,
      collaborators: [{ id: user.id, name: username, email: user.email, permission: "edit" }], resources: [],
      activity: [{ id: "created", action: "Scape created", detail: "Your personal Scape", time: "Just now" }],
    };
    const { error } = await supabase.from("scapes").insert({ id: scape.id, payload: scape });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ username });
}
