export const ANALYTICS_CONSENT_KEY = 'vvibe-analytics-consent-v1';

export type AnalyticsConsent = 'granted' | 'declined' | 'unknown';

export type AnalyticsEventName = 'visit' | 'game_started' | 'game_completed';

export interface AnalyticsEventInput {
  visitorId: string;
  sessionId: string;
  event: AnalyticsEventName;
  gameId?: string;
}

export interface AnalyticsClientEvent {
  event: AnalyticsEventName;
  gameId?: string;
}

export interface AnalyticsVisitorRecord {
  firstSeenAt: number;
  lastSeenAt: number;
  sessionIds: string[];
  startedGameIds: string[];
  completedGameIds: string[];
}

export interface AnalyticsStore {
  version: 1;
  visitors: Record<string, AnalyticsVisitorRecord>;
}

export interface AnalyticsSnapshot {
  uniqueVisitors: number;
  uniquePlayers: number;
  sessions: number;
  gamesStarted: number;
  gamesCompleted: number;
  updatedAt: number | null;
}

const MAX_IDS_PER_VISITOR = 100;
const ID_PATTERN = /^[a-z0-9_-]{8,128}$/i;

const addUnique = (values: string[], value: string) => (
  values.includes(value) ? values : [...values, value].slice(-MAX_IDS_PER_VISITOR)
);

export const createEmptyAnalyticsStore = (): AnalyticsStore => ({
  version: 1,
  visitors: {},
});

export const parseAnalyticsClientEvent = (value: unknown): AnalyticsClientEvent | null => {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<AnalyticsClientEvent>;
  if (input.event !== 'visit' && input.event !== 'game_started' && input.event !== 'game_completed') return null;
  if (input.event !== 'visit' && (!input.gameId || !ID_PATTERN.test(input.gameId))) return null;
  return {
    event: input.event,
    gameId: input.gameId,
  };
};

export const recordAnalyticsEvent = (
  store: AnalyticsStore,
  input: AnalyticsEventInput,
  now = Date.now(),
): AnalyticsStore => {
  const current = store.visitors[input.visitorId] || {
    firstSeenAt: now,
    lastSeenAt: now,
    sessionIds: [],
    startedGameIds: [],
    completedGameIds: [],
  };
  const visitor: AnalyticsVisitorRecord = {
    ...current,
    lastSeenAt: now,
    sessionIds: addUnique(current.sessionIds, input.sessionId),
    startedGameIds: input.event === 'game_started' && input.gameId
      ? addUnique(current.startedGameIds, input.gameId)
      : current.startedGameIds,
    completedGameIds: input.event === 'game_completed' && input.gameId
      ? addUnique(current.completedGameIds, input.gameId)
      : current.completedGameIds,
  };
  return {
    version: 1,
    visitors: { ...store.visitors, [input.visitorId]: visitor },
  };
};

export const removeAnalyticsVisitor = (store: AnalyticsStore, visitorId: string): AnalyticsStore => {
  const visitors = { ...store.visitors };
  delete visitors[visitorId];
  return { version: 1, visitors };
};

export const getAnalyticsSnapshot = (store: AnalyticsStore): AnalyticsSnapshot => {
  const visitors = Object.values(store.visitors);
  return {
    uniqueVisitors: visitors.length,
    uniquePlayers: visitors.filter(visitor => visitor.startedGameIds.length > 0).length,
    sessions: visitors.reduce((total, visitor) => total + visitor.sessionIds.length, 0),
    gamesStarted: visitors.reduce((total, visitor) => total + visitor.startedGameIds.length, 0),
    gamesCompleted: visitors.reduce((total, visitor) => total + visitor.completedGameIds.length, 0),
    updatedAt: visitors.length ? Math.max(...visitors.map(visitor => visitor.lastSeenAt)) : null,
  };
};

let analyticsSessionPromise: Promise<boolean> | null = null;

export const getAnalyticsConsent = (): AnalyticsConsent => {
  if (typeof window === 'undefined') return 'unknown';
  try {
    const consent = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return consent === 'granted' || consent === 'declined' ? consent : 'unknown';
  } catch {
    return 'declined';
  }
};

const ensureAnalyticsSession = async () => {
  if (!analyticsSessionPromise) {
    analyticsSessionPromise = fetch('/api/analytics/session', { method: 'POST' })
      .then(response => response.ok)
      .catch(() => false);
  }
  return analyticsSessionPromise;
};

export const trackAnalyticsEvent = async (event: AnalyticsEventName, gameId?: string) => {
  if (getAnalyticsConsent() !== 'granted') return;
  try {
    if (!await ensureAnalyticsSession()) return;
    await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, gameId }),
      keepalive: true,
    });
  } catch {
    // Analytics must never interrupt the game.
  }
};

export const grantAnalyticsConsent = async (trackVisit = true) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ANALYTICS_CONSENT_KEY, 'granted');
  analyticsSessionPromise = null;
  if (trackVisit) await trackAnalyticsEvent('visit');
};

export const declineAnalyticsConsent = async () => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ANALYTICS_CONSENT_KEY, 'declined');
  analyticsSessionPromise = null;
  try {
    const response = await fetch('/api/analytics', {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Could not remove this device from analytics.');
  } catch (error) {
    throw error instanceof Error ? error : new Error('Could not remove this device from analytics.');
  }
};
