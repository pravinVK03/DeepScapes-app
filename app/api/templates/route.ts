import { databaseEnabled, getSupabase } from "@/lib/db";
import { templates, Template } from "@/lib/mock-data";

export const runtime = "nodejs";

export async function GET() {
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
