import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getSupabase } from "@/lib/db";

export type FeedbackEmail = {
  id: string;
  userId: string;
  email?: string;
  category: string;
  rating?: number;
  message: string;
  page?: string;
  createdAt: string;
};

type GmailConfig = { clientId: string; clientSecret: string; encryptionKey: string; recipient: string };
type GmailTokenResponse = { access_token?: string; error?: string };

const configBucket = "deepscapes-private-config";
const tokenPath = "feedback/gmail-refresh-token.v1";
let configBucketReady: Promise<string | undefined> | undefined;

export const feedbackRecipient = process.env.FEEDBACK_TO_EMAIL?.trim() || "padmanathan.kdev@gmail.com";

export function gmailRedirectUri(origin: string) {
  return process.env.GMAIL_REDIRECT_URI?.trim() || new URL("/api/feedback/gmail/callback", origin).toString();
}

export function gmailConfig(): GmailConfig | undefined {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const encryptionKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!clientId || !clientSecret || !encryptionKey || encryptionKey.length < 32) return undefined;
  return { clientId, clientSecret, encryptionKey, recipient: feedbackRecipient };
}

async function ensureConfigBucket() {
  configBucketReady ??= (async () => {
    const supabase = getSupabase();
    const { error: existingError } = await supabase.storage.getBucket(configBucket);
    if (!existingError) return undefined;
    const { error } = await supabase.storage.createBucket(configBucket, { public: false });
    if (error && !/already exists/i.test(error.message)) return error.message;
    return undefined;
  })();
  const result = await configBucketReady;
  if (result) configBucketReady = undefined;
  return result;
}

function encryptionKey(secret: string) { return createHash("sha256").update(secret).digest(); }

function encrypt(value: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")}`;
}

function decrypt(value: string, secret: string) {
  const [version, payload] = value.split(".");
  if (version !== "v1" || !payload) return undefined;
  const data = Buffer.from(payload, "base64url");
  if (data.length < 29) return undefined;
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}

export async function storeGmailRefreshToken(refreshToken: string) {
  const config = gmailConfig();
  if (!config) return { stored: false as const, error: "Gmail is not configured." };
  const bucketError = await ensureConfigBucket();
  if (bucketError) return { stored: false as const, error: "Private settings storage could not be prepared." };
  const encrypted = new TextEncoder().encode(encrypt(refreshToken, config.encryptionKey));
  const { error } = await getSupabase().storage.from(configBucket).upload(tokenPath, encrypted, { contentType: "text/plain", upsert: true });
  if (error) {
    console.error("Gmail token storage failed", { statusCode: error.statusCode, name: error.name });
    return { stored: false as const, error: "The Gmail connection could not be saved." };
  }
  return { stored: true as const };
}

async function getGmailRefreshToken(config: GmailConfig) {
  const { data, error } = await getSupabase().storage.from(configBucket).download(tokenPath);
  if (error || !data) return undefined;
  try { return decrypt(await data.text(), config.encryptionKey); } catch { return undefined; }
}

function escapeHeader(value: string) { return value.replace(/[\r\n]+/g, " ").trim(); }

function messageFor(feedback: FeedbackEmail, origin: string, sender: string, recipient: string) {
  const category = feedback.category.slice(0, 1).toUpperCase() + feedback.category.slice(1);
  const rating = feedback.rating ? `${feedback.rating}/5` : "Not provided";
  const submittedAt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(feedback.createdAt));
  const pageUrl = feedback.page?.startsWith("/") ? new URL(feedback.page, origin).toString() : feedback.page;
  const text = ["New DeepScapes feedback", "", `Category: ${category}`, `Rating: ${rating}`, `Submitted by: ${feedback.email || "Unknown"}`, `User ID: ${feedback.userId}`, `Submitted: ${submittedAt}`, pageUrl ? `Page: ${pageUrl}` : "", "", feedback.message].filter(Boolean).join("\r\n");
  const raw = [
    `From: ${escapeHeader(sender)}`,
    `To: ${escapeHeader(recipient)}`,
    `Subject: ${escapeHeader(`[DeepScapes] ${category} feedback · ${rating}`)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(text, "utf8").toString("base64"),
  ].join("\r\n");
  return Buffer.from(raw, "utf8").toString("base64url");
}

export type FeedbackDelivery = { sent: true; id?: string } | { sent: false; reason: "not_configured" | "not_connected" | "provider_error" };

export async function sendFeedbackCopy(feedback: FeedbackEmail, origin: string): Promise<FeedbackDelivery> {
  const config = gmailConfig();
  if (!config) return { sent: false, reason: "not_configured" };
  const refreshToken = await getGmailRefreshToken(config);
  if (!refreshToken) return { sent: false, reason: "not_connected" };
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(8_000),
    });
    const token = await tokenResponse.json().catch(() => undefined) as GmailTokenResponse | undefined;
    if (!tokenResponse.ok || !token?.access_token) throw new Error(token?.error || "token_exchange_failed");
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: messageFor(feedback, origin, config.recipient, config.recipient) }),
      signal: AbortSignal.timeout(8_000),
    });
    const body = await response.json().catch(() => undefined) as { id?: string; error?: { status?: string } } | undefined;
    if (!response.ok) throw new Error(body?.error?.status || "send_failed");
    return { sent: true, id: body?.id };
  } catch (error) {
    console.error("Feedback Gmail delivery failed", { error: error instanceof Error ? error.message : "UnknownError" });
    return { sent: false, reason: "provider_error" };
  }
}
