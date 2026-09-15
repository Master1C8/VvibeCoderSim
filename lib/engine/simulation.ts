import { Personality } from './personality';
import type { ResourceState } from './resources';
import {
  getContextPressure,
  getOperationContextGrowth,
} from './usage';
import { recordWorkContext } from './token-ledger';

export type EventType = 'advance' | 'setback' | 'neutral' | 'decision' | 'reinterpret_requirement' | 'risky_shortcut' | 'architecture_rewrite' | 'request_context';
export type WorkOperation = 'search' | 'read' | 'modify' | 'create' | 'run' | 'fix';
export type ProjectStrategy = 'quality' | 'product' | 'speed';
export type DeploymentScheme = 'canary' | 'blue_green' | 'rolling' | 'dns_switch' | 'migration_first' | 'direct_prod';

export const DEPLOYMENT_DISASTER_STEPS = 8;
export const DEFAULT_DEPLOYMENT_CHANCE = 10;

export interface SimulationEvent {
  type: EventType;
  description: string;
  impact: number;
  operation?: WorkOperation;
  target?: string;
}

export interface DeploymentRun {
  scheme: DeploymentScheme;
  label: string;
  step: number;
  backlog: number;
  willSucceed: boolean;
  outcome: 'deploying' | 'catastrophic' | 'successful';
}

export interface TaskState {
  id: string;
  name: string;
  progress: number;
  momentum: number;
  history: SimulationEvent[];
  lastUpdate: number;
  status: 'Almost Done' | 'Active' | 'Deployed';
  personality: Personality;
  resources: ResourceState;
  programmerGeneration: number;
  programmerName: string;
  programmerNameCounts: Record<string, number>;
  programmerRoster?: string[];
  chatHistoryTokens: number;
  totalTokensSpent: number;
  programmerTokensSpent: number;
  strategy?: ProjectStrategy;
  contextTokens?: number;
  weeklyTokensSpent?: number;
  weeklyTokenBonus?: number;
  weeklyTokenBudget?: number;
  /** @deprecated save migration only */
  weeklyUsagePercent?: number;
  /** @deprecated save migration only */
  weeklyAllowanceBonus?: number;
  weeklyResetAt?: number;
  deploymentChance?: number;
  failedDeployments?: number;
  departureMessage?: string;
  deploymentRun?: DeploymentRun;
}

export class SimulationEngine {
  private static MAX_PROGRESS = 99.99;

  static calculateNextState(task: TaskState): TaskState {
    if (task.deploymentRun?.outcome === 'deploying') {
      return this.calculateDeploymentDisaster(task);
    }

    const { progress, momentum, personality } = task;
    const strategy = task.strategy || 'product';
    const contextPressure = getContextPressure({
      personality,
      contextTokens: task.contextTokens || 0,
    });

    // The first 75% should feel effortless. After that, setbacks grow rapidly.
    let setbackProbability = progress < 75
      ? 0.02
      : progress < 90
        ? 0.05
        : progress < 95
          ? 0.08
          : progress < 99
            ? 0.12
            : 0.16;

    if (strategy === 'quality') setbackProbability -= 0.015;
    if (strategy === 'speed') setbackProbability += 0.045;
    setbackProbability += contextPressure.setbackBonus;
    setbackProbability = Math.max(0.005, setbackProbability);

    let neutralProbability = progress < 75
      ? 0.05
      : progress < 90
        ? 0.08
        : progress < 95
          ? 0.12
          : progress < 99
            ? 0.16
            : 0.22;
    if (strategy === 'quality') neutralProbability += 0.035;
    if (strategy === 'speed') neutralProbability = Math.max(0.02, neutralProbability - 0.025);

    const roll = Math.random();
    let event: SimulationEvent;

    if (roll < setbackProbability) {
      // Setback
      const impact = - (Math.random() * 5 + 1);
      event = {
        type: 'setback',
        ...this.getSetbackWork(),
        impact
      };
    } else if (roll < setbackProbability + neutralProbability) {
      // Neutral
      event = {
        type: 'neutral',
        ...this.getNeutralWork(task.history.length),
        impact: 0
      };
    } else {
      // Advance
      const baseAdvance = this.getBaseAdvance(progress);
      const momentumMultiplier = progress < 75
        ? 1 + momentum * 0.2
        : 1 + Math.min(momentum, 1) * 0.05;
      const strategyMultiplier = strategy === 'quality' ? 0.88 : strategy === 'speed' ? 1.18 : 1;
      const impact = baseAdvance * momentumMultiplier * strategyMultiplier;
      event = {
        type: 'advance',
        ...this.getAdvanceWork(task.history.length),
        impact
      };
    }

    // Near the end even failures become smaller: the project stops collapsing by
    // whole percentages and instead gets stuck in increasingly tiny regressions.
    if (event.impact > 0 && progress >= 75) {
      const advanceCap = progress < 90
        ? 2.4
        : progress < 95
          ? 0.75
          : progress < 99
            ? 0.3
            : 0.055;
      event = { ...event, impact: Math.min(event.impact, advanceCap) };
    }

    if (event.impact < 0 && progress >= 75) {
      const setbackCap = progress < 90
        ? 1.4
        : progress < 95
          ? 0.6
          : progress < 99
            ? 0.25
            : 0.06;
      event = { ...event, impact: Math.max(event.impact, -setbackCap) };
    }

    let newProgress = progress + event.impact;

    // Check for the 99.99% barrier
    if (newProgress >= this.MAX_PROGRESS) {
      newProgress = this.MAX_PROGRESS;
      if (progress >= 99.985) {
        // Trigger a forced setback if we're hitting the wall repeatedly
        const forcedImpact = -(Math.random() * 0.04 + 0.01);
        event = {
          type: 'setback',
          operation: 'run',
          target: 'npm run build',
          description: "The final build exposed a regression in the project structure. Returning to the last working version.",
          impact: forcedImpact
        };
        newProgress = progress + forcedImpact;
      }
    }

    newProgress = Math.max(0, Math.min(this.MAX_PROGRESS, newProgress));

    // Update momentum
    let newMomentum = momentum;
    if (event.type === 'advance') newMomentum += 0.1;
    if (event.type === 'setback') newMomentum = Math.max(0, momentum - 0.5);

    return recordWorkContext({
      ...task,
      progress: newProgress,
      momentum: newMomentum,
      history: [event, ...task.history].slice(0, 50),
      lastUpdate: Date.now(),
      status: newProgress > 95 ? 'Almost Done' : 'Active',
      personality: personality,
    }, {
      contextGrowthTokens: getOperationContextGrowth(event.operation),
      contextText: `${event.target || ''} ${event.description}`,
    });
  }

  private static calculateDeploymentDisaster(task: TaskState): TaskState {
    const deployment = task.deploymentRun!;
    const step = deployment.step;
    const backlogAdded = [4, 7, 12, 9, 16, 6, 21, 11, 14, 8, 19, 13, 17, 5, 24, 10, 18, 15, 22, 31][step]
      ?? 12;
    const event = deployment.willSucceed
      ? this.getSuccessfulDeploymentEvent(deployment.scheme, step)
      : this.getDeploymentDisasterEvent(deployment.scheme, step, backlogAdded);
    const nextStep = step + 1;
    const isFinished = nextStep >= DEPLOYMENT_DISASTER_STEPS;
    const isSuccessful = isFinished && deployment.willSucceed;
    const progress = isSuccessful
      ? 100
      : deployment.willSucceed
        ? Math.min(99.99, task.progress + Math.max(0, event.impact))
        : Math.max(72, task.progress + event.impact);
    return recordWorkContext({
      ...task,
      progress,
      momentum: Math.max(0, task.momentum - 0.35),
      history: [event, ...task.history].slice(0, 50),
      lastUpdate: Date.now(),
      status: isSuccessful ? 'Deployed' : progress > 95 ? 'Almost Done' : 'Active',
      failedDeployments: (task.failedDeployments || 0)
        + (isFinished && !deployment.willSucceed ? 1 : 0),
      deploymentRun: {
        ...deployment,
        step: nextStep,
        backlog: deployment.backlog + (deployment.willSucceed ? 0 : backlogAdded),
        outcome: isFinished
          ? deployment.willSucceed ? 'successful' : 'catastrophic'
          : 'deploying',
      },
    }, {
      contextGrowthTokens: getOperationContextGrowth(event.operation),
      contextText: `${event.target || ''} ${event.description}`,
    });
  }

  private static getSuccessfulDeploymentEvent(
    scheme: DeploymentScheme,
    step: number,
  ): SimulationEvent {
    const schemeLabels: Record<DeploymentScheme, string> = {
      canary: 'canary release',
      blue_green: 'blue-green environment',
      rolling: 'rolling update',
      dns_switch: 'DNS switch',
      migration_first: 'production migration',
      direct_prod: 'direct production release',
    };
    const events: Array<Pick<SimulationEvent, 'description' | 'operation' | 'target' | 'impact'>> = [
      { operation: 'run', target: 'npm run build', description: 'The final build passed. The artifact has been tagged with an immutable version.', impact: 0.04 },
      { operation: 'run', target: 'npm test', description: 'The critical user journey passed before release.', impact: 0.03 },
      { operation: 'read', target: 'deploy/checklist.md', description: 'The team reviewed rollback, migrations, and observability.', impact: 0.03 },
      { operation: 'run', target: 'deploy production', description: `The ${schemeLabels[scheme]} has started. The first instances are responding normally.`, impact: 0.04 },
      { operation: 'read', target: 'observability/error-rate', description: 'Errors, latency, and resource usage remain within normal bounds.', impact: 0.03 },
      { operation: 'run', target: 'smoke-test --production', description: 'The production smoke test passed on real routes.', impact: 0.04 },
      { operation: 'read', target: 'support/inbox', description: 'No new support requests have appeared since release. The team keeps watching.', impact: 0.03 },
      { operation: 'run', target: 'release finalize', description: 'The deployment is declared successful. The release is serving users reliably.', impact: 0.08 },
    ];
    const event = events[Math.min(step, events.length - 1)];
    return { type: 'advance', ...event };
  }

  private static getDeploymentDisasterEvent(
    scheme: DeploymentScheme,
    step: number,
    backlogAdded: number
  ): SimulationEvent {
    const schemeOpeners: Record<DeploymentScheme, Array<Pick<SimulationEvent, 'description' | 'operation' | 'target' | 'impact'>>> = {
      canary: [
        { operation: 'run', target: 'deploy --canary=5%', description: 'The canary received the first 5% of traffic. By chance, that included every paying user.', impact: -0.35 },
        { operation: 'read', target: 'observability/error-rate', description: 'The error rate looks normal: the metrics were sent by the old version of the app.', impact: -0.45 },
        { operation: 'modify', target: 'traffic-split.yaml', description: 'Automation treated the absence of fresh errors as success and expanded the canary to 100%.', impact: -0.8 },
      ],
      blue_green: [
        { operation: 'run', target: 'deploy blue-green', description: 'The green environment is up. It uses the production database but, for some reason, the staging schema.', impact: -0.4 },
        { operation: 'modify', target: 'load-balancer/routes', description: 'Traffic switched to green. Old WebSocket sessions stayed alive in blue and are arguing with the new version.', impact: -0.65 },
        { operation: 'run', target: 'rollback --to=blue', description: 'Rollback restored blue, but the migration had already made the data incompatible with both environments.', impact: -1.05 },
      ],
      rolling: [
        { operation: 'run', target: 'kubectl rollout restart deployment/app', description: 'The rolling update began replacing pods. The first new pod passed readiness because it checked only its own existence.', impact: -0.3 },
        { operation: 'read', target: 'cluster/events', description: 'Old and new pods are processing the queue in different formats at the same time.', impact: -0.7 },
        { operation: 'run', target: 'kubectl rollout undo', description: 'Rollout undo restored the image, but not the messages already transformed by the new version.', impact: -0.95 },
      ],
      dns_switch: [
        { operation: 'run', target: 'deploy secondary-vps', description: 'The second machine came up successfully and immediately discovered that the secrets exist only on the first.', impact: -0.35 },
        { operation: 'modify', target: 'dns/A-record', description: 'DNS switched. Half the clients saw the new server; the other half kept writing to the old database.', impact: -0.75 },
        { operation: 'run', target: 'dns rollback', description: 'The record was restored. TTL explained that “back” is merely a recommendation in a distributed system.', impact: -0.9 },
      ],
      migration_first: [
        { operation: 'run', target: 'npm run migrate:prod', description: 'Started the reversibly designed migration. The first ALTER TABLE acquired an exclusive lock.', impact: -0.45 },
        { operation: 'read', target: 'database/locks', description: 'The request queue is growing while the health check stays green: it reads the constant SELECT 1.', impact: -0.65 },
        { operation: 'run', target: 'npm run migrate:down', description: 'The down migration exists only in the README. In code, it was left to a future responsible developer.', impact: -1.15 },
      ],
      direct_prod: [
        { operation: 'run', target: 'deploy --prod --skip-checks', description: 'The direct deployment finished in eight seconds. That was the last positive metric.', impact: -0.5 },
        { operation: 'read', target: 'production/logs', description: 'Production reached an unknown code path that nobody could trigger locally.', impact: -0.8 },
        { operation: 'run', target: 'rollback latest', description: 'Rollback pointed to the same build: the latest tag turned out to be a worldview, not a versioning system.', impact: -1.2 },
      ],
    };

    const cascade: Array<Pick<SimulationEvent, 'description' | 'operation' | 'target' | 'impact'>> = [
      { operation: 'run', target: 'health-check --all-regions', description: 'The health check passes from one region and fails from the rest. Geography is part of the business logic again.', impact: -0.55 },
      { operation: 'read', target: 'sentry/issues', description: 'Sentry merged twelve different exceptions into one “Something went wrong” event. Very supportive.', impact: -0.7 },
      { operation: 'fix', target: 'app/api/session/route.ts', description: 'Sessions reset on every request: the new signing key differs from the old one on half the instances.', impact: -0.85 },
      { operation: 'read', target: 'billing/webhooks', description: 'Payment webhooks repeated after a timeout. Several orders are simultaneously paid, canceled, and philosophically indeterminate.', impact: -0.9 },
      { operation: 'modify', target: 'queue/consumer.ts', description: 'Temporarily stopped the consumer. The producer took it as an invitation to accumulate two million messages.', impact: -0.65 },
      { operation: 'run', target: 'npm audit --production', description: 'The security scanner found a critical vulnerability in the very package added for safe deployments.', impact: -0.45 },
      { operation: 'read', target: 'cdn/cache-status', description: 'The CDN cached the outage page for a day. Now fault tolerance works only for the error itself.', impact: -0.75 },
      { operation: 'fix', target: 'database/replication', description: 'The replica fell behind and became the source of truth after an automatic failover.', impact: -1.0 },
      { operation: 'create', target: 'INCIDENT-POSTMORTEM.md', description: 'Created the postmortem before the incident ended. The “why monitoring missed it” section is already the most detailed.', impact: -0.35 },
      { operation: 'run', target: 'restore backup', description: 'The last verified backup restored perfectly—into the schema from two versions ago.', impact: -1.1 },
      { operation: 'modify', target: 'feature-flags.json', description: 'Disabled the new feature. Only the client read the flag; the destructive part lived on the server.', impact: -0.7 },
      { operation: 'read', target: 'support/inbox', description: 'The first users described an edge case in detail that did not exist in our product model.', impact: -0.6 },
      { operation: 'run', target: 'status-page publish', description: 'The status page went down under load from users checking why the app was down.', impact: -0.5 },
      { operation: 'fix', target: 'infra/terraform/state', description: 'Terraform found drift and offered to delete the only resource still responding.', impact: -0.8 },
      { operation: 'create', target: 'backlog/deployment-recovery', description: 'Split recovery into epics. Every epic immediately demanded its own platform team.', impact: -0.4 },
      { operation: 'run', target: 'rollback --final', description: 'The final rollback is complete. The system starts again, but nobody knows which data is real.', impact: -1.25 },
      { operation: 'create', target: 'docs/new-baseline.md', description: 'Recorded the new working state. It is worse than the old one, but honestly documented for the first time.', impact: -0.55 },
    ];

    const base = step < 3
      ? schemeOpeners[scheme][step]
      : cascade[(step - 3) % cascade.length];
    return {
      type: step === DEPLOYMENT_DISASTER_STEPS - 1 ? 'architecture_rewrite' : 'setback',
      ...base,
      description: `${base.description} Tasks added to the backlog: +${backlogAdded}.`,
    };
  }

  private static getBaseAdvance(progress: number): number {
    if (progress < 25) return Math.random() * 5 + 10;    // 10–15%: very fast
    if (progress < 50) return Math.random() * 4 + 8;     // 8–12%: very fast
    if (progress < 75) return Math.random() * 4 + 5;     // 5–9%: very fast
    if (progress < 90) return Math.random() * 1.2 + 1;   // 1–2.2%: moderate
    if (progress < 95) return Math.random() * 0.4 + 0.3; // 0.3–0.7%: slow
    if (progress < 99) return Math.random() * 0.18 + 0.1;// 0.1–0.28%: slower
    return Math.random() * 0.04 + 0.01;                  // 0.01–0.05%: crawl to 99.99
  }

  private static getNeutralWork(index: number): Pick<SimulationEvent, 'description' | 'operation' | 'target'> {
    const reads: Array<Pick<SimulationEvent, 'description' | 'operation' | 'target'>> = [
      { operation: 'search', target: 'rg --files app components lib', description: 'Found the main application files.' },
      { operation: 'read', target: 'package.json', description: 'Reviewed the available commands and dependencies.' },
      { operation: 'read', target: 'app/page.tsx', description: 'Studied the current layout and state management.' },
      { operation: 'read', target: 'app/globals.css', description: 'Reviewed the global styles and Tailwind layers.' },
    ];
    return reads[index % reads.length];
  }

  private static getSetbackWork(): Pick<SimulationEvent, 'description' | 'operation' | 'target'> {
    const setbacks: Array<Pick<SimulationEvent, 'description' | 'operation' | 'target'>> = [
      { operation: 'run', target: 'npm run build', description: 'The build stopped on a type error in app/page.tsx.' },
      { operation: 'run', target: 'npm run lint', description: 'The linter found a hooks rule violation.' },
      { operation: 'fix', target: 'app/page.tsx', description: 'Fixing a hydration mismatch after the first render.' },
      { operation: 'fix', target: 'components/ProjectPreview.tsx', description: 'The component accessed data before it loaded.' },
      { operation: 'modify', target: 'package.json', description: 'Dependency versions conflict. Restoring a compatible combination.' },
      { operation: 'run', target: 'npx tsc --noEmit', description: "TypeScript: 'undefined' cannot be passed to a required prop." },
      { operation: 'fix', target: 'app/globals.css', description: 'Resolving a conflict between mobile styles and the desktop layout.' },
      { operation: 'run', target: 'npm run build', description: 'Chunk optimization exceeded the available memory limit.' },
    ];
    return setbacks[Math.floor(Math.random() * setbacks.length)];
  }

  private static getAdvanceWork(index: number): Pick<SimulationEvent, 'description' | 'operation' | 'target'> {
    const workflow: Array<Pick<SimulationEvent, 'description' | 'operation' | 'target'>> = [
      { operation: 'search', target: 'rg --files app components lib', description: 'Indexed the project structure.' },
      { operation: 'read', target: 'package.json', description: 'Reviewed the stack, dependencies, and available scripts.' },
      { operation: 'read', target: 'app/page.tsx', description: 'Mapped the current UI and data flow.' },
      { operation: 'modify', target: 'app/page.tsx', description: 'Built the primary user journey.' },
      { operation: 'create', target: 'components/ProjectPreview.tsx', description: 'Added a dedicated preview component.' },
      { operation: 'modify', target: 'app/globals.css', description: 'Added responsive states and mobile styles.' },
      { operation: 'modify', target: 'lib/engine/simulation.ts', description: 'Connected state updates and transition handling.' },
      { operation: 'create', target: 'components/EmptyState.tsx', description: 'Added a state for the first launch with no data.' },
      { operation: 'run', target: 'npx tsc --noEmit', description: 'Type checking completed without errors.' },
      { operation: 'run', target: 'npm run build', description: 'The production build completed successfully.' },
      { operation: 'read', target: 'app/page.tsx', description: 'Rechecked the final flow after the build.' },
      { operation: 'modify', target: 'components/ProjectPreview.tsx', description: 'Refined the loading, empty, and error states.' },
    ];
    return workflow[index % workflow.length];
  }
}
