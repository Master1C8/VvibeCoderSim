"use client"

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  declineAnalyticsConsent,
  getAnalyticsConsent,
  grantAnalyticsConsent,
  type AnalyticsConsent as AnalyticsConsentValue,
} from '@/lib/game/analytics';

export const AnalyticsConsent = () => {
  const [consent, setConsent] = useState<AnalyticsConsentValue>('unknown');

  useEffect(() => setConsent(getAnalyticsConsent()), []);

  if (consent !== 'unknown') return null;

  return (
    <aside className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl shadow-black/10 sm:flex sm:items-center sm:gap-5">
      <p className="flex-1 text-sm leading-6 text-gray-600">
        May we count anonymous visits and completed games? We use signed first-party identifiers and never store IP addresses, user agents, project names, or chat content. Aggregate totals are public on the{' '}
        <Link href="/stats" className="font-semibold text-gray-900 underline underline-offset-2">stats page</Link>.
      </p>
      <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
        <button
          type="button"
          onClick={() => {
            setConsent('declined');
            void declineAnalyticsConsent().catch(() => undefined);
          }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          No thanks
        </button>
        <button
          type="button"
          onClick={() => {
            setConsent('granted');
            void grantAnalyticsConsent();
          }}
          className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
        >
          Allow anonymous analytics
        </button>
      </div>
    </aside>
  );
};
