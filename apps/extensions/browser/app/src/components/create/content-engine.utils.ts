import {
  getNestedValue,
  getNumberByPaths,
  getStringByPaths,
  isRecord,
} from '@genfeedai/utils/data/extract.util';

export interface PostResultEntry {
  externalId?: string;
  message?: string;
  platform?: string;
  publishedUrl?: string;
  raw?: Record<string, unknown>;
  status: 'draft' | 'published' | 'failed' | 'unknown';
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
  status: [['status'], ['state'], ['publishStatus'], ['executionState']],
  timestamp: [['publishedAt'], ['timestamp'], ['completedAt'], ['createdAt']],
};

function toPostResultEntry(value: unknown): PostResultEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const statusRaw = getStringByPaths(value, POST_RESULT_FIELD_PATHS.status);
  const normalizedStatus =
    statusRaw?.toLowerCase() === 'draft'
      ? 'draft'
      : statusRaw?.toLowerCase() === 'published' ||
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

export function extractGeneratedPreview(output: unknown): string | null {
  return getStringByPaths(output, GENERATED_CONTENT_PATHS);
}

export function extractPostResults(output: unknown): PostResultEntry[] {
  let arrayCandidate: unknown;
  for (const path of POST_RESULT_ARRAY_PATHS) {
    const value = getNestedValue(output, path);
    if (Array.isArray(value)) {
      arrayCandidate = value;
      break;
    }
  }

  if (Array.isArray(arrayCandidate)) {
    const results: PostResultEntry[] = [];
    for (const item of arrayCandidate) {
      const result = toPostResultEntry(item);
      if (result) {
        results.push(result);
      }
    }
    return results;
  }

  const single = toPostResultEntry(output);
  return single ? [single] : [];
}

export function extractAnalyticsSnapshot(
  output: unknown,
  fallback: {
    failedPosts: number;
    generated: number;
    published: number;
  } = { failedPosts: 0, generated: 0, published: 0 },
): AnalyticsSnapshot {
  const generated =
    getNumberByPaths(output, NUMBER_PATHS.generated) ?? fallback.generated;
  const published =
    getNumberByPaths(output, NUMBER_PATHS.published) ?? fallback.published;
  const failed =
    getNumberByPaths(output, NUMBER_PATHS.failed) ?? fallback.failedPosts;

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
