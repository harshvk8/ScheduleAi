import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// 10 requests per 10 minutes per IP
export const minuteLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '10 m'), prefix: 'rl:min' })
  : null;

// 20 requests per day per IP
export const dayLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '24 h'), prefix: 'rl:day' })
  : null;

export function getIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'anonymous'
  );
}
