type WindowEntry = { count: number; resetAt: number };
type RateLimitResult = { allowed: boolean; remaining: number; retryAfter: number };

declare global { var __deepscapesRateLimits: Map<string, WindowEntry> | undefined; }

const store = globalThis.__deepscapesRateLimits ??= new Map<string, WindowEntry>();
const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

export function requestIdentity(request: Request, userId?: string) {
  if (userId) return `user:${userId}`;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${forwarded || request.headers.get("x-real-ip") || "anonymous"}`;
}

function localRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now(); const current = store.get(key);
  if (!current || current.resetAt <= now) { store.set(key, { count: 1, resetAt: now + windowMs }); return { allowed: true, remaining: limit - 1, retryAfter: 0 }; }
  if (current.count >= limit) return { allowed: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  current.count += 1; return { allowed: true, remaining: limit - current.count, retryAfter: 0 };
}

async function redisRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult | undefined> {
  if (!redisUrl || !redisToken) return undefined;
  try {
    const response = await fetch(`${redisUrl}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["PEXPIRE", key, windowMs, "NX"], ["PTTL", key]]),
      cache: "no-store",
    });
    const results = await response.json() as { result?: number }[];
    const count = Number(results[0]?.result); const ttl = Number(results[2]?.result);
    if (!response.ok || !Number.isFinite(count)) return undefined;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfter: count <= limit ? 0 : Math.max(1, Math.ceil(Math.max(ttl, 1000) / 1000)) };
  } catch { return undefined; }
}

/** Uses Upstash Redis when configured; the local fallback still protects a single instance during development. */
export async function rateLimit(request: Request, scope: string, limit: number, windowMs: number, userId?: string) {
  const key = `deepscapes:rl:${scope}:${requestIdentity(request, userId)}`;
  return await redisRateLimit(key, limit, windowMs) ?? localRateLimit(key, limit, windowMs);
}

export function rateLimited(retryAfter: number) {
  return Response.json({ error: "Too many requests. Please wait before trying again.", retryAfter }, { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } });
}
