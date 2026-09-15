"use client"

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  declineAnalyticsConsent,
  getAnalyticsConsent,
  grantAnalyticsConsent,
  type AnalyticsConsent,
  type AnalyticsSnapshot,
} from '@/lib/game/analytics';

const EMPTY_STATS: AnalyticsSnapshot = {
  uniqueVisitors: 0,
  uniquePlayers: 0,
  sessions: 0,
  gamesStarted: 0,
  gamesCompleted: 0,
  updatedAt: null,
};

export default function StatsPage() {
  const [stats, setStats] = useState<AnalyticsSnapshot>(EMPTY_STATS);
  const [consent, setConsent] = useState<AnalyticsConsent>('unknown');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [actionError, setActionError] = useState('');

  const loadStats = useCallback(async () => {
    setStatus('loading');
    try {
      const response = await fetch('/api/analytics', { cache: 'no-store' });
      if (!response.ok) throw new Error('Analytics request failed');
      setStats(await response.json() as AnalyticsSnapshot);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    setConsent(getAnalyticsConsent());
    void loadStats();
  }, [loadStats]);

  const toggleConsent = async () => {
    setActionError('');
    try {
      if (consent === 'granted') {
        await declineAnalyticsConsent();
        setConsent('declined');
        await loadStats();
      } else {
        await grantAnalyticsConsent(false);
        setConsent('granted');
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not update analytics settings.');
    }
  };

  const cards = [
    ['Unique players', stats.uniquePlayers, 'Devices that started at least one game'],
    ['Unique visitors', stats.uniqueVisitors, 'Devices that opened the game'],
    ['Sessions', stats.sessions, 'New browser sessions'],
    ['Games started', stats.gamesStarted, 'Unique game runs'],
    ['Games completed', stats.gamesCompleted, 'Successful production deployments'],
  ] as const;

  return (
    <main className="min-h-screen bg-[#fafafa] px-5 py-10 text-[#18181b] sm:px-8">
      <section className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-purple-600">VvibeCoder Sim</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Anonymous usage statistics</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
              These public aggregate counts use server-signed random browser and session IDs after explicit consent. IP addresses, user agents, project names, and chat content are not stored.
            </p>
          </div>
          <Link href="/" className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-gray-50">
            Back to the game
          </Link>
        </div>

        {status === 'error' ? (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            Analytics are temporarily unavailable.
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(([label, value, description]) => (
              <article key={label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500">{label}</p>
                <p className="mt-2 text-3xl font-semibold">{status === 'loading' ? '—' : value.toLocaleString('en-US')}</p>
                <p className="mt-2 text-xs leading-5 text-gray-500">{description}</p>
              </article>
            ))}
          </div>
        )}

        <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">This browser</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            {consent === 'granted'
              ? 'Anonymous analytics are enabled in this browser.'
              : 'Anonymous analytics are disabled in this browser. No identifier is created until you opt in.'}
          </p>
          <button
            type="button"
            onClick={toggleConsent}
            className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
          >
            {consent === 'granted' ? 'Disable analytics and remove my data' : 'Allow anonymous analytics'}
          </button>
          {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
          <p className="mt-3 text-xs leading-5 text-gray-500">
            Your choice is stored only in this browser. Disabling analytics removes this browser’s anonymous record and signed identifiers.
          </p>
        </section>
      </section>
    </main>
  );
}
