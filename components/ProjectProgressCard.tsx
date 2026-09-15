"use client"

import { Rocket } from 'lucide-react';
import { getDeploymentChanceBreakdown } from '@/lib/engine/decision';
import type { TaskState } from '@/lib/engine/simulation';
import { formatSpentTokens, type SimulationPhase } from '@/lib/game/session';
import { formatProgress } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Progress } from './ui/Progress';

interface ProjectProgressCardProps {
  task: TaskState;
  phase: SimulationPhase;
  deploymentMenuOpen: boolean;
  onOpenDeployment: () => void;
}

const signedPercent = (value: number) => `${value >= 0 ? '+' : ''}${value}%`;

export const ProjectProgressCard = ({
  task,
  phase,
  deploymentMenuOpen,
  onOpenDeployment,
}: ProjectProgressCardProps) => {
  const chance = getDeploymentChanceBreakdown(task);
  const thresholdReached = task.progress >= 95;
  const canOpenDeployment = thresholdReached
    && phase === 'choosing'
    && !task.deploymentRun
    && !deploymentMenuOpen;
  const activeStyle = thresholdReached
    ? 'bg-purple-600 text-white'
    : 'bg-gray-100 text-gray-400';

  return (
    <section className="shrink-0 rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm md:px-6">
      <div className="mb-3 flex min-w-0 items-center gap-3">
        <h1
          className="min-w-0 flex-1 truncate text-base font-semibold md:text-lg"
          title={`${task.name} (${Math.round(task.totalTokensSpent || 0).toLocaleString('en-US')} tokens)`}
        >
          {task.name}{' '}
          <span className="font-mono text-xs font-medium text-purple-600 md:text-sm">
            ({formatSpentTokens(task.totalTokensSpent || 0)} tok.)
          </span>
        </h1>

        <div className={cn('relative flex shrink-0 rounded-lg', activeStyle)}>
          <button
            type="button"
            onClick={onOpenDeployment}
            disabled={!canOpenDeployment}
            title={!thresholdReached ? 'Deployment unlocks at 95% project readiness' : 'Open production deployment options'}
            className="flex items-center gap-1.5 rounded-l-lg px-2.5 py-1.5 text-xs font-semibold transition hover:bg-black/10 disabled:cursor-not-allowed disabled:hover:bg-transparent sm:px-3"
          >
            <Rocket className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Deploy</span>
            <span>· {chance.total}%</span>
          </button>

          <button
            type="button"
            aria-label="How deployment chance is calculated"
            className="group/info relative flex w-7 items-center justify-center rounded-r-lg border-l border-current/20 text-[11px] font-bold transition hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
          >
            i
            <span
              role="tooltip"
              className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-64 translate-y-1 rounded-xl border border-gray-200 bg-white p-3 text-left text-xs font-normal text-gray-600 opacity-0 shadow-xl shadow-black/10 transition group-hover/info:translate-y-0 group-hover/info:opacity-100 group-focus-visible/info:translate-y-0 group-focus-visible/info:opacity-100"
            >
              <strong className="mb-2 block text-gray-900">How the chance is calculated</strong>
              <span className="mb-2 block border-b border-gray-100 pb-2">
                Deployment attempts require at least 95% project readiness.
              </span>
              <span className="flex justify-between gap-3"><span>Base chance</span><b className="text-gray-900">{chance.base}%</b></span>
              <span className="mt-1 flex justify-between gap-3"><span>Decision modifiers</span><b className="text-gray-900">{signedPercent(chance.decisionModifier)}</b></span>
              <span className="mt-1 flex justify-between gap-3"><span>Project readiness</span><b className="text-gray-900">{signedPercent(chance.progressModifier)}</b></span>
              <span className="mt-1 flex justify-between gap-3"><span>Past failures</span><b className="text-gray-900">{signedPercent(chance.failedDeploymentModifier)}</b></span>
              <span className="mt-2 flex justify-between gap-3 border-t border-gray-100 pt-2"><span>Total</span><b className="text-purple-700">{chance.total}%</b></span>
            </span>
          </button>
        </div>

        <span className="shrink-0 font-mono text-xs font-semibold text-gray-500">
          {formatProgress(task.progress)}
        </span>
      </div>
      <Progress value={task.progress} className="h-1.5 bg-gray-100" />
    </section>
  );
};
