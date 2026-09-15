"use client"

import type { Ref, UIEventHandler } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Rocket, Send, Sparkles, Terminal, Trophy, UserPlus } from 'lucide-react';
import type { SimulationChoice } from '@/lib/engine/decision';
import type { ChatMessage, PaywallOption, SimulationPhase } from '@/lib/game/session';
import { formatSpentTokens, OPERATION_LABELS, OPERATION_STYLES, PAYWALL_OPTIONS } from '@/lib/game/session';
import { cn } from '@/lib/utils';
import { ChoiceEffects, ResourceEffectBadges } from './ChoiceEffects';
import type { LeaderboardSnapshot } from '@/lib/game/leaderboard';
import { Leaderboard } from './Leaderboard';

interface ChatPanelProps {
  viewportRef: Ref<HTMLElement>;
  messages: ChatMessage[];
  activeDecisionMessageId: string | null;
  phase: SimulationPhase;
  isBusy: boolean;
  workStepIndex: number;
  workStepTotal: number;
  choices: SimulationChoice[];
  projectName: string;
  programmerName: string;
  programmerNames: string[];
  totalTokensSpent: number;
  currentProgrammerTokensSpent: number;
  contextTokens: number;
  failedDeployments: number;
  shareFeedback: string;
  leaderboardSnapshot: LeaderboardSnapshot | null;
  leaderboardStatus: 'idle' | 'loading' | 'ready' | 'error';
  leaderboardCurrentId: string;
  onViewportScroll: UIEventHandler<HTMLElement>;
  onSelectChoice: (choice: SimulationChoice) => void;
  onSelectPaywallOption: (option: PaywallOption) => void;
  onHireSuccessor: () => void;
  onShareTelegram: () => void;
  onSubmitLeaderboard: () => void;
  onReset: () => void;
}

export const ChatPanel = ({
  viewportRef,
  messages,
  activeDecisionMessageId,
  phase,
  isBusy,
  workStepIndex,
  workStepTotal,
  choices,
  projectName,
  programmerName,
  programmerNames,
  totalTokensSpent,
  currentProgrammerTokensSpent,
  contextTokens,
  failedDeployments,
  shareFeedback,
  leaderboardSnapshot,
  leaderboardStatus,
  leaderboardCurrentId,
  onViewportScroll,
  onSelectChoice,
  onSelectPaywallOption,
  onHireSuccessor,
  onShareTelegram,
  onSubmitLeaderboard,
  onReset,
}: ChatPanelProps) => (
  <section ref={viewportRef} onScroll={onViewportScroll} className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-gray-100 bg-white p-5 shadow-sm custom-scrollbar md:p-7">
    <div className="flex min-h-full flex-col justify-end gap-6">
      <AnimatePresence initial={false}>
        {messages.map(message => {
          if (message.role === 'user') return (
            <motion.div key={message.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
              <div className="max-w-[82%] rounded-2xl rounded-tr-md bg-gray-900 px-4 py-3 text-sm leading-6 text-white md:text-[15px]">{message.text}</div>
            </motion.div>
          );
          if (message.role === 'tool') {
            const isError = message.eventType === 'setback' || (message.impact || 0) < 0;
            const isDone = (message.impact || 0) > 0;
            return (
              <motion.div key={message.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn('ml-11 rounded-xl border px-3.5 py-3 text-xs leading-5 md:text-sm', isError ? 'border-red-100 bg-red-50/70 text-red-700' : 'border-gray-100 bg-gray-50/80 text-gray-600')}>
                <div className="flex min-w-0 items-center gap-2">
                  {isError ? <AlertCircle className="h-3.5 w-3.5 shrink-0" /> : isDone ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <Terminal className="h-3.5 w-3.5 shrink-0" />}
                  {message.operation && <span className={cn('shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase', OPERATION_STYLES[message.operation])}>{OPERATION_LABELS[message.operation]}</span>}
                  {message.target && <code className="truncate font-mono text-[11px] font-semibold text-gray-700 md:text-xs">{message.target}</code>}
                </div>
                <p className="mt-1.5 pl-5 text-xs leading-5 text-gray-500 md:text-[13px]">{message.text}</p>
              </motion.div>
            );
          }
          return (
            <motion.div key={message.id} data-message-id={message.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black text-white"><Sparkles className="h-3.5 w-3.5" /></div>
              <div className="min-w-0 max-w-2xl pt-0.5">
                <p className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-900"><span>{message.model}</span>{message.id === activeDecisionMessageId && <span className="text-emerald-600">Waiting for your decision</span>}</p>
                <p className="whitespace-pre-line text-sm leading-6 text-gray-700 md:text-[15px] md:leading-7">{message.text}</p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {isBusy && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ml-11 flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{phase === 'responding' ? 'Starting…' : `Working on the project… ${workStepIndex + 1}/${workStepTotal}`}</span>
        </motion.div>
      )}

      {phase === 'choosing' && choices.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="ml-11 grid max-w-2xl gap-2">
          {choices.map((choice, index) => (
            <button key={choice.id} onClick={() => onSelectChoice(choice)} className="group flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-left transition hover:border-gray-300 hover:bg-gray-50">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold text-gray-500">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-5 text-gray-900">{choice.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-gray-500">{choice.description}</p>
                <ChoiceEffects choice={choice} />
              </div>
              {choice.deploymentScheme ? <Rocket className="h-4 w-4 shrink-0 text-purple-400" /> : <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 transition group-hover:translate-x-0.5" />}
            </button>
          ))}
        </motion.div>
      )}

      {phase === 'paywall' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="ml-11 max-w-2xl rounded-2xl border border-red-200 bg-red-50/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-red-700">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm font-semibold">Out of tokens · Codex has presented the options</p>
          </div>
          <div className="grid gap-2">
            {PAYWALL_OPTIONS.map((option, index) => (
              <button key={option.label} onClick={() => onSelectPaywallOption(option)} className="group flex w-full items-center gap-3 rounded-xl border border-red-100 bg-white px-3.5 py-3 text-left transition hover:border-red-300 hover:bg-red-50">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-red-100 text-xs font-semibold text-red-600">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{option.label}</p>
                  <p className="mt-0.5 text-xs leading-5 text-gray-500">{option.description}</p>
                  {'resourceEffects' in option && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <ResourceEffectBadges resourceEffects={option.resourceEffects} />
                    </div>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-red-200 transition group-hover:translate-x-0.5 group-hover:text-red-500" />
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {phase === 'dead' && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={onHireSuccessor}
          className="ml-11 flex max-w-2xl items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-purple-700"
        >
          <UserPlus className="h-4 w-4" />
          Hire the next vibe coder
        </motion.button>
      )}

      {phase === 'victory' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="ml-11 max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5">
          <div className="flex items-start gap-3">
            <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-emerald-950">Congratulations! The deploy outlived everyone</h2>
              <p className="mt-1 text-sm leading-6 text-emerald-800">
                Project “{projectName}” made it to production. {programmerName} pressed the final button, and the infrastructure chose not to object.
              </p>

              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Coders who worked on it · {programmerNames.length}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {programmerNames.map((name, index) => (
                    <span key={`${name}-${index}`} className="rounded-md border border-emerald-200 bg-white/80 px-2 py-1 text-xs font-medium text-emerald-900">
                      {index + 1}. {name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-emerald-100 bg-white/75 p-2.5">
                  <p className="text-[10px] font-medium text-emerald-700">Total tokens</p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-emerald-950">{formatSpentTokens(totalTokensSpent)}</p>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-white/75 p-2.5">
                  <p className="text-[10px] font-medium text-emerald-700">Final coder</p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-emerald-950">{formatSpentTokens(currentProgrammerTokensSpent)}</p>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-white/75 p-2.5">
                  <p className="text-[10px] font-medium text-emerald-700">Context</p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-emerald-950">{formatSpentTokens(contextTokens)}</p>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-white/75 p-2.5">
                  <p className="text-[10px] font-medium text-emerald-700">Failures</p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-emerald-950">{failedDeployments}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={onShareTelegram} className="flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-600">
                  <Send className="h-4 w-4" /> Share on Telegram
                </button>
                <button onClick={onReset} className="rounded-lg border border-emerald-300 bg-white/70 px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-white">Start a new project</button>
              </div>
              {shareFeedback && <p className="mt-2 text-xs text-emerald-700">{shareFeedback}</p>}

              <Leaderboard
                snapshot={leaderboardSnapshot}
                status={leaderboardStatus}
                currentId={leaderboardCurrentId}
                onSubmit={onSubmitLeaderboard}
              />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  </section>
);
