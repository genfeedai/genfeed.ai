import {
  RESEARCH_FINDING_REFERENCE_KINDS,
  type ScopedResearchFindingReference,
} from '@genfeedai/interfaces';

const ANALYTICS_METRICS = [
  'comments',
  'engagement',
  'engagementRate',
  'likes',
  'posts',
  'saves',
  'shares',
  'views',
] as const;
const ANALYTICS_PROVENANCE_SOURCES = [
  'genfeed-analytics-api',
  'genfeed-trends-api',
] as const;
const ANALYTICS_RESOURCE_KINDS = [
  'brand',
  'platform',
  'post',
  'trend',
] as const;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ANALYTICS_ROUTE_PATTERN = /^\/analytics(?:\/|$)/;
const SAFE_REFERENCE_ID = /^[A-Za-z0-9._~-]{1,160}$/;
const MAX_RESEARCH_REFERENCES = 20;

type UnknownRecord = Readonly<Record<string, unknown>>;
type ValueValidator = (value: unknown) => boolean;
type ValidatorMap = Readonly<Record<string, ValueValidator>>;

export interface AgentPageContextAuthorizationScope {
  readonly brandId?: string;
  readonly organizationId: string;
}

interface PageContextScopeValue {
  readonly brandId?: unknown;
  readonly organizationId?: unknown;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= maxLength
  );
}

function isSafeReferenceId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_REFERENCE_ID.test(value);
}

function matchesBoundedPattern(
  value: unknown,
  maxLength: number,
  pattern: RegExp,
): value is string {
  return isBoundedString(value, maxLength) && pattern.test(value);
}

function isOneOf<T extends string>(
  values: readonly T[],
): (value: unknown) => value is T {
  return (value: unknown): value is T =>
    typeof value === 'string' && values.includes(value as T);
}

function isLiteral<T extends string | number>(expected: T): ValueValidator {
  return (value) => value === expected;
}

function isOptional(validator: ValueValidator): ValueValidator {
  return (value) => value === undefined || validator(value);
}

function validatesExactRecord(
  value: unknown,
  validators: ValidatorMap,
): value is UnknownRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Object.keys(value).every((key) => key in validators) &&
    Object.entries(validators).every(([key, validator]) =>
      validator(value[key]),
    )
  );
}

const analyticsFilterValidators = Object.freeze({
  metric: isOptional((value) => isBoundedString(value, 120)),
  patternType: isOptional((value) => isBoundedString(value, 120)),
  platform: isOptional((value) => isBoundedString(value, 120)),
  postId: isOptional((value) => isBoundedString(value, 120)),
  query: isOptional((value) => isBoundedString(value, 120)),
  sort: isOptional((value) => isBoundedString(value, 120)),
  timeframe: isOptional((value) => isBoundedString(value, 120)),
  visibility: isOptional((value) => isBoundedString(value, 120)),
}) satisfies ValidatorMap;
const analyticsDateRangeValidators = Object.freeze({
  endDate: (value: unknown) =>
    matchesBoundedPattern(value, 10, DATE_KEY_PATTERN),
  startDate: (value: unknown) =>
    matchesBoundedPattern(value, 10, DATE_KEY_PATTERN),
}) satisfies ValidatorMap;
const analyticsProvenanceValidators = Object.freeze({
  authority: isLiteral('server-hydrated'),
  source: isOneOf(ANALYTICS_PROVENANCE_SOURCES),
  summaryAuthority: isLiteral('derivative'),
}) satisfies ValidatorMap;
const analyticsSelectedResourceValidators = Object.freeze({
  id: isSafeReferenceId,
  kind: isOneOf(ANALYTICS_RESOURCE_KINDS),
}) satisfies ValidatorMap;

function isAnalyticsFilters(value: unknown): boolean {
  return validatesExactRecord(value, analyticsFilterValidators);
}

function isAnalyticsDateRange(value: unknown): boolean {
  return validatesExactRecord(value, analyticsDateRangeValidators);
}

function isAnalyticsProvenance(value: unknown): boolean {
  return validatesExactRecord(value, analyticsProvenanceValidators);
}

function isAnalyticsSelectedResource(value: unknown): boolean {
  return (
    value === undefined ||
    validatesExactRecord(value, analyticsSelectedResourceValidators)
  );
}

const analyticsQueryValidators = Object.freeze({
  brandId: isOptional((value) => isBoundedString(value, 160)),
  dateRange: isAnalyticsDateRange,
  filters: isAnalyticsFilters,
  id: isSafeReferenceId,
  kind: isLiteral('analytics-query'),
  metric: isOptional(isOneOf(ANALYTICS_METRICS)),
  organizationId: (value: unknown) => isBoundedString(value, 160),
  provenance: isAnalyticsProvenance,
  route: (value: unknown) =>
    matchesBoundedPattern(value, 240, ANALYTICS_ROUTE_PATTERN),
  selectedResource: isAnalyticsSelectedResource,
  version: isLiteral(1),
}) satisfies ValidatorMap;

function parseDateKey(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function hasAuthorizedScope(
  value: PageContextScopeValue,
  scope: AgentPageContextAuthorizationScope,
): boolean {
  return (
    value.organizationId === scope.organizationId &&
    value.brandId === scope.brandId
  );
}

function hasValidAnalyticsDateRange(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const startDate = parseDateKey(value.startDate);
  const endDate = parseDateKey(value.endDate);
  const durationDays =
    startDate && endDate
      ? Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1
      : 0;
  return durationDays >= 1 && durationDays <= 366;
}

/**
 * Verifies that an untrusted Analytics query descriptor is finite and bound to
 * the current authenticated scope before the server labels it authorized.
 */
export function isAuthorizedAnalyticsQueryReference(
  value: unknown,
  scope: AgentPageContextAuthorizationScope,
): boolean {
  if (!validatesExactRecord(value, analyticsQueryValidators)) {
    return false;
  }

  return (
    hasAuthorizedScope(value, scope) &&
    hasValidAnalyticsDateRange(value.dateRange)
  );
}

const researchReferenceValidators = Object.freeze({
  brandId: (value: unknown) => isBoundedString(value, 160),
  id: isSafeReferenceId,
  kind: isOneOf(RESEARCH_FINDING_REFERENCE_KINDS),
  organizationId: (value: unknown) => isBoundedString(value, 160),
}) satisfies ValidatorMap;

function parseResearchFindingReference(
  value: unknown,
): ScopedResearchFindingReference | null {
  if (!isRecord(value)) {
    return null;
  }
  const sanitized = {
    brandId: value.brandId,
    id: value.id,
    kind: value.kind,
    organizationId: value.organizationId,
  };
  if (!validatesExactRecord(sanitized, researchReferenceValidators)) {
    return null;
  }
  return sanitized as ScopedResearchFindingReference;
}

function isResearchFindingReference(
  value: ScopedResearchFindingReference | null,
): value is ScopedResearchFindingReference {
  return value !== null;
}

function parseResearchFindingReferences(
  value: unknown,
): readonly ScopedResearchFindingReference[] | null {
  if (!Array.isArray(value) || value.length > MAX_RESEARCH_REFERENCES) {
    return null;
  }
  const references = value.map(parseResearchFindingReference);
  return references.every(isResearchFindingReference) ? references : null;
}

/**
 * Accepts only bounded Research selectors whose scope exactly matches the
 * authenticated request, and strips all client-supplied display metadata.
 */
export function authorizeResearchFindingReferences(
  value: unknown,
  scope: AgentPageContextAuthorizationScope,
): readonly ScopedResearchFindingReference[] | null {
  const parsed = parseResearchFindingReferences(value);
  if (!parsed) {
    return null;
  }
  if (!parsed.every((reference) => hasAuthorizedScope(reference, scope))) {
    return null;
  }

  const references = new Map(
    parsed.map(
      (reference) => [`${reference.kind}:${reference.id}`, reference] as const,
    ),
  );
  return Object.freeze([...references.values()]);
}
