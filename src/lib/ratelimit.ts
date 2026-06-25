import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// 15 requests per minute per IP
export const minuteLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(15, '1 m'), prefix: 'rl:min' })
  : null;

// 100 requests per day per IP
export const dayLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, '24 h'), prefix: 'rl:day' })
  : null;

export function getIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'anonymous'
  );
}
