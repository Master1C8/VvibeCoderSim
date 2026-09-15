import type { Personality } from '../engine/personality';
import type { SimulationChoice } from '../engine/decision';
import type { EventType, TaskState, WorkOperation } from '../engine/simulation';
import { appendChatHistory } from '../engine/token-ledger';

export type SimulationPhase = 'setup' | 'responding' | 'working' | 'choosing' | 'paywall' | 'dead' | 'victory';
export type ChatRole = 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  model?: Personality;
  eventType?: EventType;
  impact?: number;
  operation?: WorkOperation;
  target?: string;
  isDecisionPrompt?: boolean;
}

export const STORAGE_KEY = 'vvibe-tasks-reigns-v1';
export const SAVE_VERSION = 2;
export const PERSONALITIES: Personality[] = ['Codex', 'Claude Code', 'Gemini', 'Grok'];

export const PAYWALL_OPTIONS = [
  {
    kind: 'small_payment',
    label: 'Pay Codex a little',
    description: 'Spend 5 Money for another 20% of the weekly allowance. Codex will call it a support payment.',
    moneyCost: 5,
    allowancePercent: 20,
    resourceEffects: { money: -5 },
  },
  {
    kind: 'large_payment',
    label: 'Pay Codex a lot',
    description: 'Spend 10 Money for a full weekly allowance. Almost like a subscription, guilt included.',
    moneyCost: 10,
    allowancePercent: 100,
    resourceEffects: { money: -10 },
  },
  {
    kind: 'free_models',
    label: 'Try the free models',
    description: 'Gain a third of the weekly allowance by sacrificing project quality, motivation, and team relations.',
    allowancePercent: 100 / 3,
    progressPenalty: 7,
    resourceEffects: { motivation: -9, team: -11 },
  },
  {
    kind: 'self_code',
    label: 'Try coding it yourself',
    description: 'No tokens required. As it soon turns out, neither is the current programmer.',
  },
] as const;
export type PaywallOption = (typeof PAYWALL_OPTIONS)[number];

export const LIMIT_MESSAGE = 'You are out of tokens. Codex has taken its hands off the keyboard and opened four financial and technical ways forward.';

export interface SavedGame {
  version: typeof SAVE_VERSION;
  task: TaskState;
  phase: SimulationPhase;
  workStepIndex: number;
  workStepTotal: number;
  workStepDelay: number;
}

export interface VictoryShareInput {
  projectName: string;
  programmerNames: string[];
  totalTokensSpent: number;
  failedDeployments: number;
  currentProgrammerTokensSpent?: number;
  contextTokens?: number;
}

export const formatEnglishCount = (count: number, singular: string, plural = `${singular}s`) => (
  `${count} ${Math.abs(Math.round(count)) === 1 ? singular : plural}`
);

export const getVictoryShareText = ({
  projectName,
  programmerNames,
  failedDeployments,
}: VictoryShareInput) => (
  `Project “${projectName}” made it to production: `
  + `${formatEnglishCount(programmerNames.length, 'vibe coder')}, `
  + `${formatEnglishCount(failedDeployments, 'failed deploy')}.`
);

export const getVictoryResultUrl = (origin: string, result: VictoryShareInput) => {
  const url = new URL('/result', origin);
  url.searchParams.set('project', result.projectName);
  result.programmerNames.forEach(name => url.searchParams.append('coder', name));
  url.searchParams.set('tokens', String(Math.round(result.totalTokensSpent)));
  url.searchParams.set('final', String(Math.round(result.currentProgrammerTokensSpent || 0)));
  url.searchParams.set('context', String(Math.round(result.contextTokens || 0)));
  url.searchParams.set('fails', String(Math.round(result.failedDeployments)));
  return url.toString();
};

const readShareNumber = (value: string | null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

export const parseVictoryShareParams = (params: URLSearchParams): VictoryShareInput => {
  const programmerNames = params.getAll('coder')
    .map(name => name.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 8);

  return {
    projectName: (params.get('project') || 'Untitled project').trim().slice(0, 80),
    programmerNames: programmerNames.length ? programmerNames : ['Unknown vibe coder'],
    totalTokensSpent: readShareNumber(params.get('tokens')),
    currentProgrammerTokensSpent: readShareNumber(params.get('final')),
    contextTokens: readShareNumber(params.get('context')),
    failedDeployments: readShareNumber(params.get('fails')),
  };
};

export const getTelegramShareUrl = (url: string, text: string) => (
  `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text.trim())}`
);

export const formatSpentTokens = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
};

interface ScrollPosition {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export const isNearChatBottom = (position: ScrollPosition, threshold = 72) => (
  position.scrollHeight - position.scrollTop - position.clientHeight <= threshold
);

export const OPERATION_LABELS: Record<WorkOperation, string> = {
  search: 'Searched', read: 'Read', modify: 'Modified', create: 'Created', run: 'Ran', fix: 'Fixed',
};

export const OPERATION_STYLES: Record<WorkOperation, string> = {
  search: 'bg-gray-200 text-gray-600',
  read: 'bg-slate-200 text-slate-600',
  modify: 'bg-blue-100 text-blue-700',
  create: 'bg-emerald-100 text-emerald-700',
  run: 'bg-purple-100 text-purple-700',
  fix: 'bg-amber-100 text-amber-700',
};

export const FALLBACK_TOOL_STEPS: Array<{ operation: WorkOperation; target: string; description: string }> = [
  { operation: 'search', target: 'rg --files app components lib', description: 'Indexed the project structure.' },
  { operation: 'read', target: 'package.json', description: 'Checked the stack and available scripts.' },
  { operation: 'read', target: 'app/page.tsx', description: 'Mapped the current UI and data flow.' },
  { operation: 'modify', target: 'app/page.tsx', description: 'Built the primary user journey.' },
  { operation: 'run', target: 'npm run build', description: 'Verified the production build.' },
];

export const makeMessage = (
  role: ChatRole,
  text: string,
  extra: Partial<Omit<ChatMessage, 'id' | 'role' | 'text'>> = {},
): ChatMessage => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  role,
  text,
  ...extra,
});

export const isStoredTask = (value: unknown): value is TaskState => {
  if (!value || typeof value !== 'object') return false;
  const task = value as Partial<TaskState>;
  const optionalNumbers = [
    task.contextTokens,
    task.chatHistoryTokens,
    task.totalTokensSpent,
    task.programmerTokensSpent,
    task.weeklyTokensSpent,
    task.weeklyTokenBonus,
    task.weeklyTokenBudget,
    task.weeklyUsagePercent,
    task.weeklyAllowanceBonus,
    task.weeklyResetAt,
    task.deploymentChance,
    task.failedDeployments,
  ];
  return Boolean(
    task.id && task.personality && task.resources
    && typeof task.resources.money === 'number'
    && typeof task.resources.motivation === 'number'
    && typeof task.resources.team === 'number',
  ) && optionalNumbers.every(item => item === undefined || (Number.isFinite(item) && item >= 0));
};

export const choicesAsHistory = (choices: SimulationChoice[]) => choices
  .map(choice => `${choice.label}: ${choice.description}`)
  .join('\n');

export const appendHistoryTexts = (task: TaskState, texts: Array<string | undefined>) => {
  const text = texts.filter((value): value is string => Boolean(value?.trim())).join('\n');
  return text ? appendChatHistory(task, text) : task;
};
