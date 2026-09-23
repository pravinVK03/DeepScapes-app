import { databaseEnabled, getTemplatesCollection } from "@/lib/db";
import { templates } from "@/lib/mock-data";

export const runtime = "nodejs";

export async function GET() {
  if (!databaseEnabled) return Response.json({ templates, connected: false });
  const collection = await getTemplatesCollection();
  await Promise.all(templates.map((template) => collection.updateOne(
    { name: template.name },
    { $set: { ...template, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  )));
  const savedTemplates = await collection.find({}, { projection: { _id: 0 } }).sort({ name: 1 }).toArray();
  return Response.json({ templates: savedTemplates, connected: true });
}
