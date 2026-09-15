import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
  getLeaderboardSnapshot,
  type LeaderboardEntry,
  type LeaderboardSubmission,
  upsertLeaderboardEntry,
} from '@/lib/game/leaderboard';
import { hasSameOrigin, isLikelyBot, isRateLimited } from '@/lib/server/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_STORED_ENTRIES = 500;
const DATA_DIRECTORY = process.env.VVIBECODER_DATA_DIR || path.join(process.cwd(), '.data');
const LEADERBOARD_FILE = path.join(DATA_DIRECTORY, 'leaderboard.json');

let mutationQueue: Promise<void> = Promise.resolve();

const readEntries = async (): Promise<LeaderboardEntry[]> => {
  try {
    const raw = await readFile(LEADERBOARD_FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isLeaderboardEntry) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
};

const writeEntries = async (entries: LeaderboardEntry[]) => {
  await mkdir(DATA_DIRECTORY, { recursive: true });
  const temporaryFile = `${LEADERBOARD_FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(entries), { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryFile, LEADERBOARD_FILE);
};

const isLeaderboardEntry = (value: unknown): value is LeaderboardEntry => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<LeaderboardEntry>;
  return typeof entry.id === 'string'
    && typeof entry.projectName === 'string'
    && Array.isArray(entry.programmerNames)
    && entry.programmerNames.every(name => typeof name === 'string')
    && Number.isFinite(entry.totalTokensSpent)
    && Number.isFinite(entry.failedDeployments)
    && Number.isFinite(entry.completedAt);
};

const cleanText = (value: unknown, maximumLength: number) => (
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximumLength) : ''
);

const parseSubmission = (value: unknown): LeaderboardSubmission | null => {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<LeaderboardSubmission>;
  const id = cleanText(input.id, 128);
  const projectName = cleanText(input.projectName, 80);
  const programmerNames = Array.isArray(input.programmerNames)
    ? input.programmerNames.map(name => cleanText(name, 40)).filter(Boolean).slice(0, 8)
    : [];
  const totalTokensSpent = Math.round(Number(input.totalTokensSpent));
  const failedDeployments = Math.round(Number(input.failedDeployments));

  if (!/^[a-z0-9_-]+$/i.test(id) || !projectName || programmerNames.length === 0) return null;
  if (!Number.isFinite(totalTokensSpent) || totalTokensSpent <= 0 || totalTokensSpent > 1_000_000_000_000) return null;
  if (!Number.isFinite(failedDeployments) || failedDeployments < 0 || failedDeployments > 1_000_000) return null;

  return { id, projectName, programmerNames, totalTokensSpent, failedDeployments };
};

const jsonError = (message: string, status: number) => NextResponse.json({ error: message }, { status });

const noStoreHeaders = { 'cache-control': 'no-store' };

export const GET = async () => {
  try {
    return NextResponse.json(getLeaderboardSnapshot(await readEntries(), null), { headers: noStoreHeaders });
  } catch {
    return jsonError('Could not load the leaderboard.', 500);
  }
};

export const POST = async (request: NextRequest) => {
  if (!hasSameOrigin(request)) return jsonError('Invalid request origin.', 403);
  if (isLikelyBot(request)) return jsonError('Automated submissions are not accepted.', 403);
  if (isRateLimited(request, 'leaderboard-submit', 10, 60 * 60 * 1000)) {
    return jsonError('Too many leaderboard submissions.', 429);
  }
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > 10_000) return jsonError('Result is too large.', 413);

  let raw = '';
  try {
    raw = await request.text();
  } catch {
    return jsonError('Could not read the result.', 400);
  }
  if (raw.length > 10_000) return jsonError('Result is too large.', 413);

  let submission: LeaderboardSubmission | null = null;
  try {
    submission = parseSubmission(JSON.parse(raw));
  } catch {
    return jsonError('Invalid result.', 400);
  }
  if (!submission) return jsonError('Invalid result.', 400);

  let resolveMutation: (() => void) | undefined;
  const previousMutation = mutationQueue;
  mutationQueue = new Promise<void>(resolve => { resolveMutation = resolve; });
  await previousMutation;

  try {
    const nextEntries = upsertLeaderboardEntry(await readEntries(), {
      ...submission,
      completedAt: Date.now(),
    }).slice(0, MAX_STORED_ENTRIES);
    await writeEntries(nextEntries);
    return NextResponse.json(getLeaderboardSnapshot(nextEntries, submission.id), { headers: noStoreHeaders });
  } catch {
    return jsonError('Could not save the result.', 500);
  } finally {
    resolveMutation?.();
  }
};
