"use client"

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_DEPLOYMENT_CHANCE,
  DEPLOYMENT_DISASTER_STEPS,
  SimulationEngine,
  TaskState,
} from '@/lib/engine/simulation';
import { Personality } from '@/lib/engine/personality';
import { DecisionEngine, SimulationChoice } from '@/lib/engine/decision';
import { getKickoffCommandTokens, getWeeklyUsage, weeklyPercentToTokens } from '@/lib/engine/usage';
import { appendChatHistory, chargeTokenCall, normalizeWeeklyPeriod } from '@/lib/engine/token-ledger';
import {
  applyResourceEffects,
  createSuccessor,
  createInitialProgrammerIdentity,
  ensureProgrammerIdentity,
  getExtremeState,
  getProgrammerDepartureMessage,
  getSelfCodingDepartureMessage,
  NEUTRAL_RESOURCES,
  RESOURCE_HIGH_LIMIT,
} from '@/lib/engine/resources';
import {
  appendHistoryTexts,
  ChatMessage,
  choicesAsHistory,
  FALLBACK_TOOL_STEPS,
  getTelegramShareUrl,
  getVictoryResultUrl,
  getVictoryShareText,
  isNearChatBottom,
  isStoredTask,
  LIMIT_MESSAGE,
  makeMessage,
  PaywallOption,
  SAVE_VERSION,
  SavedGame,
  SimulationPhase,
  STORAGE_KEY,
} from '@/lib/game/session';
import { ResourceDashboard } from '@/components/ResourceDashboard';
import { GameHeader } from '@/components/GameHeader';
import { ChatPanel } from '@/components/ChatPanel';
import { ProjectProgressCard } from '@/components/ProjectProgressCard';
import { AnalyticsConsent } from '@/components/AnalyticsConsent';
import type { LeaderboardSnapshot, LeaderboardSubmission } from '@/lib/game/leaderboard';
import { trackAnalyticsEvent } from '@/lib/game/analytics';
import {
  Bot,
  Send,
} from 'lucide-react';

export default function VvibeCoderSim() {
  const [tasks, setTasks] = useState<TaskState[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [personality, setPersonality] = useState<Personality>('Codex');
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [phase, setPhase] = useState<SimulationPhase>('setup');
  const [prompt, setPrompt] = useState('');
  const [choices, setChoices] = useState<SimulationChoice[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [workStepIndex, setWorkStepIndex] = useState(0);
  const [workStepTotal, setWorkStepTotal] = useState(5);
  const [workStepDelay, setWorkStepDelay] = useState(1100);
  const [isHydrated, setIsHydrated] = useState(false);
  const [shareFeedback, setShareFeedback] = useState('');
  const [leaderboardSnapshot, setLeaderboardSnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [leaderboardStatus, setLeaderboardStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const chatViewportRef = useRef<HTMLElement | null>(null);
  const shouldFollowChatRef = useRef(true);
  const isProgrammaticScrollRef = useRef(false);

  const currentTask = useMemo(
    () => tasks.find(task => task.id === selectedTaskId),
    [tasks, selectedTaskId],
  );

  const weeklyUsage = useMemo(() => getWeeklyUsage({
    tokensSpent: currentTask?.weeklyTokensSpent || 0,
    bonusTokens: currentTask?.weeklyTokenBonus || 0,
  }), [currentTask?.weeklyTokensSpent, currentTask?.weeklyTokenBonus]);

  const activeDecisionMessageId = useMemo(() => {
    if (phase !== 'choosing') return null;
    return [...messages].reverse().find(message => message.isDecisionPrompt)?.id || null;
  }, [messages, phase]);

  const victorySubmission = useMemo<LeaderboardSubmission | null>(() => {
    if (phase !== 'victory' || !currentTask) return null;
    return {
      id: currentTask.id,
      projectName: currentTask.name,
      programmerNames: currentTask.programmerRoster?.length
        ? currentTask.programmerRoster
        : [currentTask.programmerName],
      totalTokensSpent: currentTask.totalTokensSpent || 0,
      failedDeployments: currentTask.failedDeployments || 0,
    };
  }, [currentTask, phase]);

  const handleChatViewportScroll = (event: React.UIEvent<HTMLElement>) => {
    if (isProgrammaticScrollRef.current) return;
    shouldFollowChatRef.current = isNearChatBottom(event.currentTarget);
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const decoded = JSON.parse(saved) as unknown;
      const savedGame = !Array.isArray(decoded)
        && decoded && typeof decoded === 'object'
        && (decoded as Partial<SavedGame>).version === SAVE_VERSION
        ? decoded as SavedGame
        : null;
      const parsed = savedGame?.task ?? (Array.isArray(decoded) ? decoded[0] : undefined);
      if (!isStoredTask(parsed)) throw new Error('Incompatible save');
      const storedTask = ensureProgrammerIdentity(parsed);
      const codexTask: TaskState = storedTask.personality === 'Codex'
        ? storedTask
        : { ...storedTask, personality: 'Codex' };
      const restored = normalizeWeeklyPeriod(codexTask);

      const isVictory = restored.status === 'Deployed' || restored.deploymentRun?.outcome === 'successful';
      const restoredExtreme = getExtremeState(restored.resources);
      const isDead = !isVictory && Boolean(restoredExtreme);
      const restoredWeekly = getWeeklyUsage({
        tokensSpent: restored.weeklyTokensSpent || 0,
        bonusTokens: restored.weeklyTokenBonus || 0,
      });
      const isPaywall = !isVictory && !isDead && restoredWeekly.exhausted;
      const isDeploying = restored.deploymentRun?.outcome === 'deploying';
      const isResumingWork = !isVictory && !isDead && !isPaywall && Boolean(
        isDeploying || savedGame?.phase === 'working' || savedGame?.phase === 'responding',
      );
      const restoredMessages: ChatMessage[] = isDead && restoredExtreme
        ? [makeMessage('assistant', restored.departureMessage
            || getProgrammerDepartureMessage(restored.programmerName, restoredExtreme), { model: restored.personality })]
        : [
            makeMessage('user', restored.name),
            ...restored.history
              .filter(event => !event.description.startsWith('Selected:'))
              .slice(0, 8)
              .reverse()
              .map((event, index) => {
                const fallback = FALLBACK_TOOL_STEPS[index % FALLBACK_TOOL_STEPS.length];
                return makeMessage('tool', event.description || fallback.description, {
                  eventType: event.type,
                  impact: event.impact,
                  operation: event.operation || fallback.operation,
                  target: event.target || fallback.target,
                });
              }),
          ];

      if (!isDead && !isResumingWork) {
        restoredMessages.push(makeMessage('assistant', DecisionEngine.getCompletionResponse(restored), { model: restored.personality }));
      }

      if (isPaywall) {
        restoredMessages.push(makeMessage('assistant', LIMIT_MESSAGE, { model: restored.personality }));
      } else if (!isDead && !isVictory && !isResumingWork) {
        restoredMessages.push(makeMessage('assistant', DecisionEngine.getDecisionPrompt(restored), {
          model: restored.personality,
          isDecisionPrompt: true,
        }));
      }

      setTasks([restored]);
      setSelectedTaskId(restored.id);
      setPersonality(restored.personality);
      setMessages(restoredMessages);
      setChoices(isVictory || isDead || isPaywall || isResumingWork ? [] : DecisionEngine.generateChoices(restored));
      if (isDeploying) {
        setWorkStepIndex(restored.deploymentRun?.step || 0);
        setWorkStepTotal(DEPLOYMENT_DISASTER_STEPS);
        setWorkStepDelay(2200);
      } else if (isResumingWork && savedGame) {
        setWorkStepIndex(savedGame.workStepIndex);
        setWorkStepTotal(savedGame.workStepTotal);
        setWorkStepDelay(savedGame.workStepDelay);
      }
      setPhase(isVictory
        ? 'victory'
        : isDead
          ? 'dead'
          : isPaywall
            ? 'paywall'
            : isResumingWork
              ? 'working'
              : 'choosing');
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (tasks.length === 0) localStorage.removeItem(STORAGE_KEY);
    else {
      const savedGame: SavedGame = {
        version: SAVE_VERSION,
        task: tasks[0],
        phase,
        workStepIndex,
        workStepTotal,
        workStepDelay,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedGame));
      } catch {
        // The running game remains available when browser storage is unavailable.
      }
    }
  }, [tasks, isHydrated, phase, workStepIndex, workStepTotal, workStepDelay]);

  useEffect(() => {
    if (!isHydrated) return;
    void trackAnalyticsEvent('visit');
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated || !victorySubmission) {
      setLeaderboardSnapshot(null);
      setLeaderboardStatus('idle');
      return;
    }

    void trackAnalyticsEvent('game_completed', victorySubmission.id);
    setLeaderboardSnapshot(null);
    setLeaderboardStatus('idle');
  }, [isHydrated, victorySubmission]);

  useEffect(() => {
    if (!currentTask) return;
    const normalized = normalizeWeeklyPeriod(currentTask);
    if (normalized !== currentTask) {
      setTasks(previous => previous.map(task => task.id === normalized.id ? normalized : task));
      return;
    }
    if (!currentTask.weeklyResetAt) return;
    const delay = Math.max(0, currentTask.weeklyResetAt - Date.now() + 25);
    const timer = window.setTimeout(() => {
      setTasks(previous => previous.map(task => (
        task.id === currentTask.id ? normalizeWeeklyPeriod(task, Date.now()) : task
      )));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [currentTask]);

  useEffect(() => {
    if (!currentTask) return;
    if (phase === 'paywall' && !weeklyUsage.exhausted) {
      const nextChoices = DecisionEngine.generateChoices(currentTask);
      const question = DecisionEngine.getDecisionPrompt(currentTask);
      const resumedTask = appendHistoryTexts(currentTask, [
        'The weekly limit has reset. Work can continue.',
        question,
        choicesAsHistory(nextChoices),
      ]);
      setTasks(previous => previous.map(task => task.id === resumedTask.id ? resumedTask : task));
      setChoices(nextChoices);
      setMessages(previous => [
        ...previous,
        makeMessage('assistant', 'The weekly limit has reset. Work can continue.', { model: currentTask.personality }),
        makeMessage('assistant', question, { model: currentTask.personality, isDecisionPrompt: true }),
      ].slice(-100));
      setPhase('choosing');
      return;
    }
    if (!weeklyUsage.exhausted) return;
    if (phase === 'setup' || phase === 'paywall' || phase === 'dead' || phase === 'victory') return;
    const limitedTask = appendChatHistory(currentTask, LIMIT_MESSAGE);
    setTasks(previous => previous.map(task => task.id === limitedTask.id ? limitedTask : task));
    setChoices([]);
    setMessages(previous => [
      ...previous,
      makeMessage('assistant', LIMIT_MESSAGE, { model: currentTask.personality }),
    ].slice(-100));
    setPhase('paywall');
  }, [currentTask, weeklyUsage.exhausted, phase]);

  useEffect(() => {
    const viewport = chatViewportRef.current;
    if (!viewport || !shouldFollowChatRef.current) return;
    let releaseGuardFrame: number | undefined;
    const animationFrame = window.requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = true;
      let target = viewport.scrollHeight;
      if (phase === 'choosing' && activeDecisionMessageId) {
        const decision = viewport.querySelector<HTMLElement>(`[data-message-id="${activeDecisionMessageId}"]`);
        if (decision) {
          target = viewport.scrollTop + decision.getBoundingClientRect().top
            - viewport.getBoundingClientRect().top - 8;
        }
      }
      viewport.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
      releaseGuardFrame = window.requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    });
    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (releaseGuardFrame !== undefined) window.cancelAnimationFrame(releaseGuardFrame);
      isProgrammaticScrollRef.current = false;
    };
  }, [messages, choices, phase, activeDecisionMessageId]);

  useEffect(() => {
    if (phase === 'responding') {
      const responseTimer = window.setTimeout(() => setPhase('working'), 800);
      return () => window.clearTimeout(responseTimer);
    }
    if (phase !== 'working' || !currentTask) return;

    const workTimer = window.setTimeout(() => {
      let nextTask = SimulationEngine.calculateNextState(currentTask);
      const event = nextTask.history[0];
      const nextStepIndex = workStepIndex + 1;
      const chatUpdates: ChatMessage[] = [makeMessage('tool', event.description, {
        eventType: event.type,
        impact: event.impact,
        operation: event.operation,
        target: event.target,
      })];

      setWorkStepIndex(nextStepIndex);

      if (nextStepIndex >= workStepTotal) {
        const completion = DecisionEngine.getCompletionResponse(nextTask);
        chatUpdates.push(makeMessage('assistant', completion, {
          model: nextTask.personality,
        }));
        if (nextTask.status === 'Deployed' || nextTask.deploymentRun?.outcome === 'successful') {
          nextTask = appendChatHistory(nextTask, completion);
          setChoices([]);
          setPhase('victory');
        } else {
          const question = DecisionEngine.getDecisionPrompt(nextTask);
          const nextChoices = DecisionEngine.generateChoices(nextTask);
          chatUpdates.push(makeMessage('assistant', question, {
            model: nextTask.personality,
            isDecisionPrompt: true,
          }));
          nextTask = appendHistoryTexts(nextTask, [completion, question, choicesAsHistory(nextChoices)]);
          setChoices(nextChoices);
          setPhase('choosing');
        }
      }

      setTasks(previous => previous.map(task => task.id === nextTask.id ? nextTask : task));
      setMessages(previous => [...previous, ...chatUpdates].slice(-100));
    }, workStepDelay);
    return () => window.clearTimeout(workTimer);
  }, [phase, currentTask, workStepIndex, workStepTotal, workStepDelay]);

  const startWorkCycle = (kind: 'initial' | 'branch' | 'deployment') => {
    setChoices([]);
    setWorkStepIndex(0);
    if (kind === 'deployment') {
      setWorkStepTotal(DEPLOYMENT_DISASTER_STEPS);
      setWorkStepDelay(2200);
    } else if (kind === 'branch') {
      setWorkStepTotal(8 + Math.floor(Math.random() * 5));
      setWorkStepDelay(1800);
    } else {
      setWorkStepTotal(5 + Math.floor(Math.random() * 3));
      setWorkStepDelay(1000);
    }
    setPhase('responding');
  };

  const createTask = () => {
    const name = prompt.trim();
    if (!name) return;
    shouldFollowChatRef.current = true;
    const programmerIdentity = createInitialProgrammerIdentity();
    const kickoffResponse = DecisionEngine.getKickoffResponse(personality, name);
    const initialCommandTokens = getKickoffCommandTokens(name);
    const task = chargeTokenCall<TaskState>({
      id: Math.random().toString(36).slice(2, 11),
      name,
      progress: 0,
      momentum: 0,
      history: [],
      lastUpdate: Date.now(),
      status: 'Active',
      personality,
      resources: { ...NEUTRAL_RESOURCES },
      programmerGeneration: 1,
      ...programmerIdentity,
      contextTokens: 0,
      chatHistoryTokens: 0,
      totalTokensSpent: 0,
      programmerTokensSpent: 0,
      weeklyTokensSpent: 0,
      weeklyTokenBonus: 0,
      deploymentChance: DEFAULT_DEPLOYMENT_CHANCE,
    }, {
      commandTokens: initialCommandTokens,
      userText: name,
      assistantText: kickoffResponse,
    });

    setTasks([task]);
    setSelectedTaskId(task.id);
    setShareFeedback('');
    setPrompt('');
    setMessages([
      makeMessage('user', name),
      makeMessage('assistant', kickoffResponse, { model: personality }),
    ]);
    void trackAnalyticsEvent('game_started', task.id);
    startWorkCycle('initial');
  };

  const selectChoice = (choice: SimulationChoice) => {
    if (!currentTask || phase !== 'choosing') return;
    let chosenTask = DecisionEngine.applyChoice(currentTask, choice);
    const acknowledgement = DecisionEngine.getAcknowledgement(chosenTask, choice);
    chosenTask = appendChatHistory(chosenTask, acknowledgement);
    const extreme = getExtremeState(chosenTask.resources);
    const updates: ChatMessage[] = [
      makeMessage('user', choice.label),
      makeMessage('assistant', acknowledgement, { model: chosenTask.personality }),
    ];

    if (extreme) {
      const departureMessage = getProgrammerDepartureMessage(chosenTask.programmerName, extreme);
      const deadTask = appendChatHistory({ ...chosenTask, departureMessage }, departureMessage);
      shouldFollowChatRef.current = true;
      setTasks(previous => previous.map(task => task.id === deadTask.id ? deadTask : task));
      setChoices([]);
      setMessages([makeMessage('assistant', departureMessage, { model: deadTask.personality })]);
      setPhase('dead');
      return;
    }

    setTasks(previous => previous.map(task => task.id === chosenTask.id ? chosenTask : task));
    setMessages(previous => [...previous, ...updates].slice(-100));
    startWorkCycle(choice.deploymentScheme ? 'deployment' : 'branch');
  };

  const openDeploymentChoices = () => {
    if (!currentTask || phase !== 'choosing' || currentTask.progress < 95 || currentTask.deploymentRun) return;
    const deploymentChoices = DecisionEngine.generateDeploymentChoices(currentTask);
    if (deploymentChoices.length === 0) return;
    const question = DecisionEngine.getDeploymentPrompt(currentTask);
    const updatedTask = appendHistoryTexts(currentTask, [question, choicesAsHistory(deploymentChoices)]);

    shouldFollowChatRef.current = true;
    setTasks(previous => previous.map(task => task.id === updatedTask.id ? updatedTask : task));
    setChoices(deploymentChoices);
    setMessages(previous => [
      ...previous,
      makeMessage('assistant', question, {
        model: currentTask.personality,
        isDecisionPrompt: true,
      }),
    ].slice(-100));
  };

  const selectModel = (model: Personality) => {
    if (model !== 'Codex') return;
    if (model === personality) {
      setIsModelMenuOpen(false);
      return;
    }
    if (phase === 'responding' || phase === 'working' || phase === 'paywall' || phase === 'dead' || phase === 'victory') return;
    setPersonality(model);
    setIsModelMenuOpen(false);
    if (!currentTask) return;
    const updatedTask = { ...currentTask, personality: model };
    const question = DecisionEngine.getDecisionPrompt(updatedTask);
    setTasks(previous => previous.map(task => task.id === updatedTask.id ? updatedTask : task));
    setMessages(previous => [
      ...previous,
      makeMessage('assistant', `Switched to ${model}. I will continue from the current project state.`, { model }),
      makeMessage('assistant', question, { model, isDecisionPrompt: true }),
    ].slice(-100));
    setChoices(DecisionEngine.generateChoices(updatedTask));
  };

  const selectPaywallOption = (option: PaywallOption) => {
    if (!currentTask || phase !== 'paywall') return;
    if (option.kind === 'self_code') {
      const departureMessage = getSelfCodingDepartureMessage(currentTask.programmerName);
      const deadTask = appendChatHistory({
        ...currentTask,
        resources: {
          ...currentTask.resources,
          motivation: RESOURCE_HIGH_LIMIT,
        },
        departureMessage,
        lastUpdate: Date.now(),
      }, departureMessage);
      shouldFollowChatRef.current = true;
      setTasks(previous => previous.map(task => task.id === deadTask.id ? deadTask : task));
      setChoices([]);
      setMessages([makeMessage('assistant', departureMessage, { model: deadTask.personality })]);
      setPhase('dead');
      return;
    }

    const isFreeModels = option.kind === 'free_models';
    const outcomeMessage = isFreeModels
      ? 'The free models rewrote different halves of the project, cut progress by 7%, turned the team against the codebase, and granted exactly one third of the weekly allowance. The savings were impressively eventful.'
      : option.kind === 'small_payment'
        ? 'Codex accepted 5 Money, called it a voluntary micropayment, and restored 20% of the weekly allowance.'
        : 'Codex saw 10 Money, instantly remembered the entire context, and restored the full weekly allowance. Even the cursor began moving with more respect.';
    const paidTask = appendHistoryTexts({
      ...currentTask,
      progress: isFreeModels
        ? Math.max(0, currentTask.progress - option.progressPenalty)
        : currentTask.progress,
      status: isFreeModels && currentTask.progress - option.progressPenalty <= 95
        ? 'Active'
        : currentTask.status,
      resources: applyResourceEffects(
        currentTask.resources,
        option.resourceEffects,
      ),
      weeklyTokenBonus: (currentTask.weeklyTokenBonus || 0)
        + weeklyPercentToTokens(option.allowancePercent),
      lastUpdate: Date.now(),
    }, [option.label, outcomeMessage]);
    const extreme = getExtremeState(paidTask.resources);
    if (extreme) {
      const departureMessage = getProgrammerDepartureMessage(paidTask.programmerName, extreme);
      const deadTask = appendChatHistory({ ...paidTask, departureMessage }, departureMessage);
      shouldFollowChatRef.current = true;
      setTasks(previous => previous.map(task => task.id === deadTask.id ? deadTask : task));
      setChoices([]);
      setMessages([makeMessage('assistant', departureMessage, { model: deadTask.personality })]);
      setPhase('dead');
      return;
    }
    let updatedTask = paidTask;
    const updatedUsage = getWeeklyUsage({
      tokensSpent: updatedTask.weeklyTokensSpent || 0,
      bonusTokens: updatedTask.weeklyTokenBonus || 0,
    });

    const updates: ChatMessage[] = [
      makeMessage('user', option.label),
      makeMessage('assistant', outcomeMessage, { model: paidTask.personality }),
    ];

    if (updatedUsage.exhausted) {
      const insufficientMessage = 'The restored allowance is not enough to continue. Work remains paused.';
      updatedTask = appendChatHistory(updatedTask, insufficientMessage);
      setTasks(previous => previous.map(task => task.id === updatedTask.id ? updatedTask : task));
      setMessages(previous => [
        ...previous,
        ...updates,
        makeMessage('assistant', insufficientMessage, { model: updatedTask.personality }),
      ].slice(-100));
      return;
    }

    const question = DecisionEngine.getDecisionPrompt(updatedTask);
    const nextChoices = DecisionEngine.generateChoices(updatedTask);
    const weeklyMessage = `Weekly allowance: ${updatedUsage.remainingPercent}%.`;
    updatedTask = appendHistoryTexts(updatedTask, [weeklyMessage, question, choicesAsHistory(nextChoices)]);
    setTasks(previous => previous.map(task => task.id === updatedTask.id ? updatedTask : task));
    setChoices(nextChoices);
    setMessages(previous => [
      ...previous,
      ...updates,
      makeMessage('assistant', weeklyMessage, { model: updatedTask.personality }),
      makeMessage('assistant', question, { model: updatedTask.personality, isDecisionPrompt: true }),
    ].slice(-100));
    setPhase('choosing');
  };

  const hireSuccessor = () => {
    if (!currentTask || phase !== 'dead' || !getExtremeState(currentTask.resources)) return;
    const departedName = currentTask.programmerName;
    let successorTask = createSuccessor(currentTask);
    const successorMessage = `${successorTask.programmerName} agreed to take over the project. They start with neutral resources and an empty context, inherit the code, and lose 4% progress to archaeological study of their predecessor's decisions.`;
    successorTask = appendChatHistory(successorTask, successorMessage);
    shouldFollowChatRef.current = true;
    setTasks(previous => previous.map(task => task.id === successorTask.id ? successorTask : task));
    setMessages(previous => [
      ...previous,
      makeMessage('user', 'Hire the next vibe coder'),
      makeMessage('assistant', successorMessage, { model: successorTask.personality }),
      makeMessage('tool', `${departedName} has been removed from the project for good. ${successorTask.programmerName} is reading the handoff.`, {
        eventType: 'setback', impact: -4, operation: 'read', target: 'PROJECT_HANDOFF.md',
      }),
    ].slice(-100));
    startWorkCycle('branch');
  };

  const shareResultToTelegram = () => {
    if (!currentTask || phase !== 'victory') return;
    const programmerNames = currentTask.programmerRoster?.length
      ? currentTask.programmerRoster
      : [currentTask.programmerName];
    const result = {
      projectName: currentTask.name,
      programmerNames,
      totalTokensSpent: currentTask.totalTokensSpent || 0,
      currentProgrammerTokensSpent: currentTask.programmerTokensSpent || 0,
      contextTokens: currentTask.contextTokens || 0,
      failedDeployments: currentTask.failedDeployments || 0,
    };
    const text = getVictoryShareText(result);
    const resultUrl = getVictoryResultUrl(window.location.origin, result);
    window.open(
      getTelegramShareUrl(resultUrl, text),
      '_blank',
      'noopener,noreferrer',
    );
    setShareFeedback('Opened a Telegram result card with a link to the game.');
  };

  const submitLeaderboardResult = async () => {
    if (!victorySubmission || leaderboardStatus === 'loading') return;
    setLeaderboardStatus('loading');
    try {
      const response = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(victorySubmission),
      });
      if (!response.ok) throw new Error('Leaderboard request failed');
      setLeaderboardSnapshot(await response.json() as LeaderboardSnapshot);
      setLeaderboardStatus('ready');
    } catch {
      setLeaderboardStatus('error');
    }
  };

  const resetTask = () => {
    shouldFollowChatRef.current = true;
    localStorage.removeItem(STORAGE_KEY);
    setTasks([]);
    setSelectedTaskId(null);
    setPhase('setup');
    setPrompt('');
    setChoices([]);
    setMessages([]);
    setShareFeedback('');
    setLeaderboardSnapshot(null);
    setLeaderboardStatus('idle');
    setWorkStepIndex(0);
  };

  const isBusy = phase === 'responding' || phase === 'working';
  const isModelLocked = isBusy || phase === 'paywall' || phase === 'dead' || phase === 'victory';
  const isDeploymentMenuOpen = choices.some(choice => Boolean(choice.deploymentScheme));

  if (!isHydrated) return <div className="min-h-screen bg-[#fafafa]" />;

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#18181b] selection:bg-purple-100">
      <GameHeader
        personality={personality}
        task={currentTask}
        menuOpen={isModelMenuOpen}
        modelLocked={isModelLocked}
        newTaskDisabled={isBusy}
        onToggleMenu={() => setIsModelMenuOpen(open => !open)}
        onSelectModel={selectModel}
        onReset={resetTask}
      />

      <main className={currentTask
        ? 'mx-auto h-[calc(100dvh-56px)] w-full max-w-4xl overflow-hidden px-5 pb-20 pt-5 md:px-8'
        : 'mx-auto w-full max-w-4xl px-5 pb-28 pt-5 md:px-8'}>
        {!currentTask ? (
          <section className="mx-auto flex max-w-2xl flex-col items-center pt-12 text-center md:pt-20">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm"><Bot className="h-8 w-8 text-gray-500" /></div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">What are we deploying?</h1>
            <div className="mt-8 w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-lg shadow-black/[0.04]">
              <textarea
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                placeholder="For example: I want a website for a small coffee shop"
                className="min-h-24 w-full resize-none border-0 bg-transparent text-base outline-none placeholder:text-gray-400"
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); createTask(); }
                }}
              />
              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <span className="text-xs text-gray-400">Enter to send · Shift+Enter for a new line</span>
                <button onClick={createTask} disabled={!prompt.trim()} aria-label="Start building" className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white transition hover:scale-105 disabled:bg-gray-100 disabled:text-gray-300"><Send className="h-4 w-4" /></button>
              </div>
            </div>
          </section>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-4">
            <ProjectProgressCard
              task={currentTask}
              phase={phase}
              deploymentMenuOpen={isDeploymentMenuOpen}
              onOpenDeployment={openDeploymentChoices}
            />

            <ChatPanel
              viewportRef={chatViewportRef}
              messages={messages}
              activeDecisionMessageId={activeDecisionMessageId}
              phase={phase}
              isBusy={isBusy}
              workStepIndex={workStepIndex}
              workStepTotal={workStepTotal}
              choices={choices}
              projectName={currentTask.name}
              programmerName={currentTask.programmerName}
              programmerNames={currentTask.programmerRoster?.length
                ? currentTask.programmerRoster
                : [currentTask.programmerName]}
              totalTokensSpent={currentTask.totalTokensSpent || 0}
              currentProgrammerTokensSpent={currentTask.programmerTokensSpent || 0}
              contextTokens={currentTask.contextTokens || 0}
              failedDeployments={currentTask.failedDeployments || 0}
              shareFeedback={shareFeedback}
              leaderboardSnapshot={leaderboardSnapshot}
              leaderboardStatus={leaderboardStatus}
              leaderboardCurrentId={currentTask.id}
              onViewportScroll={handleChatViewportScroll}
              onSelectChoice={selectChoice}
              onSelectPaywallOption={selectPaywallOption}
              onHireSuccessor={hireSuccessor}
              onShareTelegram={shareResultToTelegram}
              onSubmitLeaderboard={submitLeaderboardResult}
              onReset={resetTask}
            />
          </div>
        )}
      </main>

      {currentTask && (
        <ResourceDashboard
          personality={currentTask.personality}
          contextTokens={currentTask.contextTokens || 0}
          weeklyTokensSpent={currentTask.weeklyTokensSpent || 0}
          weeklyTokenBonus={currentTask.weeklyTokenBonus || 0}
          weeklyResetAt={currentTask.weeklyResetAt}
        />
      )}
      <AnalyticsConsent />
    </div>
  );
}
