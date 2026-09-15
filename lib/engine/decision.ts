import { DEFAULT_DEPLOYMENT_CHANCE, ProjectStrategy, TaskState } from './simulation';
import { Personality } from './personality';
import {
  applyResourceEffects,
  getChoiceResourceEffects,
  ResourceKey,
} from './resources';
import {
  getDevelopmentCommandTokens,
  getChoiceContextGrowth,
} from './usage';
import { chargeTokenCall } from './token-ledger';
import { getPhaseChoices, makeCodexChoice } from './card-catalog';
import { getDecisionSeed, hashText } from './decision-random';
import {
  CODEX_CARE_LINES,
  CODEX_CHOICE_COMMENTARY,
  CODEX_LIFE_ADVICE_LINES,
  HIDDEN_EFFECT_OUTCOME_LINES,
  UNCERTAIN_EFFECT_NARRATIVES,
} from './decision-copy';
import type {
  ChoiceTemplate,
  ProjectKind,
  ProjectPhase,
  ProjectProfile,
  SimulationChoice,
} from './decision-types';

export type { ChoiceTone, SimulationChoice } from './decision-types';

const RESOURCE_KEYS: ResourceKey[] = ['money', 'motivation', 'team'];
const HIDDEN_EFFECT_CHANCE = 0.28;

export interface DeploymentChanceBreakdown {
  base: number;
  decisionModifier: number;
  failedDeploymentModifier: number;
  progressModifier: number;
  total: number;
}

export const getDeploymentChanceBreakdown = (
  task?: Pick<TaskState, 'deploymentChance' | 'failedDeployments' | 'progress'>,
): DeploymentChanceBreakdown => {
  const storedChance = Math.round(task?.deploymentChance ?? DEFAULT_DEPLOYMENT_CHANCE);
  const decisionModifier = storedChance - DEFAULT_DEPLOYMENT_CHANCE;
  const failedDeploymentModifier = Math.max(0, Math.floor(task?.failedDeployments || 0)) * 5;
  const progressModifier = Math.max(0, Math.floor(task?.progress || 0) - 94) * 3;
  const total = Math.max(0, Math.min(
    100,
    DEFAULT_DEPLOYMENT_CHANCE + decisionModifier + failedDeploymentModifier + progressModifier,
  ));
  return {
    base: DEFAULT_DEPLOYMENT_CHANCE,
    decisionModifier,
    failedDeploymentModifier,
    progressModifier,
    total,
  };
};

export const getDeploymentChance = (
  task?: Pick<TaskState, 'deploymentChance' | 'failedDeployments' | 'progress'>,
) => (
  getDeploymentChanceBreakdown(task).total
);

const resolveHiddenResourceEffect = (choiceId: string, resource: ResourceKey) => {
  const roll = hashText(`${choiceId}:${resource}:resolved`) % 20;
  return roll < 10 ? roll - 10 : roll - 9;
};

const getHiddenEffectOutcomeLine = (choice: SimulationChoice) => {
  const resource = choice.hiddenResourceEffects[0];
  if (!resource) return '';
  const result = resolveHiddenResourceEffect(choice.id, resource);
  return HIDDEN_EFFECT_OUTCOME_LINES[resource][result > 0 ? 'positive' : 'negative'];
};


const PROJECT_PROFILES: Record<ProjectKind, ProjectProfile> = {
  site: {
    kind: 'site',
    subject: 'website',
    surface: 'pages, navigation, and responsive behavior',
    coreFlow: 'the path from the first screen to the target action',
    data: 'content, forms, and submissions',
    mainRisk: 'mobile behavior, performance, and empty states',
    releaseTarget: 'a live domain',
  },
  store: {
    kind: 'store',
    subject: 'store',
    surface: 'the catalog, product pages, and cart',
    coreFlow: 'the path from product selection to order confirmation',
    data: 'products, inventory, carts, and orders',
    mainRisk: 'payments, lost carts, and inventory errors',
    releaseTarget: 'the first real order',
  },
  dashboard: {
    kind: 'dashboard',
    subject: 'dashboard',
    surface: 'navigation, tables, and key states',
    coreFlow: "the user's primary workflow",
    data: 'filters, permissions, and real records',
    mainRisk: 'permissions, large datasets, and accidental actions',
    releaseTarget: 'the first working group',
  },
  mobile: {
    kind: 'mobile',
    subject: 'app',
    surface: 'the main screens and mobile navigation',
    coreFlow: 'the first complete flow on a phone',
    data: 'local state, synchronization, and notifications',
    mainRisk: 'offline mode, permissions, and slow networks',
    releaseTarget: 'a test build on a device',
  },
  bot: {
    kind: 'bot',
    subject: 'bot',
    surface: 'commands, replies, and clear return points',
    coreFlow: 'the conversation from the first message to a useful result',
    data: 'conversation context, users, and integrations',
    mainRisk: 'lost context, repetition, and confusing replies',
    releaseTarget: 'the first live conversation',
  },
  service: {
    kind: 'service',
    subject: 'service',
    surface: 'contracts, core methods, and error handling',
    coreFlow: 'the main request from input to a persisted result',
    data: 'the schema, validation, and external integrations',
    mainRisk: 'duplicate requests, integration failures, and data integrity',
    releaseTarget: 'the production environment',
  },
  generic: {
    kind: 'generic',
    subject: 'project',
    surface: 'the main screens and states',
    coreFlow: 'the primary user journey',
    data: 'data, persistence, and integrations',
    mainRisk: 'errors, empty states, and recovery',
    releaseTarget: 'the first working version',
  },
};

const detectProjectProfile = (name: string): ProjectProfile => {
  const value = name.toLowerCase();
  if (/shop|store|e-?commerce|product|cart/.test(value)) return PROJECT_PROFILES.store;
  if (/dashboard|admin|crm|analytics/.test(value)) return PROJECT_PROFILES.dashboard;
  if (/mobile|ios|android|app\b/.test(value)) return PROJECT_PROFILES.mobile;
  if (/bot|telegram|discord/.test(value)) return PROJECT_PROFILES.bot;
  if (/api|backend|service|server/.test(value)) return PROJECT_PROFILES.service;
  if (/site|landing|portfolio|blog|website/.test(value)) return PROJECT_PROFILES.site;
  return PROJECT_PROFILES.generic;
};

const getProjectPhase = (progress: number): ProjectPhase => {
  if (progress < 20) return 'foundation';
  if (progress < 45) return 'experience';
  if (progress < 70) return 'data';
  if (progress < 92) return 'hardening';
  return 'release';
};

const getRecoveryChoices = (task: TaskState): ChoiceTemplate[] => {
  const problem = task.history.find(event => event.type === 'setback' || event.impact < 0);
  const target = problem?.target || 'problem area';

  return [
    makeCodexChoice(
      'Ask someone smart to find the bug',
      `Show ${target} to someone who has not grown used to this code yet. The consultation costs money, but the team gets a clear diagnosis.`,
      'quality',
      { progressDelta: -1.4, momentumDelta: -0.15, resourceEffects: { money: -8, team: 12 } }
    ),
    makeCodexChoice(
      'Bring in a manager to handle communications',
      `While the manager explains the fate of ${target} to everyone, the team will rally, but the developer will grow tired of the word “alignment.”`,
      'product',
      { progressDelta: 0.4, eventType: 'decision', resourceEffects: { motivation: -7, team: 10 } }
    ),
    makeCodexChoice(
      'Patch the problem with an adapter',
      `Wrap ${target} in a temporary layer and write a TODO larger than the implementation itself. The budget survives, but the team sees everything.`,
      'speed',
      { progressDelta: 3.2, eventType: 'risky_shortcut', resourceEffects: { money: 9, team: -12 } }
    ),
  ];
};

const getLastDecisionStrategy = (task: TaskState): ProjectStrategy | undefined => {
  const decision = task.history.find(event => event.description.startsWith('Selected:'));
  if (decision?.target?.startsWith('branch:')) return decision.target.slice(7) as ProjectStrategy;
  return task.strategy;
};

const getDeploymentChoices = (task: TaskState, profile: ProjectProfile): ChoiceTemplate[] => {
  const schemes: ChoiceTemplate[] = [
    makeCodexChoice(
      'Canary on 5% of traffic',
      `Send a small share of users to the new ${profile.subject}, compare errors, and expand the release automatically.`,
      'quality',
      {
        deploymentScheme: 'canary',
        progressDelta: 0,
        resourceEffects: { money: -10, team: 8 },
        acknowledgement: 'Starting a canary on 5% of traffic. Small enough to call the experiment safe, and large enough to guarantee that our most important users are among them.',
      }
    ),
    makeCodexChoice(
      'Blue-green with an instant switch',
      'Bring up a parallel environment, warm it up, and route all traffic to it with one change.',
      'product',
      {
        deploymentScheme: 'blue_green',
        progressDelta: 0,
        resourceEffects: { money: -12, team: 10 },
        acknowledgement: 'Bringing up green beside blue and preparing the instant switch. The word “instant” is especially reassuring: the consequences will have less time to introduce themselves.',
      }
    ),
    makeCodexChoice(
      'Rolling update across instances',
      'Update the app in batches without stopping the service, keeping old and new versions live at the same time.',
      'product',
      {
        deploymentScheme: 'rolling',
        progressDelta: 0,
        resourceEffects: { money: -6, team: 7 },
        acknowledgement: 'Starting the rolling update. Running several incompatible versions at once is a proven way to turn one problem into a distributed one.',
      }
    ),
    makeCodexChoice(
      'Second machine and a DNS switch',
      'Deploy the new version separately, then point the domain at the new IP with the option to restore the old record.',
      'quality',
      {
        deploymentScheme: 'dns_switch',
        progressDelta: 0,
        resourceEffects: { money: -9, motivation: 5 },
        acknowledgement: 'Preparing the second machine and the DNS switch. The plan is reversible in that calm theoretical world where TTLs have a sense of duty.',
      }
    ),
    makeCodexChoice(
      'Migrate the production database first',
      `Update ${profile.data} first, then deploy code designed for the new schema.`,
      'speed',
      {
        deploymentScheme: 'migration_first',
        progressDelta: 0,
        resourceEffects: { motivation: 9, team: -12 },
        acknowledgement: 'Starting with the production migration. When data changes first, the paths back become remarkably concrete and short.',
      }
    ),
    makeCodexChoice(
      'Deploy straight to production',
      'Ship the current build all at once, skip the repeated checks, and keep rollback close at hand.',
      'speed',
      {
        deploymentScheme: 'direct_prod',
        progressDelta: 0,
        resourceEffects: { money: 12, motivation: 11, team: -14 },
        acknowledgement: 'Deploying straight to production. The checks have almost passed so many times that it would be rude to keep distrusting them.',
      }
    ),
  ];
  const offset = getDecisionSeed(task) % schemes.length;
  return [0, 1, 2].map(index => schemes[(offset + index * 2) % schemes.length]);
};

const getDeploymentRecoveryChoices = (task: TaskState): ChoiceTemplate[] => {
  const backlog = task.deploymentRun?.backlog || 0;
  return [
    makeCodexChoice(
      'Call in a gray-haired DevOps engineer',
      `Pay someone who has seen fires like this before and work through the ${backlog} new tasks together. Expensive, but the team can breathe again.`,
      'quality',
      { progressDelta: -1.8, resourceEffects: { money: -12, team: 13 } }
    ),
    makeCodexChoice(
      'Put the manager in charge of the incident',
      'Let one person talk to everyone while the rest fix things. Status reports drain motivation, but the team pulls together.',
      'product',
      { progressDelta: 0.2, resourceEffects: { motivation: -7, team: 11 } }
    ),
    makeCodexChoice(
      'Blame Kubernetes and rewrite everything',
      'Treat the incident as a sign from above, buy a new infrastructure stack, and cheerfully split the team into two more camps.',
      'speed',
      { progressDelta: -4.5, eventType: 'architecture_rewrite', resourceEffects: { money: -14, motivation: 12, team: -10 } }
    ),
  ];
};

const getRecentSetback = (task: TaskState) => {
  const lastDecisionIndex = task.history.findIndex(event => event.description.startsWith('Selected:'));
  const recentWork = lastDecisionIndex === -1 ? task.history : task.history.slice(0, lastDecisionIndex);
  return recentWork.find(event => event.type === 'setback' || event.impact < 0);
};

const getCodexDecisionPrompt = (task: TaskState): string => {
  const profile = detectProjectProfile(task.name);
  const phase = getProjectPhase(task.progress);

  if (task.deploymentRun?.outcome === 'catastrophic') {
    return `The deployment ended in catastrophe and added ${task.deploymentRun.backlog} new tasks. Do we freeze releases, assemble a recovery build, or admit that we are now building a dedicated deployment platform?`;
  }
  const problem = getRecentSetback(task);
  const previousStrategy = getLastDecisionStrategy(task);

  if (problem) {
    const target = problem.target || 'problem area';
    return `${target} broke the working run. Do we revert the change, isolate the failure, or work around it for the next build?`;
  }

  const prompts: Record<ProjectPhase, string> = {
    foundation: `The ${profile.subject} skeleton already looks serious enough to demand outside help or its first questionable decision. How do we get out of this?`,
    experience: `The interface came alive and immediately developed opinions. Do we call in help, bring in management, or treat the problem with technical superstition?`,
    data: `${profile.data} need an adult decision, but the adults are on a call. Which workaround do we choose?`,
    hardening: `${profile.mainRisk} no longer fear ordinary debugging. Who do we ask to save the project, or what do we pretend to have fixed?`,
    release: `There is dangerously little common sense left before ${profile.releaseTarget}. Who gets the final push?`,
  };

  const continuity: Record<ProjectStrategy, string> = {
    quality: 'So far we have relied on checks and small changes—I can keep that approach or change priorities.',
    product: 'So far we have focused on the primary user journey—I can continue or shift toward resilience.',
    speed: 'So far we have deliberately favored speed—we can stabilize the result now or keep the same pace.',
  };

  const continuityText = previousStrategy ? ` ${continuity[previousStrategy]}` : '';
  return `${prompts[phase]}${continuityText}`;
};

export class DecisionEngine {
  static generateChoices(task: TaskState): SimulationChoice[] {
    const phase = getProjectPhase(task.progress);
    const problem = getRecentSetback(task);
    let codexChoices: ChoiceTemplate[];

    const isDeploymentRecovery = task.deploymentRun?.outcome === 'catastrophic';

    if (isDeploymentRecovery) codexChoices = getDeploymentRecoveryChoices(task);
    else if (problem) codexChoices = getRecoveryChoices(task);
    else codexChoices = getPhaseChoices(task, detectProjectProfile(task.name), phase);

    return this.decorateChoices(task, codexChoices, phase, 'development');
  }

  static generateDeploymentChoices(task: TaskState): SimulationChoice[] {
    if (task.progress < 95 || task.deploymentRun) return [];
    return this.decorateChoices(
      task,
      getDeploymentChoices(task, detectProjectProfile(task.name)),
      getProjectPhase(task.progress),
      'deployment',
    );
  }

  private static decorateChoices(
    task: TaskState,
    pool: ChoiceTemplate[],
    phase: ProjectPhase,
    scope: 'development' | 'deployment',
  ): SimulationChoice[] {
    return pool.map((choice, index) => {
      const strategy = choice.strategy || (choice.tone === 'safe' ? 'quality' : choice.tone === 'risky' ? 'speed' : 'product');
      const id = `${task.personality}-${scope}-${phase}-${task.history.length}-${index}`;
      const resourceEffects = choice.resourceEffects || getChoiceResourceEffects(strategy, choice.label);
      const affectedResources = RESOURCE_KEYS.filter(resource => (resourceEffects[resource] || 0) !== 0);
      const hasHiddenEffect = !choice.deploymentChanceDelta
        && affectedResources.length > 0
        && hashText(`${id}:hidden`) % 10_000 < HIDDEN_EFFECT_CHANCE * 10_000;
      const hiddenResource = hasHiddenEffect
        ? affectedResources[hashText(`${id}:hidden-resource`) % affectedResources.length]
        : undefined;
      const hiddenResourceEffects = hiddenResource ? [hiddenResource] : [];
      const description = hiddenResource
        ? `${choice.description} ${UNCERTAIN_EFFECT_NARRATIVES[hiddenResource]}`
        : choice.description;
      return {
        ...choice,
        description,
        strategy,
        resourceEffects,
        hiddenResourceEffects,
        tokenCost: getDevelopmentCommandTokens({
          strategy,
          instruction: choice.label,
          details: description,
          deploymentScheme: choice.deploymentScheme,
        }),
        id,
      };
    });
  }

  static applyChoice(task: TaskState, choice: SimulationChoice): TaskState {
    let effectiveProgressDelta = choice.progressDelta;
    if (effectiveProgressDelta > 0 && task.progress >= 75) {
      const choiceAdvanceCap = task.progress < 90
        ? 2
        : task.progress < 95
          ? 0.6
          : task.progress < 99
            ? 0.22
            : 0.035;
      effectiveProgressDelta = Math.min(effectiveProgressDelta, choiceAdvanceCap);
    }
    const progress = Math.max(0, Math.min(99.99, task.progress + effectiveProgressDelta));
    const momentum = Math.max(0, task.momentum + choice.momentumDelta);
    const resolvedResourceEffects = { ...choice.resourceEffects };
    for (const resource of choice.hiddenResourceEffects || []) {
      resolvedResourceEffects[resource] = resolveHiddenResourceEffect(choice.id, resource);
    }
    const resources = applyResourceEffects(task.resources, resolvedResourceEffects);
    const deploymentChance = Math.max(0, Math.min(
      100,
      (task.deploymentChance ?? DEFAULT_DEPLOYMENT_CHANCE) + (choice.deploymentChanceDelta || 0),
    ));
    const deploymentRun = choice.deploymentScheme
      ? {
          scheme: choice.deploymentScheme,
          label: choice.label,
          step: 0,
          backlog: 0,
          willSucceed: Math.random() * 100 < getDeploymentChance({ ...task, deploymentChance }),
          outcome: 'deploying' as const,
        }
      : task.deploymentRun?.outcome === 'catastrophic'
        ? undefined
        : task.deploymentRun;

    return chargeTokenCall({
      ...task,
      progress,
      momentum,
      resources,
      deploymentChance,
      strategy: choice.strategy || (choice.tone === 'safe' ? 'quality' : choice.tone === 'risky' ? 'speed' : 'product'),
      status: progress > 95 ? 'Almost Done' : 'Active',
      lastUpdate: Date.now(),
      deploymentRun,
      history: [{
        type: choice.eventType,
        description: `Selected: ${choice.label}`,
        impact: effectiveProgressDelta,
        target: choice.deploymentScheme
          ? `deploy:${choice.deploymentScheme}`
          : `branch:${choice.strategy || choice.tone}`,
      }, ...task.history].slice(0, 50),
    }, {
      commandTokens: choice.tokenCost,
      userText: choice.label,
      contextGrowthTokens: getChoiceContextGrowth(
        choice.strategy || (choice.tone === 'safe' ? 'quality' : choice.tone === 'risky' ? 'speed' : 'product'),
        choice.deploymentScheme,
      ),
      contextText: choice.description,
    });
  }

  static getKickoffResponse(personality: Personality, taskName: string): string {
    const responses: Record<Personality, string> = {
      'Claude Code': `Understood: “${taskName}.” I’ll build a safe working foundation first, then show the options for what comes next.`,
      Codex: `Got it. I’m starting “${taskName}” with the smallest working flow. The word “smallest” will protect us from requirements until the first demo.`,
      Gemini: `Task “${taskName}” accepted. I’ll analyze the context, structure, and possible user journeys.`,
      Grok: `“${taskName}”? Easy. I’ll put together a first version, then we can decide how far to push it.`,
    };
    return responses[personality];
  }

  static getAcknowledgement(task: TaskState, choice: SimulationChoice): string {
    const personality = task.personality;
    const strategy = choice.strategy || 'product';
    const codexResponses: Record<ProjectStrategy, string> = {
      quality: `Got it. Taking the careful route: “${choice.label}.” I’ll record the working state first, then make small, verifiable changes.`,
      product: `Got it: “${choice.label}.” I’ll stay focused on the primary user journey and keep the project scope under control.`,
      speed: `Got it: “${choice.label}.” I’ll build a quick vertical slice and mark the places that still rely on compromises.`,
    };
    const responses: Record<Personality, string> = {
      'Claude Code': `Accepted: “${choice.label}.” I’ll review the consequences and make the changes carefully.`,
      Codex: choice.acknowledgement || codexResponses[strategy],
      Gemini: `Option “${choice.label}” recorded. I’ll adapt the implementation to the new context.`,
      Grok: `Okay, “${choice.label}.” Starting now. If something catches fire, that is part of the process.`,
    };
    const outcomeLine = getHiddenEffectOutcomeLine(choice);
    const withOutcome = (response: string) => outcomeLine ? `${outcomeLine}\n\n${response}` : response;
    if (personality !== 'Codex') return withOutcome(responses[personality]);

    const pool = CODEX_CHOICE_COMMENTARY[strategy];
    const commentIndex = hashText(`${task.id}:${task.lastUpdate}:${strategy}:${choice.label}`) % pool.length;
    return withOutcome(`${responses.Codex}\n\n${pool[commentIndex]}`);
  }

  static getCompletionResponse(task: TaskState): string {
    const lastEvent = task.history[0];
    const recentSetback = getRecentSetback(task);
    const hasSetback = Boolean(recentSetback);
    const almostDone = task.progress > 95;
    const codexStrategy = task.strategy || 'product';
    const codexProgress: Record<ProjectStrategy, string> = {
      quality: 'I worked through the selected area in small changes and checked the state after each step.',
      product: 'I kept the primary user journey working and did not expand the scope beyond it.',
      speed: 'The quick vertical slice is ready; I marked the compromised areas so they do not look accidental.',
    };

    if (task.deploymentRun?.outcome === 'successful') {
      return `Production is stable: the health check passes, the primary flow works, and no post-release errors have appeared. ${task.programmerName} successfully brought the project to deployment.`;
    }

    if (task.deploymentRun?.outcome === 'catastrophic') {
      const responses: Record<Personality, string> = {
        'Claude Code': `The deployment had to be rolled back. The incident created ${task.deploymentRun.backlog} new tasks; first we need to restore the data and a stable primary flow. The failure review added 5 percentage points to the next attempt's chance.`,
        Codex: `The deployment ended catastrophically. The rollback partially restored the service, but left incompatible data, split infrastructure state, and ${task.deploymentRun.backlog} new tasks. Technically, this was not a failed release but an exceptionally detailed clarification of the production requirements. The incident review added 5 percentage points to the next deployment's chance.`,
        Gemini: `The deployment exposed a chain of infrastructure conflicts and added ${task.deploymentRun.backlog} recovery tasks. We need a dedicated recovery plan. The next attempt gains 5 percentage points of success chance.`,
        Grok: `Production caught fire systematically and across several layers at once. Plus ${task.deploymentRun.backlog} tasks—but the roadmap writes itself now, and the next attempt gains 5 percentage points of success chance.`,
      };
      return this.withCodexCare(task, responses[task.personality]);
    }

    if (almostDone) {
      const responses: Record<Personality, string> = {
        'Claude Code': 'The core is already working. I see a couple of areas worth checking before the final run.',
        Codex: `Almost ready: the build passes and the primary flow works. ${codexProgress[codexStrategy]} All that remains is choosing the launch mode.`,
        Gemini: 'The primary flow is assembled. We need to decide on the final check before the last run.',
        Grok: 'Almost done. Really, almost. Just one tiny architecture-sized detail remains.',
      };
      return this.withCodexCare(task, responses[task.personality]);
    }

    if (hasSetback) {
      const responses: Record<Personality, string> = {
        'Claude Code': `I hit a problem: ${recentSetback?.description || lastEvent?.description} I have not touched the rest of the code yet.`,
        Codex: `The working run revealed a specific failure: ${recentSetback?.description || lastEvent?.description} I isolated the area and prepared three options with different time and risk costs.`,
        Gemini: `The check uncovered a problem: ${recentSetback?.description || lastEvent?.description} We need to choose the next step.`,
        Grok: `There is a catch: ${recentSetback?.description || lastEvent?.description} I already have three ways to deal with it.`,
      };
      return this.withCodexCare(task, responses[task.personality]);
    }

    const responses: Record<Personality, string> = {
      'Claude Code': 'The foundation is assembled and verified. The current version runs, so we can move on.',
      Codex: `This stage is complete. ${codexProgress[codexStrategy]} The build passes, state persists, and there are no obvious errors.`,
      Gemini: 'The basic version works. I checked the main states and data updates.',
      Grok: 'Done. Everything works well enough to confidently choose the next risky step.',
    };
    return this.withCodexCare(task, responses[task.personality]);
  }

  private static withCodexCare(task: TaskState, response: string): string {
    if (task.personality !== 'Codex') return response;
    const line = CODEX_CARE_LINES[Math.floor(Math.random() * CODEX_CARE_LINES.length)];
    let result = `${response}\n\n${line}`;
    if (getDecisionSeed(task) % 4 === 0) {
      const adviceIndex = (task.history.length + Math.floor(task.progress)) % CODEX_LIFE_ADVICE_LINES.length;
      result += `\n\n${CODEX_LIFE_ADVICE_LINES[adviceIndex]}`;
    }
    return result;
  }

  static getDecisionPrompt(task: TaskState): string {
    const lastEvent = task.history[0];
    if (task.deploymentRun?.outcome === 'successful') {
      return 'The project has been deployed successfully.';
    }
    if (task.deploymentRun?.outcome === 'catastrophic') {
      return task.personality === 'Codex'
        ? getCodexDecisionPrompt(task)
        : `The deployment created ${task.deploymentRun.backlog} new tasks. How do we recover?`;
    }
    if (task.personality === 'Codex') return getCodexDecisionPrompt(task);
    if (task.progress > 95) return 'What do we do before the final run?';
    if (lastEvent?.type === 'setback') return 'What should we do?';
    if (task.progress < 20) return 'What should we build next?';
    if (task.progress < 55) return 'Where do we go from here?';
    return 'What should we add before the next run?';
  }

  static getDeploymentPrompt(task: TaskState): string {
    const chance = getDeploymentChance(task);
    return task.personality === 'Codex'
      ? `The project is ready for a release attempt. The current chance of a successful deployment is ${chance}%. Which strategy should we use?`
      : `The chance of a successful deployment is ${chance}%. Which strategy should we use to ship to production?`;
  }
}
