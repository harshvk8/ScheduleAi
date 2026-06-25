import { NextResponse } from 'next/server';
import { minuteLimiter, dayLimiter } from '@/lib/ratelimit';

export async function GET() {
  return NextResponse.json({
    minuteLimiterActive: !!minuteLimiter,
    dayLimiterActive: !!dayLimiter,
    upstashUrlSet: !!process.env.UPSTASH_REDIS_REST_URL,
    upstashTokenSet: !!process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}
