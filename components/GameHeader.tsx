"use client"

import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Edit3, Sparkles } from 'lucide-react';
import type { Personality } from '@/lib/engine/personality';
import type { TaskState } from '@/lib/engine/simulation';
import { formatSpentTokens, PERSONALITIES } from '@/lib/game/session';
import { cn } from '@/lib/utils';
import { HeaderResources } from './ResourceDashboard';

interface GameHeaderProps {
  personality: Personality;
  task?: TaskState;
  menuOpen: boolean;
  modelLocked: boolean;
  newTaskDisabled: boolean;
  onToggleMenu: () => void;
  onSelectModel: (model: Personality) => void;
  onReset: () => void;
}

export const GameHeader = ({
  personality,
  task,
  menuOpen,
  modelLocked,
  newTaskDisabled,
  onToggleMenu,
  onSelectModel,
  onReset,
}: GameHeaderProps) => (
  <header className="sticky top-0 z-20 grid h-14 grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-gray-100 bg-white/90 px-3 backdrop-blur sm:gap-4 sm:px-5 md:px-8">
    <div className="flex items-center gap-1 sm:gap-2">
      <div className="relative">
        <button
          onClick={onToggleMenu}
          disabled={modelLocked}
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-black text-white"><Sparkles className="h-3.5 w-3.5" /></div>
          <span className="hidden text-[15px] font-semibold sm:inline">{personality}</span>
          <ChevronDown className={cn('hidden h-4 w-4 text-gray-400 transition-transform sm:block', menuOpen && 'rotate-180')} />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              role="listbox"
              className="absolute left-0 top-11 z-50 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl shadow-black/10"
            >
              <p className="px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Model</p>
              {PERSONALITIES.map(model => {
                const isAvailable = model === 'Codex';
                return (
                  <button
                    key={model}
                    role="option"
                    aria-selected={personality === model}
                    aria-disabled={!isAvailable}
                    disabled={!isAvailable}
                    onClick={() => onSelectModel(model)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition',
                      !isAvailable && 'cursor-not-allowed text-gray-300',
                      isAvailable && personality === model && 'bg-gray-100 font-semibold text-gray-950',
                      isAvailable && personality !== model && 'text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    <span>{model}</span>
                    {isAvailable && personality === model && <Check className="h-4 w-4 text-emerald-600" />}
                    {!isAvailable && <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-300">Unavailable</span>}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {task && (
        <button
          type="button"
          onClick={onReset}
          disabled={newTaskDisabled}
          title="Start a new task"
          className="flex items-center gap-1.5 rounded-lg border border-purple-100 bg-purple-50 px-2 py-1.5 text-xs font-medium text-purple-700 transition hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50 sm:px-2.5"
        >
          <Edit3 className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">New task</span>
        </button>
      )}
    </div>
    <div className="min-w-0">{task && <HeaderResources resources={task.resources} />}</div>
    <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500 text-[9px] font-bold text-white">{task?.programmerName.slice(0, 2).toUpperCase() || 'P'}</div>
      <div className="hidden min-w-0 max-w-40 flex-col md:flex">
        <span className="truncate leading-tight">{task?.programmerName || 'Programmer'}</span>
        {task && (
          <span
            className="font-mono text-[10px] font-semibold leading-tight text-purple-600"
            title={`${Math.round(task.programmerTokensSpent || 0).toLocaleString('en-US')} tokens spent by this programmer`}
          >
            {formatSpentTokens(task.programmerTokensSpent || 0)} tok.
          </span>
        )}
      </div>
    </div>
  </header>
);
