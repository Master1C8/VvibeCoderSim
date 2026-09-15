import assert from 'node:assert/strict';
import test from 'node:test';
import { DecisionEngine, getDeploymentChance, getDeploymentChanceBreakdown } from '../lib/engine/decision';
import { HIDDEN_EFFECT_OUTCOME_LINES, UNCERTAIN_EFFECT_NARRATIVES } from '../lib/engine/decision-copy';
import {
  createSuccessor,
  ensureProgrammerIdentity,
  getExtremeState,
  getProgrammerDepartureMessage,
  getSelfCodingDepartureMessage,
  RESOURCE_HIGH_LIMIT,
  RESOURCE_LOW_LIMIT,
  getResourceIndicatorPosition,
} from '../lib/engine/resources';
import { SimulationEngine, type TaskState } from '../lib/engine/simulation';
import { chargeTokenCall, normalizeWeeklyPeriod } from '../lib/engine/token-ledger';
import { estimateTextTokens, getWeeklyUsage, WEEKLY_TOKEN_BUDGET, weeklyPercentToTokens } from '../lib/engine/usage';
import {
  getTelegramShareUrl,
  getVictoryResultUrl,
  getVictoryShareText,
  isNearChatBottom,
  parseVictoryShareParams,
  PAYWALL_OPTIONS,
} from '../lib/game/session';
import {
  getLeaderboardSnapshot,
  type LeaderboardEntry,
  sortLeaderboardEntries,
  upsertLeaderboardEntry,
} from '../lib/game/leaderboard';

const makeTask = (): TaskState => ({
  id: 'test-task',
  name: 'Test Project',
  progress: 25,
  momentum: 0,
  history: [],
  lastUpdate: 1_700_000_000_000,
  status: 'Active',
  personality: 'Codex',
  resources: { money: 50, motivation: 50, team: 50 },
  programmerGeneration: 1,
  programmerName: 'Button Masher',
  programmerNameCounts: { 'Button Masher': 1 },
  contextTokens: 100,
  chatHistoryTokens: 50,
  totalTokensSpent: 0,
  programmerTokensSpent: 0,
  weeklyTokensSpent: 0,
  weeklyTokenBonus: 0,
  weeklyTokenBudget: WEEKLY_TOKEN_BUDGET,
  weeklyResetAt: 4_000_000_000_000,
  deploymentChance: 10,
});

test('ledger charges context, history and command once', () => {
  const charged = chargeTokenCall(makeTask(), {
    commandTokens: 100,
    contextGrowthTokens: 20,
    contextText: 'test',
  });

  assert.equal(charged.totalTokensSpent, 250);
  assert.equal(charged.programmerTokensSpent, 250);
  assert.equal(charged.weeklyTokensSpent, 250);
  assert.equal(charged.contextTokens, 121);
  assert.equal(charged.chatHistoryTokens, 50);
});

test('user input participates in the current call and assistant text only in future history', () => {
  const charged = chargeTokenCall(makeTask(), {
    commandTokens: 100,
    userText: 'test',
    assistantText: 'done',
  });

  assert.equal(charged.totalTokensSpent, 251);
  assert.equal(charged.chatHistoryTokens, 52);
  assert.equal(charged.contextTokens, 100);
});

test('Cyrillic text receives a language-aware estimate', () => {
  assert.equal(estimateTextTokens('test'), 1);
  assert.equal(estimateTextTokens('\u0442\u0435\u0441\u0442'), 2);
});

test('weekly limit does not exhaust from display rounding', () => {
  const usage = getWeeklyUsage({ tokensSpent: weeklyPercentToTokens(99.6) });
  assert.equal(usage.remainingPercent, 1);
  assert.equal(usage.exhausted, false);
});

test('weekly period clears raw usage and purchased allowance at the boundary', () => {
  const state = makeTask();
  const now = 1_800_000_000_000;
  const normalized = normalizeWeeklyPeriod({
    ...state,
    weeklyTokensSpent: weeklyPercentToTokens(87),
    weeklyTokenBonus: weeklyPercentToTokens(20),
    weeklyResetAt: now - 1,
  }, now);

  assert.equal(normalized.weeklyTokensSpent, 0);
  assert.equal(normalized.weeklyTokenBonus, 0);
  assert.ok((normalized.weeklyResetAt || 0) > now);
});

test('legacy percentage saves migrate to exact weekly token counters', () => {
  const state = makeTask();
  const normalized = normalizeWeeklyPeriod({
    ...state,
    weeklyTokensSpent: undefined,
    weeklyTokenBonus: undefined,
    weeklyTokenBudget: undefined,
    weeklyUsagePercent: 40,
    weeklyAllowanceBonus: 20,
  });

  assert.equal(normalized.weeklyTokensSpent, weeklyPercentToTokens(40));
  assert.equal(normalized.weeklyTokenBonus, weeklyPercentToTokens(20));
});

test('old exact counters preserve their percentages after the weekly budget rebalance', () => {
  const normalized = normalizeWeeklyPeriod({
    ...makeTask(),
    weeklyTokensSpent: 250_000,
    weeklyTokenBonus: 500_000,
    weeklyTokenBudget: undefined,
  });

  assert.equal(WEEKLY_TOKEN_BUDGET, 500_000);
  assert.equal(normalized.weeklyTokensSpent, 50_000);
  assert.equal(normalized.weeklyTokenBonus, 100_000);
  assert.equal(normalized.weeklyTokenBudget, WEEKLY_TOKEN_BUDGET);
});

test('the rebalanced weekly limit visibly spends during early calls', () => {
  const usage = getWeeklyUsage({ tokensSpent: 25_000 });
  assert.equal(usage.usedPercent, 5);
  assert.equal(usage.remainingPercent, 95);
});

test('token exhaustion offers only the four designed outcomes', () => {
  assert.deepEqual(PAYWALL_OPTIONS.map(option => option.kind), [
    'small_payment',
    'large_payment',
    'free_models',
    'self_code',
  ]);
  assert.deepEqual(
    PAYWALL_OPTIONS
      .filter(option => option.kind === 'small_payment' || option.kind === 'large_payment')
      .map(option => option.moneyCost),
    [5, 10],
  );
  assert.deepEqual(PAYWALL_OPTIONS[0].resourceEffects, { money: -5 });
  assert.deepEqual(PAYWALL_OPTIONS[1].resourceEffects, { money: -10 });

  const freeModels = PAYWALL_OPTIONS.find(option => option.kind === 'free_models');
  assert.ok(freeModels);
  assert.ok(Math.abs(
    weeklyPercentToTokens(freeModels.allowancePercent) - WEEKLY_TOKEN_BUDGET / 3,
  ) < 0.000001);
  assert.ok(freeModels.progressPenalty > 0);
  assert.ok(Object.values(freeModels.resourceEffects).every(effect => effect < 0));

  const selfCodingMessage = getSelfCodingDepartureMessage('Button Masher');
  assert.ok(selfCodingMessage.includes('MANUAL MODE'));
  assert.ok(selfCodingMessage.includes('Button Masher'));
});

test('animated work events grow context without pretending to be extra model calls', () => {
  const state = makeTask();
  const next = SimulationEngine.calculateNextState(state);

  assert.ok((next.contextTokens || 0) > (state.contextTokens || 0));
  assert.equal(next.totalTokensSpent, state.totalTokensSpent);
  assert.equal(next.programmerTokensSpent, state.programmerTokensSpent);
  assert.equal(next.weeklyTokensSpent, state.weeklyTokensSpent);
});

test('hidden choice markers and their resolved effects are stable for the same state', () => {
  const task = makeTask();
  const firstChoices = DecisionEngine.generateChoices(task);
  const secondChoices = DecisionEngine.generateChoices(task);

  assert.deepEqual(
    firstChoices.map(choice => choice.hiddenResourceEffects),
    secondChoices.map(choice => choice.hiddenResourceEffects),
  );

  const firstResult = DecisionEngine.applyChoice(task, firstChoices[0]);
  const secondResult = DecisionEngine.applyChoice(task, secondChoices[0]);
  assert.deepEqual(firstResult.resources, secondResult.resources);
  assert.equal(firstResult.totalTokensSpent, secondResult.totalTokensSpent);
});

test('a choice has at most one unclear effect and reports its non-zero outcome first', () => {
  const baseTask = makeTask();
  const seenOutcomes = new Set<'positive' | 'negative'>();
  let hiddenChoiceCount = 0;

  for (let historyLength = 0; historyLength <= 50; historyLength += 1) {
    const task = {
      ...baseTask,
      history: Array.from({ length: historyLength }, (_, index) => ({
        type: 'neutral' as const,
        description: `Check ${index}`,
        impact: 0,
      })),
    };

    for (const choice of DecisionEngine.generateChoices(task)) {
      assert.ok(choice.hiddenResourceEffects.length <= 1);
      const resource = choice.hiddenResourceEffects[0];
      if (!resource) continue;

      hiddenChoiceCount += 1;
      assert.ok(choice.description.endsWith(UNCERTAIN_EFFECT_NARRATIVES[resource]));
      const result = DecisionEngine.applyChoice(task, choice);
      const delta = result.resources[resource] - task.resources[resource];
      assert.notEqual(delta, 0);
      const outcome = delta > 0 ? 'positive' : 'negative';
      seenOutcomes.add(outcome);
      assert.ok(
        DecisionEngine.getAcknowledgement(result, choice)
          .startsWith(HIDDEN_EFFECT_OUTCOME_LINES[resource][outcome]),
      );
    }
  }

  assert.ok(hiddenChoiceCount > 0);
  assert.deepEqual([...seenOutcomes].sort(), ['negative', 'positive']);
});

test('comic choice pool is varied and keeps hand-authored effects', () => {
  const choicesByLabel = new Map<string, ReturnType<typeof DecisionEngine.generateChoices>[number]>();
  for (let index = 0; index < 500; index += 1) {
    const task = { ...makeTask(), lastUpdate: makeTask().lastUpdate + index };
    for (const choice of DecisionEngine.generateChoices(task)) choicesByLabel.set(choice.label, choice);
  }

  assert.ok(choicesByLabel.size >= 30);
  assert.deepEqual(choicesByLabel.get('Ask someone smart to take a look')?.resourceEffects, {
    motivation: -3,
    team: 12,
  });
  assert.deepEqual(choicesByLabel.get('Hire a random freelancer')?.resourceEffects, {
    money: -12,
    team: -8,
  });
  assert.deepEqual(choicesByLabel.get('Ask the manager for help')?.resourceEffects, {
    money: 8,
    motivation: -6,
    team: 10,
  });

  const affectedCounts = new Set(
    [...choicesByLabel.values()].map(choice => (
      Object.values(choice.resourceEffects).filter(effect => effect !== 0).length
    )),
  );
  assert.deepEqual([...affectedCounts].sort(), [1, 2, 3]);
});

test('only affected resources can receive a hidden marker or change', () => {
  const task = makeTask();
  let singleResourceChoice: ReturnType<typeof DecisionEngine.generateChoices>[number] | undefined;

  for (let index = 0; index < 500 && !singleResourceChoice; index += 1) {
    const choices = DecisionEngine.generateChoices({
      ...task,
      lastUpdate: task.lastUpdate + index,
    });
    singleResourceChoice = choices.find(choice => Object.keys(choice.resourceEffects).length === 1);
  }

  assert.ok(singleResourceChoice);
  const affected = Object.keys(singleResourceChoice.resourceEffects);
  assert.ok(singleResourceChoice.hiddenResourceEffects.every(resource => affected.includes(resource)));

  const result = DecisionEngine.applyChoice(task, singleResourceChoice);
  for (const resource of ['money', 'motivation', 'team'] as const) {
    if (!affected.includes(resource)) assert.equal(result.resources[resource], task.resources[resource]);
  }
});

test('deployment choices open separately once progress reaches 95 percent', () => {
  const task = { ...makeTask(), progress: 95 };
  const developmentChoices = DecisionEngine.generateChoices(task);
  const deploymentChoices = DecisionEngine.generateDeploymentChoices(task);

  assert.ok(developmentChoices.every(choice => !choice.deploymentScheme));
  assert.equal(deploymentChoices.length, 3);
  assert.ok(deploymentChoices.every(choice => Boolean(choice.deploymentScheme)));
  assert.deepEqual(DecisionEngine.generateDeploymentChoices({ ...task, progress: 94.99 }), []);
});

test('deployment uses the displayed chance and defaults to 10 percent', () => {
  const task = { ...makeTask(), progress: 95, deploymentChance: undefined };
  const choice = DecisionEngine.generateDeploymentChoices(task)[0];
  const originalRandom = Math.random;

  assert.equal(getDeploymentChance(task), 13);
  try {
    Math.random = () => 0.129;
    assert.equal(DecisionEngine.applyChoice(task, choice).deploymentRun?.willSucceed, true);
    Math.random = () => 0.13;
    assert.equal(DecisionEngine.applyChoice(task, choice).deploymentRun?.willSucceed, false);
  } finally {
    Math.random = originalRandom;
  }
});

test('deployment chance breakdown explains decisions, progress and failed attempts', () => {
  assert.deepEqual(getDeploymentChanceBreakdown({ deploymentChance: 10, progress: 94, failedDeployments: 0 }), {
    base: 10,
    decisionModifier: 0,
    failedDeploymentModifier: 0,
    progressModifier: 0,
    total: 10,
  });
  assert.deepEqual(getDeploymentChanceBreakdown({ deploymentChance: 24, progress: 98.7, failedDeployments: 2 }), {
    base: 10,
    decisionModifier: 14,
    failedDeploymentModifier: 10,
    progressModifier: 12,
    total: 46,
  });
  assert.equal(getDeploymentChance({ deploymentChance: 10, progress: 99.99, failedDeployments: 0 }), 25);
});

test('every failed deployment adds five points to the next attempt', () => {
  const failedAttempt = SimulationEngine.calculateNextState({
    ...makeTask(),
    progress: 95,
    deploymentRun: {
      scheme: 'canary',
      label: 'Canary',
      step: 7,
      backlog: 10,
      willSucceed: false,
      outcome: 'deploying',
    },
  });

  assert.equal(failedAttempt.deploymentRun?.outcome, 'catastrophic');
  assert.equal(failedAttempt.failedDeployments, 1);
  assert.equal(getDeploymentChanceBreakdown(failedAttempt).failedDeploymentModifier, 5);
});

test('rare expensive choices can raise or lower deployment chance', () => {
  const specialChoices: ReturnType<typeof DecisionEngine.generateChoices> = [];
  let screensWithSpecialChoice = 0;

  for (let index = 0; index < 1_200; index += 1) {
    const choices = DecisionEngine.generateChoices({
      ...makeTask(),
      lastUpdate: makeTask().lastUpdate + index,
    });
    const specials = choices.filter(choice => Boolean(choice.deploymentChanceDelta));
    if (specials.length > 0) screensWithSpecialChoice += 1;
    specialChoices.push(...specials);
  }

  assert.ok(screensWithSpecialChoice > 40);
  assert.ok(screensWithSpecialChoice < 160);
  assert.ok(specialChoices.some(choice => (choice.deploymentChanceDelta || 0) > 0));
  assert.ok(specialChoices.some(choice => (choice.deploymentChanceDelta || 0) < 0));
  assert.ok(specialChoices.every(choice => choice.hiddenResourceEffects.length === 0));
  assert.ok(specialChoices
    .filter(choice => (choice.deploymentChanceDelta || 0) > 0)
    .every(choice => (choice.resourceEffects.money || 0) <= -14));

  const positive = specialChoices.find(choice => (choice.deploymentChanceDelta || 0) > 0);
  assert.ok(positive);
  const changed = DecisionEngine.applyChoice(makeTask(), positive);
  assert.equal(changed.deploymentChance, 10 + (positive.deploymentChanceDelta || 0));
});

test('chat follows updates only while the viewport remains near the bottom', () => {
  assert.equal(isNearChatBottom({ scrollHeight: 1000, scrollTop: 328, clientHeight: 600 }), true);
  assert.equal(isNearChatBottom({ scrollHeight: 1000, scrollTop: 327, clientHeight: 600 }), false);
  assert.equal(isNearChatBottom({ scrollHeight: 500, scrollTop: 0, clientHeight: 600 }), true);
});

test('all six resource edges have distinct expanded departure stories', () => {
  const cases = [
    { resources: { money: 30, motivation: 50, team: 50 }, resource: 'money', edge: 'low', phrase: 'dumpster' },
    { resources: { money: 70, motivation: 50, team: 50 }, resource: 'money', edge: 'high', phrase: 'international waters' },
    { resources: { money: 50, motivation: 30, team: 50 }, resource: 'motivation', edge: 'low', phrase: 'robot vacuum' },
    { resources: { money: 50, motivation: 70, team: 50 }, resource: 'motivation', edge: 'high', phrase: 'nervous system' },
    { resources: { money: 50, motivation: 50, team: 30 }, resource: 'team', edge: 'low', phrase: 'ventilation shaft' },
    { resources: { money: 50, motivation: 50, team: 70 }, resource: 'team', edge: 'high', phrase: 'corporate fountain' },
  ] as const;
  const stories = new Set<string>();

  for (const item of cases) {
    const extreme = getExtremeState(item.resources);
    assert.ok(extreme);
    assert.equal(extreme.resource, item.resource);
    assert.equal(extreme.edge, item.edge);
    assert.ok(extreme.description.length > 200);
    assert.ok(extreme.description.includes(item.phrase));

    const message = getProgrammerDepartureMessage('Button Masher', extreme);
    assert.ok(message.startsWith('Button Masher vanished from the project.'));
    assert.ok(message.includes(extreme.title.toUpperCase()));
    stories.add(message);
  }

  assert.equal(stories.size, 6);
  assert.equal(RESOURCE_LOW_LIMIT, 30);
  assert.equal(RESOURCE_HIGH_LIMIT, 70);
  assert.equal(getExtremeState({ money: 31, motivation: 31, team: 31 }), null);
  assert.equal(getExtremeState({ money: 69, motivation: 69, team: 69 }), null);
});

test('resource indicator stretches the safe corridor across the full green bar', () => {
  assert.equal(getResourceIndicatorPosition(RESOURCE_LOW_LIMIT), 0);
  assert.equal(getResourceIndicatorPosition(50), 50);
  assert.equal(getResourceIndicatorPosition(RESOURCE_HIGH_LIMIT), 100);
  assert.equal(getResourceIndicatorPosition(20), 0);
  assert.equal(getResourceIndicatorPosition(80), 100);
});

test('a successor is created only by the explicit hiring action helper', () => {
  const departedTask = {
    ...makeTask(),
    progress: 72,
    resources: { money: 30, motivation: 50, team: 50 },
  };

  assert.equal(departedTask.programmerGeneration, 1);
  assert.deepEqual(departedTask.resources, { money: 30, motivation: 50, team: 50 });

  const successor = createSuccessor(departedTask);
  assert.equal(successor.programmerGeneration, 2);
  assert.deepEqual(successor.resources, { money: 50, motivation: 50, team: 50 });
  assert.equal(successor.progress, 68);
  assert.deepEqual(successor.programmerRoster, ['Button Masher', successor.programmerName]);
});

test('legacy saves gain a roster and victory share builds a Telegram preview link', () => {
  const restored = ensureProgrammerIdentity(makeTask());
  assert.deepEqual(restored.programmerRoster, ['Button Masher']);

  const result = {
    projectName: 'Test Project',
    programmerNames: ['Button Masher', 'Bug Launcher'],
    totalTokensSpent: 123_456,
    currentProgrammerTokensSpent: 45_678,
    contextTokens: 9_876,
    failedDeployments: 2,
  };
  const text = getVictoryShareText(result);
  assert.ok(text.includes('Test Project'));
  assert.ok(text.includes('2 vibe coders'));
  assert.ok(text.includes('2 failed deploys'));

  const resultUrl = getVictoryResultUrl('https://example.com/game', result);
  const parsedResult = parseVictoryShareParams(new URL(resultUrl).searchParams);
  assert.deepEqual(parsedResult, result);

  const telegramUrl = new URL(getTelegramShareUrl(resultUrl, text));
  assert.equal(telegramUrl.origin, 'https://t.me');
  assert.equal(telegramUrl.pathname, '/share/url');
  assert.equal(telegramUrl.searchParams.get('url'), resultUrl);
  assert.equal(telegramUrl.searchParams.get('text'), text);
});

test('leaderboard ranks lower token totals first and breaks ties by failed deployments', () => {
  const entries: LeaderboardEntry[] = [
    { id: 'expensive', projectName: 'Expensive', programmerNames: ['Codex'], totalTokensSpent: 90_000, failedDeployments: 0, completedAt: 1 },
    { id: 'winner', projectName: 'Efficient', programmerNames: ['Codex'], totalTokensSpent: 40_000, failedDeployments: 1, completedAt: 2 },
    { id: 'tie', projectName: 'Also Efficient', programmerNames: ['Codex'], totalTokensSpent: 40_000, failedDeployments: 3, completedAt: 3 },
  ];

  assert.deepEqual(sortLeaderboardEntries(entries).map(entry => entry.id), ['winner', 'tie', 'expensive']);
});

test('leaderboard does not duplicate a finished game and exposes its global rank', () => {
  const original: LeaderboardEntry = {
    id: 'same-game', projectName: 'First Result', programmerNames: ['Codex'], totalTokensSpent: 60_000, failedDeployments: 2, completedAt: 1,
  };
  const improved: LeaderboardEntry = {
    ...original, projectName: 'Best Result', totalTokensSpent: 50_000, completedAt: 2,
  };
  const entries = upsertLeaderboardEntry([
    original,
    { id: 'top', projectName: 'Top', programmerNames: ['Codex'], totalTokensSpent: 10_000, failedDeployments: 0, completedAt: 1 },
  ], improved);
  const snapshot = getLeaderboardSnapshot(entries, improved.id, 1);

  assert.equal(entries.filter(entry => entry.id === original.id).length, 1);
  assert.equal(entries.find(entry => entry.id === original.id)?.totalTokensSpent, 50_000);
  assert.deepEqual(snapshot.entries.map(entry => entry.id), ['top']);
  assert.equal(snapshot.currentEntry?.id, improved.id);
  assert.equal(snapshot.currentRank, 2);
  assert.equal(snapshot.totalEntries, 2);
});
