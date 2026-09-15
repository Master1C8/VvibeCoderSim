import type { TaskState } from './simulation';

export const hashText = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

export const getDecisionSeed = (task: TaskState) => hashText(
  `${task.id}:${task.lastUpdate}:${task.history.length}:${Math.floor(task.progress)}`,
);
