import { databaseEnabled, getScapesCollection } from "@/lib/db";
import { Scape } from "@/lib/mock-data";

export const runtime = "nodejs";

export async function GET() {
  if (!databaseEnabled) return Response.json({ scapes: [], connected: false });
  const collection = await getScapesCollection();
  const scapes = await collection.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  return Response.json({ scapes, connected: true });
}

export async function POST(request: Request) {
  if (!databaseEnabled) return Response.json({ connected: false }, { status: 503 });
  const scape = await request.json() as Scape;
  const collection = await getScapesCollection();
  await collection.updateOne({ id: scape.id }, { $set: { ...scape, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  return Response.json({ connected: true });
}

export async function DELETE(request: Request) {
  if (!databaseEnabled) return Response.json({ connected: false }, { status: 503 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Scape id is required" }, { status: 400 });
  const collection = await getScapesCollection();
  await collection.deleteOne({ id });
  return Response.json({ connected: true });
}

