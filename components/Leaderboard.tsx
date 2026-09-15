import { Crown, Loader2 } from 'lucide-react';
import type { LeaderboardSnapshot } from '@/lib/game/leaderboard';
import { formatSpentTokens } from '@/lib/game/session';
import { cn } from '@/lib/utils';

interface LeaderboardProps {
  snapshot: LeaderboardSnapshot | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  currentId: string;
  onSubmit: () => void;
}

export const Leaderboard = ({ snapshot, status, currentId, onSubmit }: LeaderboardProps) => {
  const currentIsVisible = Boolean(snapshot?.entries.some(entry => entry.id === currentId));

  return (
    <section className="mt-5 border-t border-emerald-200 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-emerald-950">
          <Crown className="h-4 w-4 text-amber-500" />
          Token-efficient vibe coders
        </h3>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Fewer tokens rank higher</span>
      </div>

      {status === 'idle' && (
        <div className="mt-4 rounded-xl border border-emerald-100 bg-white/70 p-3">
          <p className="text-sm leading-6 text-emerald-800">
            Joining is optional. Your project name, generated coder aliases, token total, and failed deployment count will appear publicly.
          </p>
          <button
            type="button"
            onClick={onSubmit}
            className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            Join the public leaderboard
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-100 bg-white/70 px-3 py-4 text-sm text-emerald-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Writing your result into history…
        </div>
      )}

      {status === 'error' && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          The leaderboard did not respond. Your deploy is no less successful for it.
        </p>
      )}

      {status === 'ready' && snapshot && (
        <>
          <div className="mt-3 overflow-x-auto rounded-xl border border-emerald-100 bg-white/80">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-emerald-700">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Rank</th>
                  <th className="px-3 py-2.5 font-semibold">Project</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Tokens</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Failures</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.entries.map((entry, index) => (
                  <tr key={entry.id} className={cn('border-t border-emerald-100', entry.id === currentId && 'bg-emerald-100/70')}>
                    <td className="px-3 py-3 font-mono font-bold text-emerald-900">#{index + 1}</td>
                    <td className="max-w-[260px] px-3 py-3">
                      <p className="truncate font-semibold text-emerald-950">{entry.projectName}</p>
                      <p className="mt-0.5 truncate text-xs text-emerald-700">{entry.programmerNames.join(' → ')}</p>
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-emerald-950">{formatSpentTokens(entry.totalTokensSpent)}</td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-800">{entry.failedDeployments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!currentIsVisible && snapshot.currentEntry && snapshot.currentRank && (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-100/70 px-3 py-2.5 text-sm text-emerald-900">
              <span><strong>Your result is #{snapshot.currentRank}</strong> of {snapshot.totalEntries}</span>
              <span className="font-mono font-bold">{formatSpentTokens(snapshot.currentEntry.totalTokensSpent)}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
};
