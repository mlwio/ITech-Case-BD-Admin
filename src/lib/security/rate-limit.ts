/**
 * Lightweight in-memory fixed-window rate limiter.
 *
 * Zero-dependency and runtime-agnostic (Node / Edge): each process keeps a
 * `Map` of counters keyed by a caller-supplied string. It guards the sensitive
 * server actions and API routes against brute-force login attempts and request
 * spam without needing Redis or any external service.
 *
 * A serverless deployment may run several isolated instances, so this is
 * best-effort per instance — enough to blunt repeated credential stuffing and
 * endpoint flooding, which is the goal here.
 */

interface RateLimitBucket {
  /** Requests observed inside the current window. */
  count: number;
  /** Epoch ms when the window resets. */
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

/** Safety valve so a hostile caller can't grow the map without bound. */
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** Milliseconds until the window resets (0 when allowed). */
  retryAfterMs: number;
}

/** Drops expired buckets when the map grows large (amortised cleanup). */
function prune(now: number): void {
  if (buckets.size <= MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Records a hit for `key` and reports whether it is still within budget. */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  prune(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.limit - 1, retryAfterMs: 0 };
  }

  bucket.count += 1;
  if (bucket.count > options.limit) {
    return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }
  return { allowed: true, remaining: options.limit - bucket.count, retryAfterMs: 0 };
}

/** Clears a key — call after a successful sign-in so it starts fresh. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/** Best-effort client IP from proxy headers (`x-forwarded-for` → `x-real-ip`). */
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || headers.get("cf-connecting-ip")?.trim() || "unknown";
}

/** Human-friendly wait time for rate-limit error messages. */
export function formatRetryAfter(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)} min`;
}
