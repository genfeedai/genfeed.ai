import type { RunActionType, RunRecord } from '~services/runs.service';

export interface PostResultEntry {
  externalId?: string;
  message?: string;
  platform?: string;
  publishedUrl?: string;
  raw?: Record<string, unknown>;
  status: 'published' | 'failed' | 'unknown';
  timestamp?: string;
}

export interface AnalyticsSnapshot {
  clicks: number;
  engagementRate: number;
  failed: number;
  generated: number;
  impressions: number;
  lastSnapshotAt: string | null;
  publishSuccessRate: number;
  published: number;
}

const NUMBER_PATHS: Record<
  Exclude<keyof AnalyticsSnapshot, 'lastSnapshotAt' | 'publishSuccessRate'>,
  Array<Array<string | number>>
> = {
  clicks: [['clicks'], ['metrics', 'clicks'], ['kpis', 'clicks']],
  engagementRate: [
    ['engagementRate'],
    ['metrics', 'engagementRate'],
    ['kpis', 'engagementRate'],
  ],
  failed: [['failed'], ['counts', 'failed'], ['kpis', 'failed']],
  generated: [['generated'], ['counts', 'generated'], ['kpis', 'generated']],
  impressions: [
    ['impressions'],
    ['metrics', 'impressions'],
    ['kpis', 'impressions'],
  ],
  published: [['published'], ['counts', 'published'], ['kpis', 'published']],
};

const TIMESTAMP_PATHS: Array<Array<string | number>> = [
  ['snapshotAt'],
  ['generatedAt'],
  ['timestamp'],
  ['createdAt'],
  ['kpis', 'snapshotAt'],
];

const GENERATED_CONTENT_PATHS: Array<Array<string | number>> = [
  ['generatedContent'],
  ['content'],
  ['text'],
  ['caption'],
  ['copy'],
  ['result', 'content'],
  ['result', 'text'],
  ['output', 'content'],
  ['draft', 'content'],
  ['items', 0, 'content'],
  ['variants', 0, 'content'],
  ['posts', 0, 'content'],
  ['artifacts', 0, 'content'],
];

const POST_RESULT_ARRAY_PATHS: Array<Array<string | number>> = [
  ['publishedPosts'],
  ['posts'],
  ['results'],
  ['output', 'posts'],
  ['data'],
  ['items'],
];

const POST_RESULT_FIELD_PATHS: Record<string, Array<Array<string | number>>> = {
  externalId: [['externalId'], ['id'], ['postId'], ['platformPostId']],
  message: [['message'], ['detail'], ['error']],
  platform: [['platform'], ['channel'], ['network']],
  publishedUrl: [['publishedUrl'], ['externalUrl'], ['url'], ['permalink']],
  status: [['status'], ['state'], ['publishStatus']],
  timestamp: [['publishedAt'], ['timestamp'], ['completedAt'], ['createdAt']],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getNestedValue(
  source: unknown,
  path: Array<string | number>,
): unknown {
  let cursor: unknown = source;

  for (const key of path) {
    if (Array.isArray(cursor) && typeof key === 'number') {
      cursor = cursor[key];
      continue;
    }

    if (isRecord(cursor) && typeof key === 'string') {
      cursor = cursor[key];
      continue;
    }

    return undefined;
  }

  return cursor;
}

function getStringByPaths(
  source: unknown,
  paths: Array<Array<string | number>>,
): string | null {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getNumberByPaths(
  source: unknown,
  paths: Array<Array<string | number>>,
): number | null {
  for (const path of paths) {
    const value = getNestedValue(source, path);

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function stableSerialize(input: unknown): string {
  if (input === null || input === undefined) {
    return String(input);
  }

  if (typeof input !== 'object') {
    return JSON.stringify(input);
  }

  if (Array.isArray(input)) {
    return `[${input.map((item) => stableSerialize(item)).join(',')}]`;
  }

  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const pairs = keys.map(
    (key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`,
  );
  return `{${pairs.join(',')}}`;
}

function hashFNV1a(text: string): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash =
      (hash +
        (hash << 1) +
        (hash << 4) +
        (hash << 7) +
        (hash << 8) +
        (hash << 24)) >>>
      0;
  }

  return hash.toString(16).padStart(8, '0');
}

function toPostResultEntry(value: unknown): PostResultEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const statusRaw = getStringByPaths(value, POST_RESULT_FIELD_PATHS.status);
  const normalizedStatus =
    statusRaw?.toLowerCase() === 'published' ||
    statusRaw?.toLowerCase() === 'completed' ||
    statusRaw?.toLowerCase() === 'success'
      ? 'published'
      : statusRaw?.toLowerCase() === 'failed' ||
          statusRaw?.toLowerCase() === 'error'
        ? 'failed'
        : 'unknown';

  const entry: PostResultEntry = {
    externalId:
      getStringByPaths(value, POST_RESULT_FIELD_PATHS.externalId) ?? undefined,
    message:
      getStringByPaths(value, POST_RESULT_FIELD_PATHS.message) ?? undefined,
    platform:
      getStringByPaths(value, POST_RESULT_FIELD_PATHS.platform) ?? undefined,
    publishedUrl:
      getStringByPaths(value, POST_RESULT_FIELD_PATHS.publishedUrl) ??
      undefined,
    raw: value,
    status: normalizedStatus,
    timestamp:
      getStringByPaths(value, POST_RESULT_FIELD_PATHS.timestamp) ?? undefined,
  };

  if (
    !entry.publishedUrl &&
    !entry.externalId &&
    !entry.message &&
    !statusRaw
  ) {
    return null;
  }

  return entry;
}

export function buildRunIdempotencyKey(
  actionType: Extract<RunActionType, 'post' | 'composite'>,
  input: Record<string, unknown>,
  brandId?: string | null,
): string {
  const fingerprint = stableSerialize({
    actionType,
    brandId: brandId ?? null,
    input,
  });

  return `ext:${actionType}:${hashFNV1a(fingerprint)}`;
}

export function extractGeneratedPreview(output: unknown): string | null {
  return getStringByPaths(output, GENERATED_CONTENT_PATHS);
}

export function extractPostResults(output: unknown): PostResultEntry[] {
  const arrayCandidate = POST_RESULT_ARRAY_PATHS.map((path) =>
    getNestedValue(output, path),
  ).find((value) => Array.isArray(value));

  if (Array.isArray(arrayCandidate)) {
    return arrayCandidate
      .map((item) => toPostResultEntry(item))
      .filter((item): item is PostResultEntry => Boolean(item));
  }

  const single = toPostResultEntry(output);
  return single ? [single] : [];
}

export function summarizeRunHistory(runs: RunRecord[]): {
  failedPosts: number;
  generated: number;
  published: number;
} {
  return runs.reduce(
    (acc, run) => {
      if (run.actionType === 'generate' && run.status === 'completed') {
        acc.generated += 1;
      }

      if (run.actionType === 'post') {
        if (run.status === 'completed') {
          acc.published += 1;
        }

        if (run.status === 'failed') {
          acc.failedPosts += 1;
        }
      }

      return acc;
    },
    { failedPosts: 0, generated: 0, published: 0 },
  );
}

export function extractAnalyticsSnapshot(
  output: unknown,
  historyFallback: {
    failedPosts: number;
    generated: number;
    published: number;
  },
): AnalyticsSnapshot {
  const generated =
    getNumberByPaths(output, NUMBER_PATHS.generated) ??
    historyFallback.generated;
  const published =
    getNumberByPaths(output, NUMBER_PATHS.published) ??
    historyFallback.published;
  const failed =
    getNumberByPaths(output, NUMBER_PATHS.failed) ??
    historyFallback.failedPosts;

  const publishBase = published + failed;
  const publishSuccessRate =
    publishBase > 0 ? (published / publishBase) * 100 : 0;

  return {
    clicks: getNumberByPaths(output, NUMBER_PATHS.clicks) ?? 0,
    engagementRate: getNumberByPaths(output, NUMBER_PATHS.engagementRate) ?? 0,
    failed,
    generated,
    impressions: getNumberByPaths(output, NUMBER_PATHS.impressions) ?? 0,
    lastSnapshotAt: getStringByPaths(output, TIMESTAMP_PATHS),
    published,
    publishSuccessRate,
  };
}
