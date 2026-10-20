type WindowEntry = { count: number; resetAt: number };

declare global { var __deepscapesRateLimits: Map<string, WindowEntry> | undefined; }

const store = globalThis.__deepscapesRateLimits ??= new Map<string, WindowEntry>();

export function requestIdentity(request: Request, userId?: string) {
  if (userId) return `user:${userId}`;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${forwarded || request.headers.get("x-real-ip") || "anonymous"}`;
}

export function rateLimit(request: Request, scope: string, limit: number, windowMs: number, userId?: string) {
  const key = `${scope}:${requestIdentity(request, userId)}`;
  const now = Date.now(); const current = store.get(key);
  if (!current || current.resetAt <= now) { store.set(key, { count: 1, resetAt: now + windowMs }); return { allowed: true, remaining: limit - 1, retryAfter: 0 }; }
  if (current.count >= limit) return { allowed: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  current.count += 1; return { allowed: true, remaining: limit - current.count, retryAfter: 0 };
}

export function rateLimited(retryAfter: number) {
  return Response.json({ error: "Too many requests. Please wait before trying again.", retryAfter }, { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } });
}
