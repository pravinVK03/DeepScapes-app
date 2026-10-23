import { databaseEnabled, getSupabase } from "@/lib/db";
import { Scape } from "@/lib/mock-data";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

function usernameFor(email: string, metadata: Record<string, unknown>) {
  const value = typeof metadata.username === "string" ? metadata.username : email.split("@")[0];
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "my-scape";
}

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!databaseEnabled) return response({ connected: false }, 503);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return response({ error: "Sign in required" }, 401);
  const supabase = getSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData.user;
  if (userError || !user?.email) return response({ error: "Session is invalid" }, 401);
  if (!user.email_confirmed_at) return response({ error: "Confirm your email before continuing" }, 403);
  const quota = rateLimit(request, "auth-initialize", 12, 60 * 60 * 1000, user.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  const { data: existingProfile, error: profileReadError } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
  if (profileReadError) return response({ error: profileReadError.message }, 500);
  let username = existingProfile?.username || usernameFor(user.email, user.user_metadata as Record<string, unknown>);
  if (!existingProfile) {
    const candidates = [username, `${username.slice(0, 24)}-${user.id.slice(0, 6)}`, `${username.slice(0, 21)}-${user.id.slice(0, 9)}`];
    let profileCreated = false;
    for (const candidate of candidates) {
      const { error } = await supabase.from("profiles").insert({ id: user.id, username: candidate, email: user.email });
      if (!error) { username = candidate; profileCreated = true; break; }
      if (error.code !== "23505") return response({ error: error.message }, 500);
      const { data: retryProfile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
      if (retryProfile) { username = retryProfile.username; profileCreated = true; break; }
    }
    if (!profileCreated) return response({ error: "Could not reserve a profile name. Please try again." }, 409);
  }

  const { data: existing, error: scapeError } = await supabase.from("scapes").select("id").contains("payload", { ownerId: user.id }).limit(1);
  if (scapeError) return response({ error: scapeError.message }, 500);
  if (!existing.length) {
    const scape: Scape = {
      id: `scape-${user.id}`, title: `${username}'s Scape`, description: "A personal space for everything you are working on.", template: "Blank Scape", cover: "#1d4ed8", updated: "Just created", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ownerId: user.id,
      collaborators: [{ id: user.id, name: username, email: user.email, permission: "edit" }], resources: [],
      activity: [{ id: "created", action: "Scape created", detail: "Your personal Scape", time: "Just now" }],
    };
    const { error } = await supabase.from("scapes").upsert({ id: scape.id, payload: scape }, { onConflict: "id", ignoreDuplicates: true });
    if (error) return response({ error: error.message }, 500);
  }
  return response({ username });
}
