import { cache } from 'react';

/**
 * The bench lives in its own public repository so a stranger can clone it,
 * re-run the ladder, and check our arithmetic. This page is a reader of that
 * data and never a second source of it — nothing here is maintained by hand,
 * and there is no fallback ladder to show when the fetch fails.
 *
 * https://github.com/genfeedai/benchmark
 */

export const BENCHMARK_REPO_URL = 'https://github.com/genfeedai/benchmark';

const BENCHMARK_RAW_BASE =
  'https://raw.githubusercontent.com/genfeedai/benchmark/master';

/** Season data changes when a season is published, not on a page view. */
const REVALIDATE_SECONDS = 3600;
const FETCH_TIMEOUT_MS = 8000;

export type BenchmarkMedium = 'image' | 'video';
export type SeasonState = 'announced' | 'open' | 'closed';

export interface BenchmarkTask {
  id: string;
  version: number;
  medium: BenchmarkMedium;
  isDraft: boolean;
  title: string;
  rationale: string;
  prompt: string;
  referenceRoles: string[];
  outputSpec: {
    aspectRatio: string;
    count: number;
    durationSeconds?: number;
  };
  rubric: string[];
}

export interface BenchmarkContestant {
  id: string;
  label: string;
  provider: string;
  modelId: string;
  isCompiled: boolean;
  mediums: BenchmarkMedium[];
  addedAt: string;
  retiredAt: string | null;
}

export interface BenchmarkLadderEntry {
  rank: number;
  contestantId: string;
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  voids: number;
}

export interface BenchmarkSeason {
  id: string;
  title: string;
  medium: BenchmarkMedium;
  state: SeasonState;
  announcedAt: string;
  openedAt: string | null;
  closedAt: string | null;
  taskIds: string[];
  contestantIds: string[];
  matchCount: number;
  ladder: BenchmarkLadderEntry[];
  updatedAt: string;
}

export interface BenchmarkData {
  season: BenchmarkSeason;
  contestants: BenchmarkContestant[];
  tasks: BenchmarkTask[];
}

const SEASON_STATES: SeasonState[] = ['announced', 'open', 'closed'];
const MEDIUMS: BenchmarkMedium[] = ['image', 'video'];

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(`${BENCHMARK_RAW_BASE}/${path}`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`benchmark ${path} responded ${response.status}`);
  }

  return await response.json();
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const asNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one) => typeof one === 'string') : [];

const asMedium = (value: unknown): BenchmarkMedium =>
  MEDIUMS.find((one) => one === value) ?? 'image';

/**
 * The repository is the schema authority — it validates on every push. This
 * side re-checks only the shapes the page indexes into, so a malformed payload
 * degrades to the unavailable state instead of throwing inside a render.
 */
function parseSeason(value: unknown): BenchmarkSeason | null {
  if (!isRecord(value)) {
    return null;
  }

  const state = SEASON_STATES.find((one) => one === value.state);
  if (!state || typeof value.id !== 'string') {
    return null;
  }

  const ladder = Array.isArray(value.ladder)
    ? value.ladder.filter(isRecord).map((entry) => ({
        contestantId: asString(entry.contestantId),
        losses: asNumber(entry.losses),
        matches: asNumber(entry.matches),
        rank: asNumber(entry.rank),
        rating: asNumber(entry.rating),
        voids: asNumber(entry.voids),
        wins: asNumber(entry.wins),
      }))
    : [];

  return {
    announcedAt: asString(value.announcedAt),
    closedAt: typeof value.closedAt === 'string' ? value.closedAt : null,
    contestantIds: asStringArray(value.contestantIds),
    id: value.id,
    ladder,
    matchCount: asNumber(value.matchCount),
    medium: asMedium(value.medium),
    openedAt: typeof value.openedAt === 'string' ? value.openedAt : null,
    state,
    taskIds: asStringArray(value.taskIds),
    title: asString(value.title) || value.id,
    updatedAt: asString(value.updatedAt),
  };
}

function parseContestants(value: unknown): BenchmarkContestant[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).flatMap((entry) => {
    if (typeof entry.id !== 'string') {
      return [];
    }

    return [
      {
        addedAt: asString(entry.addedAt),
        id: entry.id,
        isCompiled: entry.isCompiled === true,
        label: asString(entry.label) || entry.id,
        mediums: asStringArray(entry.mediums).map(asMedium),
        modelId: asString(entry.modelId),
        provider: asString(entry.provider),
        retiredAt: typeof entry.retiredAt === 'string' ? entry.retiredAt : null,
      },
    ];
  });
}

function parseTasks(value: unknown): BenchmarkTask[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).flatMap((entry) => {
    if (typeof entry.id !== 'string') {
      return [];
    }

    const outputSpec = isRecord(entry.outputSpec) ? entry.outputSpec : {};
    const durationSeconds = asNumber(outputSpec.durationSeconds);

    return [
      {
        id: entry.id,
        isDraft: entry.isDraft === true,
        medium: asMedium(entry.medium),
        outputSpec: {
          aspectRatio: asString(outputSpec.aspectRatio),
          count: asNumber(outputSpec.count),
          ...(durationSeconds > 0 && { durationSeconds }),
        },
        prompt: asString(entry.prompt),
        rationale: asString(entry.rationale),
        referenceRoles: asStringArray(entry.referenceRoles),
        rubric: asStringArray(entry.rubric),
        title: asString(entry.title) || entry.id,
        version: asNumber(entry.version),
      },
    ];
  });
}

/**
 * Returns null when the bench cannot be read. The page says so rather than
 * rendering a stale or invented ladder — the one thing a benchmark cannot do
 * is show numbers it did not derive.
 */
export const getBenchmarkData = cache(
  async (seasonId = 's1-image'): Promise<BenchmarkData | null> => {
    try {
      const [season, contestants, tasks] = await Promise.all([
        fetchJson(`data/seasons/${seasonId}.json`).then(parseSeason),
        fetchJson('data/contestants.json').then(parseContestants),
        fetchJson('data/tasks.json').then(parseTasks),
      ]);

      if (!season) {
        return null;
      }

      return { contestants, season, tasks };
    } catch {
      return null;
    }
  },
);
