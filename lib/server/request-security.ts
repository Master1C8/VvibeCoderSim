import { createHmac, randomBytes } from 'node:crypto';

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const fallbackFingerprintSecret = randomBytes(32).toString('hex');

const getFingerprintSecret = () => (
  process.env.VVIBECODER_ANALYTICS_SECRET || fallbackFingerprintSecret
);

const getClientFingerprint = (request: Request) => {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const address = forwarded || request.headers.get('x-real-ip') || 'unknown';
  return createHmac('sha256', getFingerprintSecret()).update(address).digest('hex');
};

export const hasSameOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const requestHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || requestUrl.host;
    const requestProtocol = request.headers.get('x-forwarded-proto') || requestUrl.protocol.replace(':', '');
    return originUrl.host === requestHost && originUrl.protocol === `${requestProtocol}:`;
  } catch {
    return false;
  }
};

export const isLikelyBot = (request: Request) => {
  const userAgent = request.headers.get('user-agent') || '';
  return !userAgent || /bot|crawler|spider|slurp|headless|lighthouse|preview|facebookexternalhit|telegrambot/i.test(userAgent);
};

export const isRateLimited = (
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number,
) => {
  const now = Date.now();
  const key = `${bucket}:${getClientFingerprint(request)}`;
  const current = rateLimitBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
};
