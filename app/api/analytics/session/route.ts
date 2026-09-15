import { NextRequest, NextResponse } from 'next/server';
import { issueAnalyticsIdentity } from '@/lib/server/analytics-session';
import { hasSameOrigin, isLikelyBot, isRateLimited } from '@/lib/server/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = (request: NextRequest) => {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  if (isLikelyBot(request)) return NextResponse.json({ error: 'Automated clients are not counted.' }, { status: 403 });
  if (isRateLimited(request, 'analytics-session', 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many analytics sessions.' }, { status: 429 });
  }
  const response = NextResponse.json({ ready: true });
  if (!issueAnalyticsIdentity(request, response)) {
    return NextResponse.json({ error: 'Analytics are not configured.' }, { status: 503 });
  }
  return response;
};
