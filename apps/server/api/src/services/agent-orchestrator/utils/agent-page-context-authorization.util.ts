import {
  RESEARCH_FINDING_REFERENCE_KINDS,
  type ScopedResearchFindingReference,
} from '@genfeedai/interfaces';
import { z } from 'zod';

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
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_REFERENCE_ID = /^[A-Za-z0-9._~-]{1,160}$/;
const MAX_RESEARCH_REFERENCES = 20;

const boundedScopeIdSchema = z.string().min(1).max(160);
const boundedFilterSchema = z.string().min(1).max(120);
const analyticsFiltersSchema = z
  .object({
    metric: boundedFilterSchema.optional(),
    patternType: boundedFilterSchema.optional(),
    platform: boundedFilterSchema.optional(),
    postId: boundedFilterSchema.optional(),
    query: boundedFilterSchema.optional(),
    sort: boundedFilterSchema.optional(),
    timeframe: boundedFilterSchema.optional(),
    visibility: boundedFilterSchema.optional(),
  })
  .strict();
const analyticsQuerySchema = z
  .object({
    brandId: boundedScopeIdSchema.optional(),
    dateRange: z
      .object({
        endDate: z.string().regex(DATE_KEY_PATTERN),
        startDate: z.string().regex(DATE_KEY_PATTERN),
      })
      .strict(),
    filters: analyticsFiltersSchema,
    id: z.string().regex(SAFE_REFERENCE_ID),
    kind: z.literal('analytics-query'),
    metric: z.enum(ANALYTICS_METRICS).optional(),
    organizationId: boundedScopeIdSchema,
    provenance: z
      .object({
        authority: z.literal('server-hydrated'),
        source: z.enum(['genfeed-analytics-api', 'genfeed-trends-api']),
        summaryAuthority: z.literal('derivative'),
      })
      .strict(),
    route: z
      .string()
      .max(240)
      .regex(/^\/analytics(?:\/|$)/),
    selectedResource: z
      .object({
        id: z.string().regex(SAFE_REFERENCE_ID),
        kind: z.enum(['brand', 'platform', 'post', 'trend']),
      })
      .strict()
      .optional(),
    version: z.literal(1),
  })
  .strict();
const researchReferencesSchema = z
  .array(
    z.object({
      brandId: boundedScopeIdSchema,
      id: z.string().regex(SAFE_REFERENCE_ID),
      kind: z.enum(RESEARCH_FINDING_REFERENCE_KINDS),
      organizationId: boundedScopeIdSchema,
    }),
  )
  .max(MAX_RESEARCH_REFERENCES);

export interface AgentPageContextAuthorizationScope {
  readonly brandId?: string;
  readonly organizationId: string;
}

function parseDateKey(value: string): Date | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function hasAuthorizedScope(
  value: { readonly brandId?: string; readonly organizationId: string },
  scope: AgentPageContextAuthorizationScope,
): boolean {
  return (
    value.organizationId === scope.organizationId &&
    value.brandId === scope.brandId
  );
}

function hasValidAnalyticsDateRange(
  dateRange: z.infer<typeof analyticsQuerySchema>['dateRange'],
): boolean {
  const startDate = parseDateKey(dateRange.startDate);
  const endDate = parseDateKey(dateRange.endDate);
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
  const parsed = analyticsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return false;
  }

  return (
    hasAuthorizedScope(parsed.data, scope) &&
    hasValidAnalyticsDateRange(parsed.data.dateRange)
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
  const parsed = researchReferencesSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  if (!parsed.data.every((reference) => hasAuthorizedScope(reference, scope))) {
    return null;
  }

  const references = new Map(
    parsed.data.map(
      (reference) =>
        [
          `${reference.kind}:${reference.id}`,
          reference satisfies ScopedResearchFindingReference,
        ] as const,
    ),
  );
  return Object.freeze([...references.values()]);
}
