import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

export const ANALYTICS_VISITOR_COOKIE = 'vvibe_analytics_visitor';
export const ANALYTICS_SESSION_COOKIE = 'vvibe_analytics_session';

const getSecret = () => {
  const secret = process.env.VVIBECODER_ANALYTICS_SECRET;
  return secret && secret.length >= 32 ? secret : null;
};

const signId = (id: string, secret: string) => (
  `${id}.${createHmac('sha256', secret).update(id).digest('base64url')}`
);

const verifySignedId = (value: string | undefined, secret: string) => {
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  if (separator < 1) return null;
  const id = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = createHmac('sha256', secret).update(id).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  return /^[a-f0-9-]{36}$/i.test(id) ? id : null;
};

export const readAnalyticsIdentity = (request: NextRequest) => {
  const secret = getSecret();
  if (!secret) return null;
  const visitorId = verifySignedId(request.cookies.get(ANALYTICS_VISITOR_COOKIE)?.value, secret);
  const sessionId = verifySignedId(request.cookies.get(ANALYTICS_SESSION_COOKIE)?.value, secret);
  return visitorId && sessionId ? { visitorId, sessionId } : null;
};

export const issueAnalyticsIdentity = (request: NextRequest, response: NextResponse) => {
  const secret = getSecret();
  if (!secret) return false;
  const visitorId = verifySignedId(request.cookies.get(ANALYTICS_VISITOR_COOKIE)?.value, secret) || randomUUID();
  const sessionId = verifySignedId(request.cookies.get(ANALYTICS_SESSION_COOKIE)?.value, secret) || randomUUID();
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set(ANALYTICS_VISITOR_COOKIE, signId(visitorId, secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  response.cookies.set(ANALYTICS_SESSION_COOKIE, signId(sessionId, secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
  });
  return true;
};

export const clearAnalyticsIdentity = (response: NextResponse) => {
  response.cookies.set(ANALYTICS_VISITOR_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  response.cookies.set(ANALYTICS_SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
};
