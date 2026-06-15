import { createRedisConnection } from "@/lib/queue";

let redis: ReturnType<typeof createRedisConnection> | null = null;

function connection() {
  if (!redis) redis = createRedisConnection();
  return redis;
}

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

/**
 * 固定視窗計數限流。key 通常是 `action:userId`。
 * Redis 不可用時採 fail-open（回 ok），避免限流機制本身造成全站中斷。
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  try {
    const redisKey = `ratelimit:${key}`;
    const client = connection();
    const count = await client.incr(redisKey);
    if (count === 1) {
      await client.expire(redisKey, windowSec);
    }
    const ttl = await client.ttl(redisKey);
    const retryAfterSec = ttl > 0 ? ttl : windowSec;
    return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfterSec };
  } catch {
    return { ok: true, remaining: limit, retryAfterSec: 0 };
  }
}
