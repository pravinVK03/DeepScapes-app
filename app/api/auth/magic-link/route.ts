import { databaseEnabled, getSupabase } from "@/lib/db";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const quota = await rateLimit(request, "magic-link", 5, 15 * 60 * 1000);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  const body = await request.json().catch(() => ({})) as { email?: string; destination?: string };
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const origin = new URL(request.url).origin;
  const destination = body.destination?.startsWith("/") ? body.destination : "/scapes";
  const supabase = getSupabase();
  const { data: existing, error: lookupError } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
  if (lookupError) return Response.json({ error: lookupError.message }, { status: 500 });
  const redirect = new URL(existing ? destination : "/signup", origin);
  if (!existing && destination !== "/scapes") redirect.searchParams.set("next", destination);
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: redirect.toString() } });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ sent: true }, { headers: { "Cache-Control": "no-store" } });
}
