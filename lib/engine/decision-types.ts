import type { DeploymentScheme, EventType, ProjectStrategy } from './simulation';
import type { ResourceEffects, ResourceKey } from './resources';

export type ChoiceTone = 'safe' | 'balanced' | 'risky';

export interface SimulationChoice {
  id: string;
  label: string;
  description: string;
  tone: ChoiceTone;
  progressDelta: number;
  momentumDelta: number;
  eventType: EventType;
  strategy?: ProjectStrategy;
  deploymentScheme?: DeploymentScheme;
  deploymentChanceDelta?: number;
  acknowledgement?: string;
  resourceEffects: ResourceEffects;
  hiddenResourceEffects: ResourceKey[];
  tokenCost: number;
}

export type ChoiceTemplate = Omit<
  SimulationChoice,
  'id' | 'resourceEffects' | 'hiddenResourceEffects' | 'tokenCost'
> & { resourceEffects?: ResourceEffects };

export type ProjectKind = 'site' | 'store' | 'dashboard' | 'mobile' | 'bot' | 'service' | 'generic';
export type ProjectPhase = 'foundation' | 'experience' | 'data' | 'hardening' | 'release';

export interface ProjectProfile {
  kind: ProjectKind;
  subject: string;
  surface: string;
  coreFlow: string;
  data: string;
  mainRisk: string;
  releaseTarget: string;
}
