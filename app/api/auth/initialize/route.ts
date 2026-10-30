import { databaseEnabled, getSupabase } from "@/lib/db";
import { DEFAULT_SCAPE_COVER, Scape } from "@/lib/mock-data";
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

function personalScape(userId: string, username: string, email: string): Scape {
  const now = new Date().toISOString();
  return {
    id: `scape-${userId}`,
    title: `${username}'s Scape`,
    description: "A personal space for everything you are working on.",
    template: "Blank Scape",
    cover: DEFAULT_SCAPE_COVER,
    updated: "Just created",
    createdAt: now,
    updatedAt: now,
    ownerId: userId,
    collaborators: [{ id: userId, name: username, email, permission: "edit" }],
    resources: [],
    activity: [{ id: "created", action: "Scape created", detail: "Your personal Scape", time: now }],
  };
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
  const quota = await rateLimit(request, "auth-initialize", 120, 60 * 60 * 1000, user.id);
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

  // The dashboard deliberately reads compact normalized columns rather than
  // the legacy JSON payload. Creating only `payload` made a successful signup
  // look as if its personal Scape had not been created. Use the deterministic
  // id below so retries, duplicate auth events, and interrupted onboarding all
  // converge on one Scape without overwriting a user's later edits.
  const defaultScape = personalScape(user.id, username, user.email);
  const { data: existingScape, error: scapeReadError } = await supabase
    .from("scapes")
    .select("id,owner_id")
    .eq("id", defaultScape.id)
    .maybeSingle();
  if (scapeReadError) return response({ error: scapeReadError.message }, 500);

  let createdPersonalScape = false;
  if (!existingScape) {
    const { error } = await supabase.from("scapes").insert({
      id: defaultScape.id,
      payload: defaultScape,
      owner_id: user.id,
      title: defaultScape.title,
      description: defaultScape.description,
      template: defaultScape.template,
      cover_value: defaultScape.cover,
      starred: false,
      archived: false,
      hidden_sections: [],
      created_at: defaultScape.createdAt,
      updated_at: defaultScape.updatedAt,
    });
    // A concurrent initialization request may have inserted the same stable
    // id. Read it again below and repair it just like any legacy partial row.
    if (error && error.code !== "23505") return response({ error: error.message }, 500);
    createdPersonalScape = !error;
  }

  const { data: durableScape, error: durableReadError } = await supabase
    .from("scapes")
    .select("id,owner_id")
    .eq("id", defaultScape.id)
    .maybeSingle();
  if (durableReadError || !durableScape) return response({ error: durableReadError?.message || "Could not create your personal Scape." }, 500);
  if (durableScape.owner_id && durableScape.owner_id !== user.id) return response({ error: "Your personal Scape could not be verified." }, 409);

  // Accounts created during the JSON-to-relational migration can already have
  // this row but no `owner_id`, which prevents it from appearing in the
  // dashboard. Repair only the incomplete row; never replace an existing
  // user's title, settings, or content during normal sign-in.
  if (!durableScape.owner_id) {
    const { error } = await supabase.from("scapes").update({
      owner_id: user.id,
      title: defaultScape.title,
      description: defaultScape.description,
      template: defaultScape.template,
      cover_value: defaultScape.cover,
      starred: false,
      archived: false,
      hidden_sections: [],
    }).eq("id", defaultScape.id).is("owner_id", null);
    if (error) return response({ error: error.message }, 500);
  }

  const [collaboratorResult, activityResult] = await Promise.all([
    supabase.from("scape_collaborators").upsert({
      scape_id: defaultScape.id,
      collaborator_key: `user:${user.id}`,
      user_id: user.id,
      email: user.email,
      name: username,
      permission: "edit",
      pending: false,
    }, { onConflict: "scape_id,collaborator_key" }),
    supabase.from("scape_activity").upsert({
      scape_id: defaultScape.id,
      id: "created",
      action: "Scape created",
      detail: "Your personal Scape",
      occurred_at: defaultScape.createdAt,
      actor_id: user.id,
      actor_name: username,
      actor_email: user.email,
    }, { onConflict: "scape_id,id", ignoreDuplicates: true }),
  ]);
  if (collaboratorResult.error || activityResult.error) return response({ error: collaboratorResult.error?.message || activityResult.error?.message || "Could not finish setting up your personal Scape." }, 500);
  return response({ username, scapeReady: true, createdPersonalScape });
}
