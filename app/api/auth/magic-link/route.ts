import { databaseEnabled, getSupabase } from "@/lib/db";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const quota = await rateLimit(request, "magic-link", 20, 15 * 60 * 1000);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  const body = await request.json().catch(() => ({})) as { email?: string; destination?: string };
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const origin = new URL(request.url).origin;
  const destination = body.destination?.startsWith("/") ? body.destination : "/scapes";
  const supabase = getSupabase();
  // Always pass email-link users through signup. Completed accounts redirect
  // straight to their destination there, while pending accounts return to the
  // profile step even after a provisional profile row has been created.
  const redirect = new URL("/signup", origin);
  if (destination !== "/scapes") redirect.searchParams.set("next", destination);
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: redirect.toString() } });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ sent: true }, { headers: { "Cache-Control": "no-store" } });
}
