import { databaseEnabled, getSupabase } from "@/lib/db";
import { templates, Template } from "@/lib/mock-data";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const quota = rateLimit(request, "templates", 30, 60 * 60 * 1000);
  if (!quota.allowed) return rateLimited(quota.retryAfter);
  if (!databaseEnabled) return Response.json({ templates, connected: false });
  const supabase = getSupabase();
  const { error: seedError } = await supabase.from("templates").upsert(
    templates.map((template) => ({ name: template.name, payload: template })),
    { onConflict: "name", ignoreDuplicates: true },
  );
  if (seedError) return Response.json({ error: seedError.message }, { status: 500 });
  const { data, error } = await supabase.from("templates").select("payload").order("name");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ templates: data.map((row) => row.payload as Template), connected: true });
}
