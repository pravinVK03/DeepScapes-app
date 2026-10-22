import { databaseEnabled, getSupabase } from "@/lib/db";
import { sendFeedbackCopy, type FeedbackEmail } from "@/lib/feedback-email";
import { rateLimit, rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bucket = "deepscapes-feedback";
const categories = new Set(["idea", "issue", "experience", "other"]);
let bucketReady: Promise<string | undefined> | undefined;

async function ensureBucket() {
  bucketReady ??= (async () => {
    const supabase = getSupabase();
    const { error: existingError } = await supabase.storage.getBucket(bucket);
    if (!existingError) return undefined;
    const { error } = await supabase.storage.createBucket(bucket, { public: false });
    if (error && !/already exists/i.test(error.message)) return error.message;
    return undefined;
  })();
  const result = await bucketReady;
  if (result) bucketReady = undefined;
  return result;
}

export async function POST(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Feedback storage is unavailable." }, { status: 503 });
  const body = await request.json().catch(() => undefined) as { category?: string; message?: string; rating?: number; page?: string } | undefined;
  if (!body) return Response.json({ error: "Invalid feedback request." }, { status: 400 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supabase = getSupabase();
  const { data } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  const user = data.user;

  const quota = rateLimit(request, "feedback", 5, 24 * 60 * 60 * 1000, user?.id);
  if (!quota.allowed) return rateLimited(quota.retryAfter);

  const message = body.message?.trim() || "";
  const category = categories.has(body.category || "") ? body.category! : "other";
  const rating = Number.isInteger(body.rating) && Number(body.rating) >= 1 && Number(body.rating) <= 5 ? Number(body.rating) : undefined;
  if (message.length < 10 || message.length > 2000) return Response.json({ error: "Feedback must be between 10 and 2,000 characters." }, { status: 400 });

  const bucketError = await ensureBucket();
  if (bucketError) return Response.json({ error: "Feedback storage could not be prepared." }, { status: 500 });
  const createdAt = new Date().toISOString();
  const feedback: FeedbackEmail = { id: crypto.randomUUID(), userId: user?.id || "anonymous", email: user?.email, category, rating, message, page: body.page?.slice(0, 300), createdAt };
  const payload = JSON.stringify(feedback, null, 2);
  const date = createdAt.slice(0, 10);
  const path = `${date}/${user?.id || "anonymous"}/${feedback.id}.json`;
  const bytes = new TextEncoder().encode(payload);
  const { error } = await supabase.storage.from(bucket).upload(path, bytes.buffer, { contentType: "application/json; charset=utf-8", upsert: false });
  if (error) {
    console.error("Feedback upload failed", { code: error.name, statusCode: error.statusCode });
    return Response.json({ error: "Feedback could not be saved. Please try again.", supportEmail: "padmanathank.dev@gmail.com" }, { status: 500 });
  }
  const delivery = await sendFeedbackCopy(feedback, new URL(request.url).origin);
  return Response.json({ saved: true, emailed: delivery.sent, delivery: delivery.sent ? undefined : delivery.reason }, { status: 201 });
}
