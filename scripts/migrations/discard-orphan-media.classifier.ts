/**
 * Pure classifier for the #581 orphan media discard script.
 *
 * Orphan (issue definition): stored media fields are all empty.
 * A derived-URL 404 is a runtime check — this classifier never HTTP-hits CDN/S3.
 */

export type DiscardAction = 'hard-delete' | 'soft-delete' | 'skip';

export type DiscardKind = 'ingredient' | 'asset' | 's3-68xx';

export interface IngredientMediaFields {
  cdnUrl?: string | null;
  s3Key?: string | null;
  sampleAudioUrl?: string | null;
}

export interface AssetMediaFields {
  cloudObjectKey?: string | null;
  parentArticleId?: string | null;
  parentBrandId?: string | null;
  parentIngredientId?: string | null;
}

export interface CreatedAtBound {
  createdAt: Date;
  createdBefore: Date | null;
}

export interface DiscardDecisionInput {
  createdAt: Date;
  createdBefore: Date | null;
  hasDownstreamReference: boolean;
  isOrphan: boolean;
}

export interface DiscardCounts {
  'hard-delete': number;
  skip: number;
  'soft-delete': number;
}

export interface DiscardSummaryRow {
  kind: DiscardKind;
  'would-delete': number;
  'would-skip': number;
  'would-soft-delete': number;
}

/** Issue snapshot date: rows created on/after this are not the audited orphan set. */
export const DEFAULT_CREATED_BEFORE = new Date('2026-07-27T00:00:00.000Z');

const MONGO_ERA_OBJECT_ID = /\b68[a-f0-9]{22}\b/i;

export function isBlankMediaField(value: string | null | undefined): boolean {
  return value == null || value.trim() === '';
}

export function isOrphanIngredient(row: IngredientMediaFields): boolean {
  return (
    isBlankMediaField(row.cdnUrl) &&
    isBlankMediaField(row.s3Key) &&
    isBlankMediaField(row.sampleAudioUrl)
  );
}

export function isOrphanAsset(row: AssetMediaFields): boolean {
  return isBlankMediaField(row.cloudObjectKey);
}

export function hasAssetDownstreamReference(row: AssetMediaFields): boolean {
  return (
    !isBlankMediaField(row.parentBrandId) ||
    !isBlankMediaField(row.parentIngredientId) ||
    !isBlankMediaField(row.parentArticleId)
  );
}

export function isWithinCreatedBefore(bound: CreatedAtBound): boolean {
  if (bound.createdBefore == null) {
    return true;
  }
  return bound.createdAt.getTime() < bound.createdBefore.getTime();
}

export function classifyDiscardAction(
  input: DiscardDecisionInput,
): DiscardAction {
  if (!input.isOrphan) {
    return 'skip';
  }
  if (
    !isWithinCreatedBefore({
      createdAt: input.createdAt,
      createdBefore: input.createdBefore,
    })
  ) {
    return 'skip';
  }
  if (input.hasDownstreamReference) {
    return 'soft-delete';
  }
  return 'hard-delete';
}

export function isMongoEraObjectKey(key: string): boolean {
  return MONGO_ERA_OBJECT_ID.test(key);
}

export function normalizeObjectKey(
  value: string | null | undefined,
): string | null {
  if (isBlankMediaField(value) || value == null) {
    return null;
  }

  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.replace(/^\/+/, '');
    return pathname || null;
  } catch {
    return trimmed.replace(/^\/+/, '') || null;
  }
}

export function collectSurvivingObjectKeys(
  values: ReadonlyArray<string | null | undefined>,
): Set<string> {
  const keys = new Set<string>();
  for (const value of values) {
    const key = normalizeObjectKey(value);
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

export function classifyS3Key(input: {
  key: string;
  survivingKeys: ReadonlySet<string>;
}): Exclude<DiscardAction, 'soft-delete'> {
  if (!isMongoEraObjectKey(input.key)) {
    return 'skip';
  }
  if (input.survivingKeys.has(input.key)) {
    return 'skip';
  }
  const normalized = normalizeObjectKey(input.key);
  if (normalized && input.survivingKeys.has(normalized)) {
    return 'skip';
  }
  return 'hard-delete';
}

export function emptyDiscardCounts(): DiscardCounts {
  return {
    'hard-delete': 0,
    skip: 0,
    'soft-delete': 0,
  };
}

export function incrementDiscardCount(
  counts: DiscardCounts,
  action: DiscardAction,
): void {
  counts[action] += 1;
}

export function toSummaryRow(
  kind: DiscardKind,
  counts: DiscardCounts,
): DiscardSummaryRow {
  return {
    kind,
    'would-delete': counts['hard-delete'],
    'would-skip': counts.skip,
    'would-soft-delete': counts['soft-delete'],
  };
}

export function formatSummaryTable(
  rows: ReadonlyArray<DiscardSummaryRow>,
): string {
  const headers = [
    'kind',
    'would-delete',
    'would-soft-delete',
    'would-skip',
  ] as const;
  const widths = {
    kind: Math.max(headers[0].length, ...rows.map((row) => row.kind.length)),
    'would-delete': headers[1].length,
    'would-skip': headers[3].length,
    'would-soft-delete': headers[2].length,
  };

  const pad = (value: string, width: number): string => value.padEnd(width);

  const headerLine = [
    pad(headers[0], widths.kind),
    pad(headers[1], widths['would-delete']),
    pad(headers[2], widths['would-soft-delete']),
    pad(headers[3], widths['would-skip']),
  ].join('  ');

  const body = rows.map((row) =>
    [
      pad(row.kind, widths.kind),
      pad(String(row['would-delete']), widths['would-delete']),
      pad(String(row['would-soft-delete']), widths['would-soft-delete']),
      pad(String(row['would-skip']), widths['would-skip']),
    ].join('  '),
  );

  return [headerLine, ...body].join('\n');
}

export interface DiscardOrphanMediaArgs {
  apply: boolean;
  createdBefore: Date | null;
  deleteS3: boolean;
  envSuffix: string;
  organizationId: string | null;
}

export function parseDiscardOrphanMediaArgs(
  argv: ReadonlyArray<string>,
): DiscardOrphanMediaArgs {
  const apply = argv.includes('--apply');
  const deleteS3 = argv.includes('--delete-s3');
  const unbounded = argv.includes('--unbounded');
  const envArg = argv
    .find((arg) => arg.startsWith('--env='))
    ?.slice('--env='.length);
  const organizationId =
    argv
      .find((arg) => arg.startsWith('--organization-id='))
      ?.slice('--organization-id='.length)
      ?.trim() || null;
  const createdBeforeArg = argv
    .find((arg) => arg.startsWith('--created-before='))
    ?.slice('--created-before='.length);

  let createdBefore: Date | null = unbounded ? null : DEFAULT_CREATED_BEFORE;
  if (createdBeforeArg) {
    const parsed = new Date(createdBeforeArg);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(
        `Invalid --created-before value "${createdBeforeArg}". Use an ISO timestamp.`,
      );
    }
    createdBefore = parsed;
  }

  return {
    apply,
    createdBefore,
    deleteS3,
    envSuffix: envArg && envArg.length > 0 ? envArg : 'local',
    organizationId,
  };
}
