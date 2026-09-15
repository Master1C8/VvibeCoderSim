import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
  createEmptyAnalyticsStore,
  getAnalyticsSnapshot,
  parseAnalyticsClientEvent,
  recordAnalyticsEvent,
  removeAnalyticsVisitor,
  type AnalyticsStore,
} from '@/lib/game/analytics';
import { clearAnalyticsIdentity, readAnalyticsIdentity } from '@/lib/server/analytics-session';
import { hasSameOrigin, isLikelyBot, isRateLimited } from '@/lib/server/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_VISITORS = 10_000;
const DATA_DIRECTORY = process.env.VVIBECODER_DATA_DIR || path.join(process.cwd(), '.data');
const ANALYTICS_FILE = path.join(DATA_DIRECTORY, 'analytics.json');

let mutationQueue: Promise<void> = Promise.resolve();

const isVisitorRecord = (value: unknown) => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Number.isFinite(record.firstSeenAt)
    && Number.isFinite(record.lastSeenAt)
    && Array.isArray(record.sessionIds)
    && Array.isArray(record.startedGameIds)
    && Array.isArray(record.completedGameIds);
};

const readStore = async (): Promise<AnalyticsStore> => {
  try {
    const parsed = JSON.parse(await readFile(ANALYTICS_FILE, 'utf8')) as Partial<AnalyticsStore>;
    if (parsed.version !== 1 || !parsed.visitors || typeof parsed.visitors !== 'object') {
      return createEmptyAnalyticsStore();
    }
    return {
      version: 1,
      visitors: Object.fromEntries(
        Object.entries(parsed.visitors).filter(([, visitor]) => isVisitorRecord(visitor)),
      ),
    } as AnalyticsStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return createEmptyAnalyticsStore();
    throw error;
  }
};

const writeStore = async (store: AnalyticsStore) => {
  await mkdir(DATA_DIRECTORY, { recursive: true });
  const temporaryFile = `${ANALYTICS_FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryFile, ANALYTICS_FILE);
};

const withMutationLock = async <T>(mutation: () => Promise<T>) => {
  let release: (() => void) | undefined;
  const previous = mutationQueue;
  mutationQueue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    return await mutation();
  } finally {
    release?.();
  }
};

const jsonError = (message: string, status: number) => NextResponse.json({ error: message }, { status });

const noStoreHeaders = { 'cache-control': 'no-store' };

export const GET = async () => {
  try {
    return NextResponse.json(getAnalyticsSnapshot(await readStore()), { headers: noStoreHeaders });
  } catch {
    return jsonError('Could not load analytics.', 500);
  }
};

export const POST = async (request: NextRequest) => {
  if (!hasSameOrigin(request)) return jsonError('Invalid request origin.', 403);
  if (isLikelyBot(request)) return jsonError('Automated clients are not counted.', 403);
  if (isRateLimited(request, 'analytics-event', 120, 60 * 60 * 1000)) {
    return jsonError('Too many analytics events.', 429);
  }
  const identity = readAnalyticsIdentity(request);
  if (!identity) return jsonError('Analytics consent is required.', 401);
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > 2_000) return jsonError('Analytics event is too large.', 413);
  let input = null;
  try {
    const raw = await request.text();
    if (raw.length > 2_000) return jsonError('Analytics event is too large.', 413);
    input = parseAnalyticsClientEvent(JSON.parse(raw));
  } catch {
    return jsonError('Invalid analytics event.', 400);
  }
  if (!input) return jsonError('Invalid analytics event.', 400);

  try {
    return await withMutationLock(async () => {
      const current = await readStore();
      if (!current.visitors[identity.visitorId] && Object.keys(current.visitors).length >= MAX_VISITORS) {
        return jsonError('Analytics capacity reached.', 503);
      }
      const next = recordAnalyticsEvent(current, { ...identity, ...input });
      await writeStore(next);
      return NextResponse.json(getAnalyticsSnapshot(next), { headers: noStoreHeaders });
    });
  } catch {
    return jsonError('Could not save analytics.', 500);
  }
};

export const DELETE = async (request: NextRequest) => {
  if (!hasSameOrigin(request)) return jsonError('Invalid request origin.', 403);
  if (isRateLimited(request, 'analytics-delete', 20, 60 * 60 * 1000)) {
    return jsonError('Too many analytics removal requests.', 429);
  }
  const identity = readAnalyticsIdentity(request);
  try {
    return await withMutationLock(async () => {
      const current = await readStore();
      const next = identity ? removeAnalyticsVisitor(current, identity.visitorId) : current;
      if (identity) await writeStore(next);
      const response = NextResponse.json(getAnalyticsSnapshot(next), { headers: noStoreHeaders });
      clearAnalyticsIdentity(response);
      return response;
    });
  } catch {
    return jsonError('Could not update analytics.', 500);
  }
};
