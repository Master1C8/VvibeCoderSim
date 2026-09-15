import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptyAnalyticsStore,
  getAnalyticsSnapshot,
  parseAnalyticsClientEvent,
  recordAnalyticsEvent,
  removeAnalyticsVisitor,
} from '../lib/game/analytics';

const visitorId = 'visitor-12345678';
const sessionId = 'session-12345678';

test('analytics counts anonymous visitors, sessions and games without duplicate events', () => {
  let store = createEmptyAnalyticsStore();
  store = recordAnalyticsEvent(store, { visitorId, sessionId, event: 'visit' }, 100);
  store = recordAnalyticsEvent(store, { visitorId, sessionId, event: 'visit' }, 110);
  store = recordAnalyticsEvent(store, { visitorId, sessionId, event: 'game_started', gameId: 'game-12345678' }, 120);
  store = recordAnalyticsEvent(store, { visitorId, sessionId, event: 'game_started', gameId: 'game-12345678' }, 130);
  store = recordAnalyticsEvent(store, { visitorId, sessionId, event: 'game_completed', gameId: 'game-12345678' }, 140);

  assert.deepEqual(getAnalyticsSnapshot(store), {
    uniqueVisitors: 1,
    uniquePlayers: 1,
    sessions: 1,
    gamesStarted: 1,
    gamesCompleted: 1,
    updatedAt: 140,
  });
});

test('analytics keeps separate sessions and removes an excluded visitor entirely', () => {
  let store = recordAnalyticsEvent(createEmptyAnalyticsStore(), {
    visitorId,
    sessionId,
    event: 'visit',
  }, 100);
  store = recordAnalyticsEvent(store, {
    visitorId,
    sessionId: 'session-87654321',
    event: 'visit',
  }, 200);
  assert.equal(getAnalyticsSnapshot(store).sessions, 2);
  assert.deepEqual(getAnalyticsSnapshot(removeAnalyticsVisitor(store, visitorId)), {
    uniqueVisitors: 0,
    uniquePlayers: 0,
    sessions: 0,
    gamesStarted: 0,
    gamesCompleted: 0,
    updatedAt: null,
  });
});

test('analytics accepts only known client events and valid game IDs', () => {
  assert.deepEqual(parseAnalyticsClientEvent({ event: 'visit' }), { event: 'visit', gameId: undefined });
  assert.equal(parseAnalyticsClientEvent({ event: 'game_started' }), null);
  assert.equal(parseAnalyticsClientEvent({ event: 'unknown' }), null);
  assert.deepEqual(parseAnalyticsClientEvent({
    event: 'game_completed',
    gameId: 'game-12345678',
  }), {
    event: 'game_completed',
    gameId: 'game-12345678',
  });
});
