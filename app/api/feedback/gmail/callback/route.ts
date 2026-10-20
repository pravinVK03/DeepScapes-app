import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { feedbackRecipient, gmailConfig, gmailRedirectUri, storeGmailRefreshToken } from "@/lib/feedback-email";

export const runtime = "nodejs";

const stateCookie = "deepscapes_gmail_feedback_state";

function sameState(expected: string | undefined, received: string | null) {
  if (!expected || !received) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

function finish(request: NextRequest, result: "connected" | "error") {
  const url = new URL("/scapes", request.url);
  url.searchParams.set("gmail", result);
  const response = NextResponse.redirect(url);
  response.cookies.delete(stateCookie);
  return response;
}

export async function GET(request: NextRequest) {
  const config = gmailConfig();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!config || !code || request.nextUrl.searchParams.get("error") || !sameState(request.cookies.get(stateCookie)?.value, state)) return finish(request, "error");
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: gmailRedirectUri(request.url), grant_type: "authorization_code" }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => undefined) as { access_token?: string; refresh_token?: string } | undefined;
    if (!response.ok || !body?.refresh_token || !body.access_token) return finish(request, "error");
    const identityResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${body.access_token}` }, signal: AbortSignal.timeout(10_000) });
    const identity = await identityResponse.json().catch(() => undefined) as { email?: string } | undefined;
    if (!identityResponse.ok || identity?.email?.toLowerCase() !== feedbackRecipient.toLowerCase()) return finish(request, "error");
    const saved = await storeGmailRefreshToken(body.refresh_token);
    return finish(request, saved.stored ? "connected" : "error");
  } catch {
    return finish(request, "error");
  }
}
