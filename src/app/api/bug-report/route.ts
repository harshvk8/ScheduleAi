import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { saveBugReport } from '@/lib/db';
import { minuteLimiter, getIp } from '@/lib/ratelimit';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BugReportRequest {
  errorMessage: string;
  stackTrace: string;
  componentStack?: string;
  lastUserAction?: string;
  eventsSnapshot?: string;
  sessionId?: string;
  timestamp: string;
  url?: string;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getIp(req);
  if (minuteLimiter) {
    const { success } = await minuteLimiter.limit(`bug:${ip}`);
    if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: BugReportRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  let aiSummary = 'AI analysis unavailable — check the stack trace manually.';
  let severity: 'low' | 'medium' | 'high' = 'medium';
  let suggestedFix = 'Review the stack trace for the root cause.';

  if (apiKey && apiKey !== 'your-anthropic-api-key-here') {
    try {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content:
              `Analyze this crash from a React/Next.js calendar scheduling web app.\n\n` +
              `Error: ${body.errorMessage}\n` +
              `Stack trace:\n${(body.stackTrace ?? '').slice(0, 1500)}\n` +
              `Component stack: ${(body.componentStack ?? '').slice(0, 400)}\n` +
              `Last user action: ${body.lastUserAction ?? 'Unknown'}\n` +
              `Page URL: ${body.url ?? 'Unknown'}\n\n` +
              `Respond in JSON with exactly these fields:\n` +
              `{\n` +
              `  "summary": "1-2 sentence plain English explanation of what went wrong",\n` +
              `  "severity": "low|medium|high",\n` +
              `  "suggestedFix": "1-2 sentence actionable fix for the developer"\n` +
              `}`,
          },
        ],
      });

      const text =
        response.content.find((c): c is Anthropic.TextBlock => c.type === 'text')?.text ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.summary) aiSummary = parsed.summary;
        if (['low', 'medium', 'high'].includes(parsed.severity)) severity = parsed.severity;
        if (parsed.suggestedFix) suggestedFix = parsed.suggestedFix;
      }
    } catch (e) {
      console.error('[/api/bug-report] Claude analysis failed:', e);
    }
  }

  try {
    await saveBugReport({
      sessionId: body.sessionId ?? 'unknown',
      timestamp: body.timestamp,
      errorMessage: body.errorMessage,
      stackTrace: body.stackTrace ?? '',
      componentStack: body.componentStack ?? '',
      lastUserAction: body.lastUserAction ?? '',
      eventsSnapshot: body.eventsSnapshot ?? '',
      url: body.url ?? '',
      aiSummary,
      severity,
      suggestedFix,
    });
  } catch (e) {
    console.error('[/api/bug-report] Firestore save failed:', e);
  }

  return NextResponse.json({ received: true });
}
