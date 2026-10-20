import { getSupabase, databaseEnabled } from "@/lib/db";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const quota = rateLimit(request, "login-lookup", 12, 15 * 60 * 1000);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  const username = new URL(request.url).searchParams.get("username")?.trim().toLowerCase();
  if (!username) return Response.json({ error: "Username is required" }, { status: 400 });
  const { data, error } = await getSupabase().from("profiles").select("email").eq("username", username).maybeSingle();
  if (error || !data) return Response.json({ error: "Account not found" }, { status: 404 });
  return Response.json({ email: data.email });
}
