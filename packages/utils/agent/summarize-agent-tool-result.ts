import type { UnknownRecord } from '../data/extract.util';
import { isRecord, readString } from '../data/extract.util';

/**
 * Short sentence shown beside an agent tool name.
 *
 * The model still receives the full payload on its own path. This string is
 * only for the timeline, so it must not be the raw JSON.
 */

const FILLER_RESULTS = new Set([
  'completed',
  'completed successfully',
  'done',
  'ok',
  'success',
]);

const NOUNS: Record<string, { none: string; one: string; many: string }> = {
  asset: { none: 'assets', one: 'asset', many: 'assets' },
  avatar: { none: 'avatars', one: 'avatar', many: 'avatars' },
  brand: { none: 'brands', one: 'brand', many: 'brands' },
  character: { none: 'characters', one: 'character', many: 'characters' },
  gif: { none: 'gifs', one: 'gif', many: 'gifs' },
  image: { none: 'images', one: 'image', many: 'images' },
  item: { none: 'items', one: 'item', many: 'items' },
  music: { none: 'music', one: 'music file', many: 'music files' },
  post: { none: 'posts', one: 'post', many: 'posts' },
  result: { none: 'results', one: 'result', many: 'results' },
  tool: { none: 'tools', one: 'tool', many: 'tools' },
  video: { none: 'videos', one: 'video', many: 'videos' },
};

const LIST_KEYS = [
  ['posts', 'post'],
  ['results', 'result'],
  ['items', 'item'],
  ['brands', 'brand'],
  ['campaigns', 'campaign'],
] as const;

const PROSE_KEYS = ['message', 'summary', 'summaryText'] as const;

const REVIEW_KEYS = [
  ['pendingCount', 'pending'],
  ['readyCount', 'ready'],
  ['changesRequestedCount', 'changes requested'],
  ['approvedCount', 'approved'],
] as const;

export function summarizeAgentToolResult(value: unknown): string {
  const summary = describeToolResult(value).trim();
  if (!summary || FILLER_RESULTS.has(summary.toLowerCase())) {
    return '';
  }
  return summary;
}

function describeToolResult(value: unknown, depth = 0): string {
  if (typeof value === 'string') {
    return describeString(value, depth);
  }
  if (Array.isArray(value)) {
    return countPhrase(value.length, 'result');
  }
  if (!isRecord(value)) {
    return '';
  }
  return describeRecord(value);
}

function describeString(value: string, depth: number): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const isJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (depth > 0 || !isJson) {
    return isJson ? '' : trimmed;
  }
  try {
    return describeToolResult(JSON.parse(trimmed) as unknown, 1);
  } catch {
    return '';
  }
}

function describeRecord(record: UnknownRecord): string {
  if (isRecord(record.currentBrand)) {
    return (
      readString(record.currentBrand.name) ??
      readString(record.currentBrand.label) ??
      ''
    );
  }

  return (
    summarizeAssets(record) ??
    summarizeCharacters(record) ??
    summarizeTools(record) ??
    summarizeReview(record) ??
    summarizeProse(record) ??
    summarizeLists(record) ??
    summarizeCounted(record) ??
    summarizeStatus(record) ??
    summarizeName(record) ??
    ''
  );
}

function summarizeAssets(record: UnknownRecord): string | undefined {
  const assets = Array.isArray(record.assets) ? record.assets : undefined;
  const type = readString(record.type);
  const count = readCount(record.count);
  if (!assets && !(type && count !== undefined)) {
    return undefined;
  }
  return countPhrase(count ?? assets?.length ?? 0, type ?? 'asset');
}

function summarizeCharacters(record: UnknownRecord): string | undefined {
  if (!Array.isArray(record.characters)) {
    return undefined;
  }
  return countPhrase(record.characters.length, 'character');
}

function summarizeTools(record: UnknownRecord): string | undefined {
  if (!Array.isArray(record.tools)) {
    return undefined;
  }
  const total = readCount(record.total) ?? record.tools.length;
  const returned = readCount(record.returned) ?? record.tools.length;
  if (returned < total) {
    return `${returned} of ${total} tools`;
  }
  return countPhrase(total, 'tool');
}

function summarizeReview(record: UnknownRecord): string | undefined {
  const hasQueue = REVIEW_KEYS.some(
    ([key]) => readCount(record[key]) !== undefined,
  );
  if (!hasQueue) {
    const totalPending = readCount(record.totalPending);
    if (totalPending === undefined) {
      return undefined;
    }
    return totalPending === 0
      ? 'Nothing waiting for review'
      : `${totalPending} pending`;
  }

  const parts = REVIEW_KEYS.flatMap(([key, label]) => {
    const count = readCount(record[key]) ?? 0;
    return count > 0 ? [`${count} ${label}`] : [];
  });
  return parts.length > 0 ? parts.join(', ') : 'Nothing waiting for review';
}

function summarizeProse(record: UnknownRecord): string | undefined {
  for (const key of PROSE_KEYS) {
    const text = readString(record[key]);
    if (
      !text ||
      text.length > 180 ||
      text.startsWith('{') ||
      text.startsWith('[')
    ) {
      continue;
    }
    return text;
  }
  return undefined;
}

function summarizeLists(record: UnknownRecord): string | undefined {
  for (const [key, noun] of LIST_KEYS) {
    if (Array.isArray(record[key])) {
      return countPhrase(record[key].length, noun);
    }
  }
  return undefined;
}

function summarizeCounted(record: UnknownRecord): string | undefined {
  const totalPosts = readCount(record.totalPosts);
  if (totalPosts !== undefined) {
    return countPhrase(totalPosts, 'post');
  }
  const count = readCount(record.count);
  const platform = readString(record.platform);
  if (count === undefined || !platform) {
    return undefined;
  }
  return count === 0 ? `No results on ${platform}` : `${count} on ${platform}`;
}

function summarizeStatus(record: UnknownRecord): string | undefined {
  const status = readString(record.status);
  if (!status || !/^[a-z][a-z_-]{0,31}$/i.test(status)) {
    return undefined;
  }
  const statusLabel = humanizeToken(status);
  const kind = readString(record.kind);
  if (!kind || !/^[a-z][a-z_-]{0,24}$/i.test(kind)) {
    return statusLabel;
  }
  return `${humanizeToken(kind)} ${statusLabel.toLowerCase()}`;
}

function summarizeName(record: UnknownRecord): string | undefined {
  const name =
    readString(record.name) ??
    readString(record.label) ??
    readString(record.externalName);
  if (!name || name.length > 80 || name.includes('{')) {
    return undefined;
  }
  return name;
}

function countPhrase(count: number, type: string): string {
  const label = nounFor(type, count);
  return count === 0 ? `No ${label}` : `${count} ${label}`;
}

function nounFor(type: string, count: number): string {
  const known = NOUNS[type.toLowerCase()];
  if (known) {
    if (count === 0) return known.none;
    if (count === 1) return known.one;
    return known.many;
  }
  const key = type.toLowerCase();
  if (count === 1) return key;
  return key.endsWith('s') ? key : `${key}s`;
}

function humanizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function readCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
