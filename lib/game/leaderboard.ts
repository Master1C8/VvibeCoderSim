export interface LeaderboardSubmission {
  id: string;
  projectName: string;
  programmerNames: string[];
  totalTokensSpent: number;
  failedDeployments: number;
}

export interface LeaderboardEntry extends LeaderboardSubmission {
  completedAt: number;
}

export interface LeaderboardSnapshot {
  entries: LeaderboardEntry[];
  currentEntry: LeaderboardEntry | null;
  currentRank: number | null;
  totalEntries: number;
}

export const compareLeaderboardEntries = (left: LeaderboardEntry, right: LeaderboardEntry) => (
  left.totalTokensSpent - right.totalTokensSpent
  || left.failedDeployments - right.failedDeployments
  || left.completedAt - right.completedAt
  || left.id.localeCompare(right.id)
);

export const sortLeaderboardEntries = (entries: LeaderboardEntry[]) => (
  [...entries].sort(compareLeaderboardEntries)
);

export const upsertLeaderboardEntry = (
  entries: LeaderboardEntry[],
  candidate: LeaderboardEntry,
) => {
  const existing = entries.find(entry => entry.id === candidate.id);
  const replacement = !existing || compareLeaderboardEntries(candidate, existing) < 0
    ? candidate
    : existing;
  return sortLeaderboardEntries([
    ...entries.filter(entry => entry.id !== candidate.id),
    replacement,
  ]);
};

export const getLeaderboardSnapshot = (
  entries: LeaderboardEntry[],
  currentId: string | null,
  limit = 10,
): LeaderboardSnapshot => {
  const sorted = sortLeaderboardEntries(entries);
  const currentIndex = currentId ? sorted.findIndex(entry => entry.id === currentId) : -1;
  return {
    entries: sorted.slice(0, limit),
    currentEntry: currentIndex >= 0 ? sorted[currentIndex] : null,
    currentRank: currentIndex >= 0 ? currentIndex + 1 : null,
    totalEntries: sorted.length,
  };
};
