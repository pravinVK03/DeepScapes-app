import { databaseEnabled, getSupabase } from "@/lib/db";
import { Scape } from "@/lib/mock-data";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

function usernameFor(email: string, metadata: Record<string, unknown>) {
  const value = typeof metadata.username === "string" ? metadata.username : email.split("@")[0];
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "my-scape";
}

function usernameCandidates(username: string, userId: string) {
  const safe = username.slice(0, 32) || "member";
  return [safe, `${safe.slice(0, 24)}-${userId.slice(0, 6)}`, `${safe.slice(0, 21)}-${userId.slice(0, 9)}`];
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
  const quota = await rateLimit(request, "auth-initialize", 6, 60 * 60 * 1000, user.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  const metadata = user.user_metadata as Record<string, unknown>;
  const { data: existingProfile, error: profileReadError } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
  if (profileReadError) return response({ error: profileReadError.message }, 500);
  const requestedUsername = usernameFor(user.email, metadata);
  const profileComplete = metadata.profile_completed === true || typeof metadata.username === "string" || user.app_metadata.provider !== "email";
  let username = existingProfile?.username || requestedUsername;
  if (!existingProfile) {
    const candidates = usernameCandidates(username, user.id);
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

  // Every confirmed account receives a durable profile record. While the email
  // signup form is still open, this uses a safe temporary username; after the
  // user chooses one, the same idempotent route promotes it before redirecting.
  if (profileComplete && username !== requestedUsername) {
    const { error } = await supabase.from("profiles").update({ username: requestedUsername, email: user.email }).eq("id", user.id);
    if (error?.code === "23505") return response({ error: "That username is already in use. Choose another one." }, 409);
    if (error) return response({ error: error.message }, 500);
    username = requestedUsername;
  }

  // Passwordless users may leave the profile form and return later. Their
  // profile is retained, but a personal Scape is created only once setup is
  // complete. OAuth providers are already identity-verified and continue.
  if (!profileComplete) return response({ profilePending: true, username });

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
