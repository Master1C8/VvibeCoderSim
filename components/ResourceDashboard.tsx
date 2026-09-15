"use client"

import { Brain, Users, Wallet } from 'lucide-react';
import {
  ResourceKey,
  ResourceState,
  getResourceIndicatorPosition,
  RESOURCE_EDGES,
  RESOURCE_HIGH_LIMIT,
  RESOURCE_LABELS,
  RESOURCE_LOW_LIMIT,
} from '@/lib/engine/resources';
import { Personality } from '@/lib/engine/personality';
import { getContextPressure, getNextWeeklyResetAt, getWeeklyUsage } from '@/lib/engine/usage';
import { cn } from '@/lib/utils';

interface ResourceDashboardProps {
  personality: Personality;
  contextTokens: number;
  weeklyTokensSpent: number;
  weeklyTokenBonus: number;
  weeklyResetAt?: number;
}

interface HeaderResourcesProps {
  resources: ResourceState;
}

const ICONS = {
  money: Wallet,
  motivation: Brain,
  team: Users,
};

const compactTokens = (value: number) => {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
  return `${Math.round(value / 1_000)}K`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatResetDate = (timestamp?: number) => {
  const reset = new Date(timestamp || getNextWeeklyResetAt());
  return `${reset.getDate()} ${MONTHS[reset.getMonth()]}`;
};

const HeaderResource = ({ resource, value }: { resource: ResourceKey; value: number }) => {
  const Icon = ICONS[resource];
  const edges = RESOURCE_EDGES[resource];
  const indicatorPosition = getResourceIndicatorPosition(value);

  return (
    <section
      aria-label={`${RESOURCE_LABELS[resource]}. ${edges.low} at ${RESOURCE_LOW_LIMIT}, ${edges.high} at ${RESOURCE_HIGH_LIMIT}`}
      title={`${RESOURCE_LABELS[resource]} · safe zone ${RESOURCE_LOW_LIMIT}–${RESOURCE_HIGH_LIMIT}`}
      className="w-11 min-w-0 sm:w-20 md:w-28"
    >
      <div className="flex items-center justify-center gap-1 text-[11px] md:gap-1.5 md:text-xs">
        <span className="flex items-center gap-1 font-semibold text-gray-600">
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden md:inline">{RESOURCE_LABELS[resource]}</span>
        </span>
      </div>
      <div
        className="relative mt-1 h-1.5 overflow-visible rounded-full bg-green-400"
      >
        <div className="absolute left-1/2 top-[-2px] h-2.5 w-px bg-white/90" />
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-gray-950 shadow-sm transition-[left] duration-500"
          style={{ left: `${indicatorPosition}%` }}
        />
      </div>
    </section>
  );
};

export const HeaderResources = ({ resources }: HeaderResourcesProps) => (
  <div className="flex items-center justify-center gap-1.5 sm:gap-3 md:gap-5" aria-label="Programmer resources">
    <HeaderResource resource="money" value={resources.money} />
    <HeaderResource resource="motivation" value={resources.motivation} />
    <HeaderResource resource="team" value={resources.team} />
  </div>
);

export const ResourceDashboard = ({
  personality,
  contextTokens,
  weeklyTokensSpent,
  weeklyTokenBonus,
  weeklyResetAt,
}: ResourceDashboardProps) => {
  const context = getContextPressure({ personality, contextTokens });
  const weekly = getWeeklyUsage({
    tokensSpent: weeklyTokensSpent,
    bonusTokens: weeklyTokenBonus,
  });
  const contextDanger = context.usedPercent >= 100
    ? 'bg-red-500'
    : context.usedPercent >= 80
      ? 'bg-amber-500'
      : 'bg-gray-950';

  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 shadow-[0_-8px_30px_rgba(0,0,0,0.035)] backdrop-blur-md">
      <div className="mx-auto w-full max-w-4xl px-5 py-3 md:px-8">
        <div className="grid grid-cols-2 gap-4 md:gap-8">
          <section aria-label="Model context">
          <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] md:text-xs">
            <span className="font-semibold text-gray-500">Context</span>
            <span className="truncate text-right font-mono text-gray-500">
              <strong className={context.usedPercent >= 100 ? 'text-red-600' : 'text-gray-900'}>
                {compactTokens(context.used)} / {compactTokens(context.limit)} · {context.usedPercent}%
              </strong>
              {context.tokenMultiplier > 1 && <span> · cost ×{context.tokenMultiplier.toFixed(1)}</span>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={cn('h-full transition-[width] duration-500', contextDanger)}
              style={{ width: `${Math.min(100, context.usedPercent)}%` }}
            />
          </div>
          </section>
          <section aria-label="Weekly limit">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] md:text-xs">
            <span className="font-semibold text-gray-500">7-day limit</span>
            <span className="truncate text-right font-mono text-gray-500">
              <strong className={weekly.exhausted ? 'text-red-600' : 'text-gray-900'}>
                {weekly.exhausted ? 'Exhausted' : `${weekly.remainingPercent}%`}
              </strong>
              <span className="hidden sm:inline"> · resets {formatResetDate(weeklyResetAt)}</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={cn('h-full transition-[width] duration-500', weekly.exhausted ? 'bg-red-500' : 'bg-gray-950')}
              style={{ width: `${weekly.remainingPercent}%` }}
            />
          </div>
          </section>
        </div>
      </div>
    </footer>
  );
};
