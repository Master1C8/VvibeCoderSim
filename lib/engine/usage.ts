import { Personality } from './personality';
import type { DeploymentScheme, ProjectStrategy, WorkOperation } from './simulation';

export const CONTEXT_LIMITS: Record<Personality, number> = {
  Codex: 258_000,
  'Claude Code': 200_000,
  Gemini: 1_000_000,
  Grok: 256_000,
};

export const WEEKLY_TOKEN_BUDGET = 500_000;

const OPERATION_TOKEN_COSTS: Record<WorkOperation, number> = {
  search: 900,
  read: 2_400,
  modify: 5_200,
  create: 6_500,
  run: 3_000,
  fix: 7_800,
};

const OPERATION_CONTEXT_GROWTH: Record<WorkOperation, number> = {
  search: 420,
  read: 1_600,
  modify: 2_800,
  create: 3_400,
  run: 1_200,
  fix: 3_800,
};

const CHOICE_TOKEN_COSTS: Record<ProjectStrategy, number> = {
  quality: 9_000,
  product: 6_000,
  speed: 3_500,
};

const CHOICE_CONTEXT_GROWTH: Record<ProjectStrategy, number> = {
  quality: 1_400,
  product: 1_000,
  speed: 650,
};

const DEPLOYMENT_TOKEN_COSTS: Record<DeploymentScheme, number> = {
  canary: 5_500,
  blue_green: 6_500,
  rolling: 5_000,
  dns_switch: 4_500,
  migration_first: 7_500,
  direct_prod: 2_500,
};

interface TokenChargeInput {
  contextTokens: number;
  historyTokens: number;
  commandTokens: number;
  multiplier?: number;
}

export interface TokenCharge {
  inputTokens: number;
  commandTokens: number;
  totalTokens: number;
}

export const estimateTextTokens = (text: string) => {
  const cyrillicLength = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const otherLength = Math.max(0, text.length - cyrillicLength);
  return Math.max(1, Math.ceil(cyrillicLength / 2 + otherLength / 4));
};

export const getOperationCommandTokens = (operation: WorkOperation = 'read') => (
  OPERATION_TOKEN_COSTS[operation]
);

export const getOperationContextGrowth = (operation: WorkOperation = 'read') => (
  OPERATION_CONTEXT_GROWTH[operation]
);

interface DevelopmentCommandInput {
  strategy: ProjectStrategy;
  instruction: string;
  details?: string;
  deploymentScheme?: DeploymentScheme;
}

export const getDevelopmentCommandTokens = ({
  strategy,
  instruction,
  details = '',
  deploymentScheme,
}: DevelopmentCommandInput) => CHOICE_TOKEN_COSTS[strategy]
  + estimateTextTokens(`${instruction} ${details}`) * 4
  + (deploymentScheme ? DEPLOYMENT_TOKEN_COSTS[deploymentScheme] : 0);

export const getKickoffCommandTokens = (projectDescription: string) => (
  3_200 + estimateTextTokens(projectDescription) * 6
);

export const getChoiceContextGrowth = (
  strategy: ProjectStrategy,
  deploymentScheme?: DeploymentScheme,
) => CHOICE_CONTEXT_GROWTH[strategy] + (deploymentScheme ? 1_200 : 0);

export const calculateTokenCharge = ({
  contextTokens,
  historyTokens,
  commandTokens,
  multiplier = 1,
}: TokenChargeInput): TokenCharge => {
  const adjustedCommandTokens = Math.round(commandTokens * multiplier);
  const inputTokens = Math.max(0, Math.round(contextTokens + historyTokens));
  return {
    inputTokens,
    commandTokens: adjustedCommandTokens,
    totalTokens: inputTokens + adjustedCommandTokens,
  };
};

export const weeklyPercentToTokens = (percent: number) => (
  Math.max(0, percent) / 100 * WEEKLY_TOKEN_BUDGET
);

export const getNextWeeklyResetAt = (now = Date.now()) => {
  const reset = new Date(now);
  const daysUntilSunday = reset.getDay() === 0 ? 7 : 7 - reset.getDay();
  reset.setDate(reset.getDate() + daysUntilSunday);
  reset.setHours(0, 0, 0, 0);
  return reset.getTime();
};

interface ContextUsageInput {
  personality: Personality;
  contextTokens?: number;
  eventCount?: number;
  messageCount?: number;
}

export interface ContextUsage {
  limit: number;
  used: number;
  usedPercent: number;
  remainingPercent: number;
}

export interface ContextPressure extends ContextUsage {
  ratio: number;
  setbackBonus: number;
  tokenMultiplier: number;
}

interface WeeklyUsageInput {
  tokensSpent?: number;
  bonusTokens?: number;
}

export interface WeeklyUsage {
  tokensSpent: number;
  bonusTokens: number;
  chargeableTokens: number;
  usedPercent: number;
  remainingPercent: number;
  exhausted: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const getContextUsage = ({
  personality,
  contextTokens,
  eventCount = 0,
  messageCount = 0,
}: ContextUsageInput): ContextUsage => {
  const limit = CONTEXT_LIMITS[personality];
  const estimated = 16_800 + messageCount * 1_800 + eventCount * 4_800;
  const used = Math.max(0, contextTokens ?? estimated);
  const usedPercent = Math.round((used / limit) * 100);

  return {
    limit,
    used,
    usedPercent,
    remainingPercent: Math.max(0, 100 - usedPercent),
  };
};

export const getContextPressure = ({
  personality,
  contextTokens = 0,
}: Pick<ContextUsageInput, 'personality' | 'contextTokens'>): ContextPressure => {
  const usage = getContextUsage({ personality, contextTokens });
  const ratio = usage.used / usage.limit;
  const overflow = Math.max(0, ratio - 0.6);

  return {
    ...usage,
    ratio,
    setbackBonus: Math.min(0.5, overflow * 0.55),
    tokenMultiplier: 1 + Math.min(3.5, overflow * 2.5),
  };
};

export const getWeeklyUsage = ({
  tokensSpent = 0,
  bonusTokens = 0,
}: WeeklyUsageInput): WeeklyUsage => {
  const normalizedSpent = Math.max(0, tokensSpent);
  const normalizedBonus = Math.max(0, bonusTokens);
  const chargeableTokens = Math.max(0, normalizedSpent - normalizedBonus);
  const usedPercent = clamp(chargeableTokens / WEEKLY_TOKEN_BUDGET * 100, 0, 100);
  const exactRemainingPercent = 100 - usedPercent;
  const exhausted = usedPercent >= 100;
  const remainingPercent = exhausted ? 0 : Math.max(1, Math.round(exactRemainingPercent));

  return {
    tokensSpent: normalizedSpent,
    bonusTokens: normalizedBonus,
    chargeableTokens,
    usedPercent,
    remainingPercent,
    exhausted,
  };
};
