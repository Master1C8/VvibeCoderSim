import type { Personality } from './personality';
import {
  calculateTokenCharge,
  estimateTextTokens,
  getContextPressure,
  getNextWeeklyResetAt,
  WEEKLY_TOKEN_BUDGET,
  weeklyPercentToTokens,
} from './usage';

const PREVIOUS_WEEKLY_TOKEN_BUDGET = 2_500_000;

export interface TokenLedgerState {
  personality: Personality;
  contextTokens?: number;
  chatHistoryTokens: number;
  totalTokensSpent: number;
  programmerTokensSpent: number;
  weeklyTokensSpent?: number;
  weeklyTokenBonus?: number;
  weeklyTokenBudget?: number;
  /** @deprecated save migration only */
  weeklyUsagePercent?: number;
  /** @deprecated save migration only */
  weeklyAllowanceBonus?: number;
  weeklyResetAt?: number;
}

interface ChargeTokenCallInput {
  commandTokens: number;
  userText?: string;
  assistantText?: string;
  contextText?: string;
  contextGrowthTokens?: number;
  now?: number;
}

interface RecordWorkContextInput {
  contextGrowthTokens?: number;
  contextText?: string;
}

const textTokens = (text?: string) => text?.trim() ? estimateTextTokens(text) : 0;

export const normalizeWeeklyPeriod = <T extends TokenLedgerState>(
  state: T,
  now = Date.now(),
): T => {
  const resetAt = state.weeklyResetAt || getNextWeeklyResetAt(now);
  const weeklyTokensSpent = state.weeklyTokensSpent
    === undefined
    ? weeklyPercentToTokens(state.weeklyUsagePercent || 0)
    : Math.round(state.weeklyTokensSpent * WEEKLY_TOKEN_BUDGET / (
        state.weeklyTokenBudget && state.weeklyTokenBudget > 0
          ? state.weeklyTokenBudget
          : PREVIOUS_WEEKLY_TOKEN_BUDGET
      ));
  const weeklyTokenBonus = state.weeklyTokenBonus
    === undefined
    ? weeklyPercentToTokens(state.weeklyAllowanceBonus || 0)
    : Math.round(state.weeklyTokenBonus * WEEKLY_TOKEN_BUDGET / (
        state.weeklyTokenBudget && state.weeklyTokenBudget > 0
          ? state.weeklyTokenBudget
          : PREVIOUS_WEEKLY_TOKEN_BUDGET
      ));
  if (now < resetAt) {
    if (
      state.weeklyResetAt === resetAt
      && state.weeklyTokensSpent === weeklyTokensSpent
      && state.weeklyTokenBonus === weeklyTokenBonus
      && state.weeklyTokenBudget === WEEKLY_TOKEN_BUDGET
    ) return state;
    return {
      ...state,
      weeklyTokensSpent,
      weeklyTokenBonus,
      weeklyTokenBudget: WEEKLY_TOKEN_BUDGET,
      weeklyResetAt: resetAt,
    };
  }

  return {
    ...state,
    weeklyTokensSpent: 0,
    weeklyTokenBonus: 0,
    weeklyTokenBudget: WEEKLY_TOKEN_BUDGET,
    weeklyUsagePercent: undefined,
    weeklyAllowanceBonus: undefined,
    weeklyResetAt: getNextWeeklyResetAt(now),
  };
};

export const appendChatHistory = <T extends TokenLedgerState>(state: T, text: string): T => ({
  ...state,
  chatHistoryTokens: (state.chatHistoryTokens || 0) + textTokens(text),
});

/**
 * Tool output becomes part of the next model call's working context, but is not
 * an independent model call. Keeping this separate prevents UI work steps from
 * charging the whole prompt repeatedly merely because they are animated one by
 * one.
 */
export const recordWorkContext = <T extends TokenLedgerState>(
  state: T,
  input: RecordWorkContextInput,
): T => ({
  ...state,
  contextTokens: (state.contextTokens || 0)
    + Math.max(0, Math.round(input.contextGrowthTokens || 0))
    + textTokens(input.contextText),
});

export const chargeTokenCall = <T extends TokenLedgerState>(
  rawState: T,
  input: ChargeTokenCallInput,
): T => {
  const state = normalizeWeeklyPeriod(rawState, input.now);
  const historyWithUserInput = (state.chatHistoryTokens || 0) + textTokens(input.userText);
  const contextTokens = state.contextTokens || 0;
  const contextPressure = getContextPressure({
    personality: state.personality,
    contextTokens,
  });
  const charge = calculateTokenCharge({
    contextTokens,
    historyTokens: historyWithUserInput,
    commandTokens: input.commandTokens,
    multiplier: contextPressure.tokenMultiplier,
  });

  return {
    ...state,
    contextTokens: contextTokens
      + Math.max(0, Math.round(input.contextGrowthTokens || 0))
      + textTokens(input.contextText),
    chatHistoryTokens: historyWithUserInput + textTokens(input.assistantText),
    totalTokensSpent: (state.totalTokensSpent || 0) + charge.totalTokens,
    programmerTokensSpent: (state.programmerTokensSpent || 0) + charge.totalTokens,
    weeklyTokensSpent: (state.weeklyTokensSpent || 0) + charge.totalTokens,
  };
};
