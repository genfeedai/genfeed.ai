import type {
  TrendPaidCreativeMetadata,
  TrendSourceClassification,
  TrendSourceConfidence,
  TrendSourceIntendedUse,
  TrendSourceKind,
} from '@api/collections/trends/interfaces/trend.interfaces';

export const DEFAULT_SOURCE_FRESHNESS_WINDOW_DAYS_BY_KIND: Record<
  TrendSourceKind,
  number
> = {
  manual_curated_reference: 30,
  owned_brand_reference: 30,
  paid_creative_reference: 14,
  public_platform_reference: 7,
};

const TREND_SOURCE_CONFIDENCES: ReadonlySet<string> =
  new Set<TrendSourceConfidence>(['high', 'low', 'medium']);

const TREND_SOURCE_INTENDED_USES: ReadonlySet<string> =
  new Set<TrendSourceIntendedUse>([
    'evergreen_prompt_context',
    'organic_trend_discovery',
    'paid_creative_analysis',
  ]);

export interface NormalizeTrendSourceClassificationInput {
  capturedAt?: Date | string;
  confidence?: TrendSourceConfidence;
  freshnessWindowDays?: number;
  intendedUse?: TrendSourceIntendedUse;
  platform?: string;
  sourceAuthor?: string;
  sourceKind?: TrendSourceKind;
  sourceLabel?: string;
  sourceTimestamp?: Date | string;
  sourceTopic?: string;
  value?: unknown;
}

export function buildPublicPlatformReferenceClassification(input: {
  capturedAt: Date | string;
  confidence: TrendSourceConfidence;
  freshnessWindowDays?: number;
  platform: string;
  sourceAuthor?: string;
  sourceLabel: string;
  sourceTimestamp?: Date | string;
  sourceTopic: string;
}): TrendSourceClassification {
  const normalized = normalizeTrendSourceClassification({
    capturedAt: input.capturedAt,
    confidence: input.confidence,
    freshnessWindowDays: input.freshnessWindowDays,
    intendedUse: 'organic_trend_discovery',
    platform: input.platform,
    sourceAuthor: input.sourceAuthor,
    sourceKind: 'public_platform_reference',
    sourceLabel: input.sourceLabel,
    sourceTimestamp: input.sourceTimestamp,
    sourceTopic: input.sourceTopic,
  });

  if (!normalized) {
    throw new Error('Failed to build public platform source classification');
  }

  return normalized;
}

export function normalizeTrendSourceClassification(
  input: NormalizeTrendSourceClassificationInput,
): TrendSourceClassification | undefined {
  const record = asRecord(input.value);
  const sourceKind =
    readSourceKind(record.sourceKind) ?? input.sourceKind ?? undefined;
  const intendedUse =
    readIntendedUse(record.intendedUse) ?? input.intendedUse ?? undefined;

  if (!sourceKind || !intendedUse) {
    return undefined;
  }

  const sourceTimestamp =
    readTimestamp(record.sourceTimestamp) ??
    readTimestamp(input.sourceTimestamp) ??
    undefined;
  const capturedAt =
    readTimestamp(record.capturedAt) ??
    readTimestamp(input.capturedAt) ??
    sourceTimestamp ??
    '';
  const freshnessWindowDays =
    readNumber(record.freshnessWindowDays) ??
    input.freshnessWindowDays ??
    DEFAULT_SOURCE_FRESHNESS_WINDOW_DAYS_BY_KIND[sourceKind];
  const confidence =
    readConfidence(record.confidence) ?? input.confidence ?? 'medium';
  const paidCreative = readPaidCreative(record.paidCreative);
  const platform = readString(record.platform) ?? input.platform;
  const sourceAuthor =
    readString(record.sourceAuthor) ??
    readString(record.authorHandle) ??
    input.sourceAuthor;
  const sourceLabel = readString(record.sourceLabel) ?? input.sourceLabel;
  const sourceTopic = readString(record.sourceTopic) ?? input.sourceTopic;

  return {
    capturedAt,
    confidence,
    freshnessWindowDays,
    intendedUse,
    ...(paidCreative ? { paidCreative } : {}),
    ...(platform ? { platform } : {}),
    ...(sourceAuthor ? { sourceAuthor } : {}),
    sourceKind,
    ...(sourceLabel ? { sourceLabel } : {}),
    ...(sourceTimestamp ? { sourceTimestamp } : {}),
    ...(sourceTopic ? { sourceTopic } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function readTimestamp(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toISOString();
}

function readConfidence(value: unknown): TrendSourceConfidence | undefined {
  return typeof value === 'string' && TREND_SOURCE_CONFIDENCES.has(value)
    ? (value as TrendSourceConfidence)
    : undefined;
}

function readIntendedUse(value: unknown): TrendSourceIntendedUse | undefined {
  return typeof value === 'string' && TREND_SOURCE_INTENDED_USES.has(value)
    ? (value as TrendSourceIntendedUse)
    : undefined;
}

function readSourceKind(value: unknown): TrendSourceKind | undefined {
  return typeof value === 'string' &&
    value in DEFAULT_SOURCE_FRESHNESS_WINDOW_DAYS_BY_KIND
    ? (value as TrendSourceKind)
    : undefined;
}

function readPaidCreative(
  value: unknown,
): TrendPaidCreativeMetadata | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as TrendPaidCreativeMetadata)
    : undefined;
}
