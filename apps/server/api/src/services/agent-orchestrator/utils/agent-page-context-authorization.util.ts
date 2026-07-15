import {
  RESEARCH_FINDING_REFERENCE_KINDS,
  type ScopedResearchFindingReference,
} from '@genfeedai/interfaces';

const ANALYTICS_FILTER_KEYS = Object.freeze([
  'metric',
  'patternType',
  'platform',
  'postId',
  'query',
  'sort',
  'timeframe',
  'visibility',
]);
const ANALYTICS_METRICS = Object.freeze([
  'comments',
  'engagement',
  'engagementRate',
  'likes',
  'posts',
  'saves',
  'shares',
  'views',
]);
const ANALYTICS_RESOURCE_KINDS = Object.freeze([
  'brand',
  'platform',
  'post',
  'trend',
]);
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_REFERENCE_ID = /^[A-Za-z0-9._~-]{1,160}$/;
const MAX_RESEARCH_REFERENCES = 20;

export interface AgentPageContextAuthorizationScope {
  readonly brandId?: string;
  readonly organizationId: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalBoundedString(
  value: unknown,
  maxLength: number,
): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === 'string' && value.length > 0 && value.length <= maxLength)
  );
}

function parseDateKey(value: unknown): Date | null {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function hasAuthorizedScope(
  value: Readonly<Record<string, unknown>>,
  scope: AgentPageContextAuthorizationScope,
): boolean {
  return (
    value.organizationId === scope.organizationId &&
    value.brandId === scope.brandId
  );
}

function isAnalyticsFilters(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([key, filterValue]) =>
      ANALYTICS_FILTER_KEYS.includes(key) &&
      typeof filterValue === 'string' &&
      filterValue.length > 0 &&
      filterValue.length <= 120,
  );
}

function isAnalyticsSelectedResource(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    SAFE_REFERENCE_ID.test(value.id) &&
    typeof value.kind === 'string' &&
    ANALYTICS_RESOURCE_KINDS.includes(value.kind)
  );
}

/**
 * Verifies that an untrusted Analytics query descriptor is finite and bound to
 * the current authenticated scope before the server labels it authorized.
 */
export function isAuthorizedAnalyticsQueryReference(
  value: unknown,
  scope: AgentPageContextAuthorizationScope,
): boolean {
  if (!isRecord(value) || !hasAuthorizedScope(value, scope)) {
    return false;
  }
  if (
    value.kind !== 'analytics-query' ||
    value.version !== 1 ||
    typeof value.id !== 'string' ||
    !SAFE_REFERENCE_ID.test(value.id) ||
    typeof value.route !== 'string' ||
    !/^\/analytics(?:\/|$)/.test(value.route) ||
    value.route.length > 240 ||
    !isAnalyticsFilters(value.filters) ||
    !isAnalyticsSelectedResource(value.selectedResource)
  ) {
    return false;
  }

  const dateRange = value.dateRange;
  const provenance = value.provenance;
  const startDate = isRecord(dateRange)
    ? parseDateKey(dateRange.startDate)
    : null;
  const endDate = isRecord(dateRange) ? parseDateKey(dateRange.endDate) : null;
  const durationDays =
    startDate && endDate
      ? Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1
      : 0;
  return (
    Boolean(startDate && endDate && durationDays >= 1 && durationDays <= 366) &&
    isOptionalBoundedString(value.metric, 32) &&
    (value.metric === undefined || ANALYTICS_METRICS.includes(value.metric)) &&
    isRecord(provenance) &&
    provenance.authority === 'server-hydrated' &&
    (provenance.source === 'genfeed-analytics-api' ||
      provenance.source === 'genfeed-trends-api') &&
    provenance.summaryAuthority === 'derivative'
  );
}

/**
 * Accepts only bounded Research selectors whose scope exactly matches the
 * authenticated request, and strips all client-supplied display metadata.
 */
export function authorizeResearchFindingReferences(
  value: unknown,
  scope: AgentPageContextAuthorizationScope,
): readonly ScopedResearchFindingReference[] | null {
  if (!Array.isArray(value) || value.length > MAX_RESEARCH_REFERENCES) {
    return null;
  }
  if (value.length > 0 && !scope.brandId) {
    return null;
  }

  const references = new Map<string, ScopedResearchFindingReference>();
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !hasAuthorizedScope(candidate, scope) ||
      typeof candidate.id !== 'string' ||
      !SAFE_REFERENCE_ID.test(candidate.id) ||
      typeof candidate.kind !== 'string' ||
      !RESEARCH_FINDING_REFERENCE_KINDS.includes(
        candidate.kind as (typeof RESEARCH_FINDING_REFERENCE_KINDS)[number],
      ) ||
      !scope.brandId
    ) {
      return null;
    }

    const reference: ScopedResearchFindingReference = {
      brandId: scope.brandId,
      id: candidate.id,
      kind: candidate.kind as ScopedResearchFindingReference['kind'],
      organizationId: scope.organizationId,
    };
    references.set(`${reference.kind}:${reference.id}`, reference);
  }

  return Object.freeze([...references.values()]);
}
