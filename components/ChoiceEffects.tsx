"use client"

import type { SimulationChoice } from '@/lib/engine/decision';
import { RESOURCE_LABELS, type ResourceEffects, type ResourceKey } from '@/lib/engine/resources';
import { cn } from '@/lib/utils';

const RESOURCE_KEYS: ResourceKey[] = ['money', 'motivation', 'team'];

const getEffectSymbol = (value: number) => {
  if (value >= 10) return '++';
  if (value > 0) return '+';
  if (value <= -10) return '--';
  return '-';
};

interface ResourceEffectBadgesProps {
  resourceEffects: ResourceEffects;
  hiddenResourceEffects?: ResourceKey[];
}

export const ResourceEffectBadges = ({
  resourceEffects,
  hiddenResourceEffects = [],
}: ResourceEffectBadgesProps) => (
  <>
    {RESOURCE_KEYS.filter(resource => (resourceEffects[resource] || 0) !== 0).map(resource => {
      const value = resourceEffects[resource] || 0;
      const isHidden = hiddenResourceEffects.includes(resource);
      return (
        <span
          key={resource}
          className={cn(
            'rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold',
            isHidden
              ? 'bg-gray-100 text-gray-400'
              : value > 0
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-600',
          )}
        >
          {RESOURCE_LABELS[resource]} {isHidden ? '?' : getEffectSymbol(value)}
        </span>
      );
    })}
  </>
);

export const ChoiceEffects = ({ choice }: { choice: SimulationChoice }) => (
  <div className="mt-1.5 flex flex-wrap gap-1.5">
    <ResourceEffectBadges
      resourceEffects={choice.resourceEffects}
      hiddenResourceEffects={choice.hiddenResourceEffects}
    />
    {Boolean(choice.deploymentChanceDelta) && (
      <span className={cn(
        'rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold',
        (choice.deploymentChanceDelta || 0) > 0
          ? 'bg-purple-50 text-purple-700'
          : 'bg-amber-50 text-amber-700',
      )}>
        Deploy chance {(choice.deploymentChanceDelta || 0) > 0 ? '+' : ''}{choice.deploymentChanceDelta}%
      </span>
    )}
  </div>
);
