import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { databaseEnabled, getSupabase } from "@/lib/db";
import { feedbackRecipient, gmailConfig, gmailRedirectUri } from "@/lib/feedback-email";

export const runtime = "nodejs";

const stateCookie = "deepscapes_gmail_feedback_state";

export async function GET(request: Request) {
  if (!databaseEnabled) return Response.json({ owner: false, configured: false });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ owner: false, configured: Boolean(gmailConfig()) });
  const { data } = await getSupabase().auth.getUser(token);
  const owner = Boolean(data.user?.email && data.user.email.toLowerCase() === feedbackRecipient.toLowerCase());
  return Response.json({ owner, configured: Boolean(gmailConfig()) });
}

export async function POST(request: Request) {
  if (!databaseEnabled) return Response.json({ error: "Feedback storage is unavailable." }, { status: 503 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in to connect the feedback inbox." }, { status: 401 });
  const { data } = await getSupabase().auth.getUser(token);
  if (!data.user?.email || data.user.email.toLowerCase() !== feedbackRecipient.toLowerCase()) return Response.json({ error: "Only the feedback inbox owner can connect Gmail." }, { status: 403 });
  const config = gmailConfig();
  if (!config) return Response.json({ error: "Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and a 32-character GMAIL_TOKEN_ENCRYPTION_KEY in Vercel first." }, { status: 503 });

  const state = randomBytes(32).toString("base64url");
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: gmailRedirectUri(request.url),
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  const response = NextResponse.json({ url: authorize.toString() });
  response.cookies.set(stateCookie, state, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", maxAge: 600, path: "/api/feedback/gmail" });
  return response;
}
