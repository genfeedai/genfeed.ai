import type {
  ReleaseGroupListQuery,
  ReleaseGroupListSort,
} from '@api/collections/post-groups/services/post-group.types';
import {
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';

/**
 * SQL for the release list (Calendar, Publish list, home, publishing overview).
 *
 * A release is a `PostGroup` with its channel-target `Post` rows, or a legacy
 * group-less `Post` that is its own one-target release. `Post` carries no
 * relation back to `PostGroup` and a release's status, provenance and
 * effective schedule are derived from its targets, so Prisma `skip`/`take`
 * cannot express the list. One statement does instead: it rolls the targets up
 * per group, derives the status exactly like
 * `deriveReleaseStatusProjectionFromTargets`, applies every list filter,
 * sorts, and returns just the page's ids plus the total. Only those ids are
 * then hydrated in full.
 *
 * Every table read here is bound to `organizationId` and `isDeleted = false`.
 * All caller input is a bound parameter; the only text spliced in is the
 * constant SQL in this file.
 */

const DEFAULT_SORT: ReleaseGroupListSort = 'createdAt: -1';
const WINDOWED_SORT: ReleaseGroupListSort = 'scheduledDate: 1';

const KNOWN_TARGET_STATES = Object.values(TargetExecutionState);

type ReleaseSortField = 'createdAt' | 'scheduledDate' | 'updatedAt';

type ReleaseListSortSpec = {
  direction: 'ASC' | 'DESC';
  field: ReleaseSortField;
};

type ReleaseListWindow = { end: Date; start: Date };

export type ReleaseListPageParams = { limit: number; offset: number };

/** A bound text parameter, so enum values never become SQL text. */
function text(value: string): Prisma.Sql {
  return Prisma.sql`${value}::text`;
}

function textList(values: readonly string[]): Prisma.Sql {
  return Prisma.join(values.map(text));
}

function allOf(conditions: readonly Prisma.Sql[]): Prisma.Sql {
  return conditions.length > 0
    ? Prisma.join(conditions, ' AND ')
    : Prisma.sql`TRUE`;
}

/** Escapes LIKE metacharacters so a search term always matches literally. */
export function toContainsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
}

export function resolveReleaseListSort(
  query: Pick<ReleaseGroupListQuery, 'endDate' | 'sort' | 'startDate'>,
): ReleaseListSortSpec {
  const sort =
    query.sort ??
    (query.startDate && query.endDate ? WINDOWED_SORT : DEFAULT_SORT);
  const [field, direction] = sort.split(': ');
  return {
    direction: direction === '1' ? 'ASC' : 'DESC',
    field:
      field === 'scheduledDate' || field === 'updatedAt' ? field : 'createdAt',
  };
}

function resolveWindow(
  query: ReleaseGroupListQuery,
): ReleaseListWindow | undefined {
  return query.startDate && query.endDate
    ? { end: query.endDate, start: query.startDate }
    : undefined;
}

/**
 * The schema's DateTime columns are `timestamp without time zone` holding UTC
 * wall-clock values. Prisma binds a Date as its UTC wall-clock text, so casting
 * it to `timestamp` (never `timestamptz`) is independent of the session zone.
 */
function utcTimestamp(value: Date): Prisma.Sql {
  return Prisma.sql`${value}::timestamp`;
}

function inWindow(
  column: Prisma.Sql,
  window: ReleaseListWindow | undefined,
): Prisma.Sql {
  return window
    ? Prisma.sql`COALESCE(${column} >= ${utcTimestamp(window.start)} AND ${column} <= ${utcTimestamp(window.end)}, FALSE)`
    : Prisma.sql`TRUE`;
}

/** Provenance of a target, from the same columns `toTargetSource` reads. */
const TARGET_SOURCE_SQL = Prisma.sql`CASE
  WHEN NULLIF(p."workflowExecutionId", '') IS NOT NULL
    THEN ${text(ReleaseTargetSource.WORKFLOW)}
  WHEN NULLIF(p."agentThreadId", '') IS NOT NULL
    OR NULLIF(p."agentStrategyId", '') IS NOT NULL
    OR NULLIF(p."agentContextSource", '') IS NOT NULL
    THEN ${text(ReleaseTargetSource.AGENT)}
  ELSE ${text(ReleaseTargetSource.MANUAL)}
END`;

/** A target the list can show: it has a channel identity and is not a thread child. */
const TARGET_IS_LISTABLE_SQL = Prisma.sql`p."isDeleted" = FALSE
  AND p."parentId" IS NULL
  AND btrim(p."credentialId") <> ''
  AND btrim(p."platform") <> ''`;

/**
 * Whether one target satisfies every target-scoped filter at once. Absent
 * filters are not constraints.
 */
function targetFacetMatch(query: ReleaseGroupListQuery): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (query.categories?.length) {
    conditions.push(
      Prisma.sql`p."category"::text IN (${textList(query.categories)})`,
    );
  }
  if (query.credentialIds?.length) {
    conditions.push(
      Prisma.sql`p."credentialId" IN (${textList(query.credentialIds)})`,
    );
  }
  if (query.executionStates?.length) {
    conditions.push(
      Prisma.sql`p."targetExecutionState" IN (${textList(query.executionStates)})`,
    );
  }
  if (query.platforms?.length) {
    conditions.push(Prisma.sql`p."platform" IN (${textList(query.platforms)})`);
  }
  if (query.sources?.length) {
    conditions.push(
      Prisma.sql`${TARGET_SOURCE_SQL} IN (${textList(query.sources)})`,
    );
  }
  return allOf(conditions);
}

function hasTargetFacetFilter(query: ReleaseGroupListQuery): boolean {
  return Boolean(
    query.categories?.length ||
      query.credentialIds?.length ||
      query.executionStates?.length ||
      query.platforms?.length ||
      query.sources?.length,
  );
}

/** The trimmed search term, or `undefined` when there is nothing to search. */
function searchPattern(query: ReleaseGroupListQuery): string | undefined {
  const search = query.search?.trim();
  return search ? toContainsPattern(search) : undefined;
}

/** The per-target facts every release row rolls up. */
function targetFlagColumns(
  query: ReleaseGroupListQuery,
  window: ReleaseListWindow | undefined,
): Prisma.Sql {
  const pattern = searchPattern(query);
  const isSearchMatch = pattern
    ? Prisma.sql`(p."platform" ILIKE ${pattern} OR p."category"::text ILIKE ${pattern})`
    : Prisma.sql`FALSE`;
  return Prisma.sql`p."targetExecutionState" AS state,
    p."scheduledDate" AS "targetScheduledAt",
    ${targetFacetMatch(query)} AS "isFacetMatch",
    ${inWindow(Prisma.sql`p."scheduledDate"`, window)} AS "isInWindow",
    ${isSearchMatch} AS "isSearchMatch",
    (p."targetExecutionState" = ${text(TargetExecutionState.PUBLISHED)}) AS "isPublished"`;
}

/**
 * The release status for a group's rolled-up target counts. Mirrors
 * `RELEASE_STATUS_AGGREGATION_TABLE` row for row, including failing closed to
 * `failed` when any persisted target state is unrecognised.
 */
const GROUP_STATUS_SQL = Prisma.sql`CASE
  WHEN r."invalidCount" > 0 THEN ${text(ReleaseStatus.FAILED)}
  WHEN r."publishingCount" > 0 THEN ${text(ReleaseStatus.PUBLISHING)}
  WHEN r."draftCount" = r."total" THEN ${text(ReleaseStatus.DRAFT)}
  WHEN r."publishedCount" = r."total" THEN ${text(ReleaseStatus.PUBLISHED)}
  WHEN r."cancelledCount" + r."skippedCount" = r."total"
    THEN ${text(ReleaseStatus.CANCELLED)}
  WHEN r."pausedCount" = r."total" THEN ${text(ReleaseStatus.PAUSED)}
  WHEN r."publishedCount" > 0 THEN ${text(ReleaseStatus.PARTIALLY_PUBLISHED)}
  WHEN r."failedCount" + r."cancelledCount" + r."skippedCount" = r."total"
    THEN ${text(ReleaseStatus.FAILED)}
  ELSE ${text(ReleaseStatus.SCHEDULED)}
END`;

/** The same roll-up for a one-target release, which is just the target state. */
const SINGLE_TARGET_STATUS_SQL = Prisma.sql`CASE p."targetExecutionState"
  WHEN ${text(TargetExecutionState.PUBLISHING)} THEN ${text(ReleaseStatus.PUBLISHING)}
  WHEN ${text(TargetExecutionState.DRAFT)} THEN ${text(ReleaseStatus.DRAFT)}
  WHEN ${text(TargetExecutionState.PUBLISHED)} THEN ${text(ReleaseStatus.PUBLISHED)}
  WHEN ${text(TargetExecutionState.CANCELLED)} THEN ${text(ReleaseStatus.CANCELLED)}
  WHEN ${text(TargetExecutionState.SKIPPED)} THEN ${text(ReleaseStatus.CANCELLED)}
  WHEN ${text(TargetExecutionState.PAUSED)} THEN ${text(ReleaseStatus.PAUSED)}
  WHEN ${text(TargetExecutionState.SCHEDULED)} THEN ${text(ReleaseStatus.SCHEDULED)}
  ELSE ${text(ReleaseStatus.FAILED)}
END`;

function stateCount(state: TargetExecutionState): Prisma.Sql {
  return Prisma.sql`count(*) FILTER (WHERE state = ${text(state)})`;
}

/** `release_rows`: one row per listable release with everything the filters read. */
function releaseRowsCte(query: ReleaseGroupListQuery): Prisma.Sql {
  const window = resolveWindow(query);
  const brandOnPost = query.brandId
    ? Prisma.sql`AND p."brandId" = ${query.brandId}`
    : Prisma.empty;
  const brandOnGroup = query.brandId
    ? Prisma.sql`AND g."brandId" = ${query.brandId}`
    : Prisma.empty;
  const campaignOnPost = query.campaignId
    ? Prisma.sql`AND p."campaignId" = ${query.campaignId}`
    : Prisma.empty;
  const campaignOnGroup = query.campaignId
    ? Prisma.sql`AND g."campaignId" = ${query.campaignId}`
    : Prisma.empty;
  const pattern = searchPattern(query);
  const groupSearch = pattern
    ? Prisma.sql`(g."title" ILIKE ${pattern} OR g."baseContent" ILIKE ${pattern} OR r."isSearchMatch")`
    : Prisma.sql`FALSE`;
  // A group-less post's title is its label, else its content; both are matched
  // as stored.
  const postSearch = pattern
    ? Prisma.sql`(p."label" ILIKE ${pattern} OR p."description" ILIKE ${pattern} OR f."isSearchMatch")`
    : Prisma.sql`FALSE`;

  return Prisma.sql`
  group_targets AS (
    SELECT p."groupId" AS id, ${targetFlagColumns(query, window)}
    FROM "posts" p
    WHERE p."organizationId" = ${query.organizationId}
      AND p."groupId" IS NOT NULL
      AND ${TARGET_IS_LISTABLE_SQL}
      ${brandOnPost}
  ),
  group_rollup AS (
    SELECT
      id,
      count(*) AS "total",
      ${stateCount(TargetExecutionState.PUBLISHING)} AS "publishingCount",
      ${stateCount(TargetExecutionState.DRAFT)} AS "draftCount",
      ${stateCount(TargetExecutionState.PUBLISHED)} AS "publishedCount",
      ${stateCount(TargetExecutionState.CANCELLED)} AS "cancelledCount",
      ${stateCount(TargetExecutionState.SKIPPED)} AS "skippedCount",
      ${stateCount(TargetExecutionState.PAUSED)} AS "pausedCount",
      ${stateCount(TargetExecutionState.FAILED)} AS "failedCount",
      count(*) FILTER (WHERE state NOT IN (${textList(KNOWN_TARGET_STATES)})) AS "invalidCount",
      min("targetScheduledAt") AS "minTargetScheduledAt",
      bool_or("isFacetMatch") AS "isFacetMatch",
      bool_or("isInWindow") AS "isInWindow",
      bool_or("isSearchMatch") AS "isSearchMatch",
      bool_or("isPublished") AS "isPublished"
    FROM group_targets
    GROUP BY id
  ),
  release_rows AS (
    SELECT
      g."id" AS id,
      FALSE AS "isSynthetic",
      g."createdAt" AS "createdAt",
      g."updatedAt" AS "updatedAt",
      LEAST(g."scheduledAt", r."minTargetScheduledAt") AS "effectiveScheduledAt",
      ${GROUP_STATUS_SQL} AS status,
      (${inWindow(Prisma.sql`g."scheduledAt"`, window)} OR r."isInWindow") AS "isInWindow",
      r."isFacetMatch" AS "isFacetMatch",
      ${groupSearch} AS "isSearchMatch",
      r."isPublished" AS "isPublished"
    FROM "post_groups" g
    JOIN group_rollup r ON r.id = g."id"
    WHERE g."organizationId" = ${query.organizationId}
      AND g."isDeleted" = FALSE
      ${brandOnGroup}
      ${campaignOnGroup}
    UNION ALL
    SELECT
      p."id" AS id,
      TRUE AS "isSynthetic",
      p."createdAt" AS "createdAt",
      p."updatedAt" AS "updatedAt",
      p."scheduledDate" AS "effectiveScheduledAt",
      ${SINGLE_TARGET_STATUS_SQL} AS status,
      f."isInWindow" AS "isInWindow",
      f."isFacetMatch" AS "isFacetMatch",
      ${postSearch} AS "isSearchMatch",
      f."isPublished" AS "isPublished"
    FROM "posts" p
    CROSS JOIN LATERAL (
      SELECT ${targetFlagColumns(query, window)}
    ) f
    WHERE p."organizationId" = ${query.organizationId}
      AND p."groupId" IS NULL
      AND ${TARGET_IS_LISTABLE_SQL}
      ${brandOnPost}
      ${campaignOnPost}
  )`;
}

/** The release-level conditions, applied to `release_rows`. */
function releaseConditions(query: ReleaseGroupListQuery): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (resolveWindow(query)) {
    conditions.push(Prisma.sql`"isInWindow"`);
  }
  if (query.statuses?.length) {
    conditions.push(Prisma.sql`status IN (${textList(query.statuses)})`);
  }
  if (hasTargetFacetFilter(query)) {
    conditions.push(Prisma.sql`"isFacetMatch"`);
  }
  if (query.publicationState === 'posted') {
    conditions.push(Prisma.sql`"isPublished"`);
  }
  if (query.publicationState === 'not-posted') {
    conditions.push(Prisma.sql`NOT "isPublished"`);
  }
  if (searchPattern(query)) {
    conditions.push(Prisma.sql`"isSearchMatch"`);
  }
  return conditions.length > 0
    ? Prisma.sql`WHERE ${allOf(conditions)}`
    : Prisma.empty;
}

function orderBy(query: ReleaseGroupListQuery): Prisma.Sql {
  const { direction, field } = resolveReleaseListSort(query);
  const column =
    field === 'scheduledDate'
      ? Prisma.sql`"effectiveScheduledAt"`
      : field === 'updatedAt'
        ? Prisma.sql`"updatedAt"`
        : Prisma.sql`"createdAt"`;
  // Unscheduled releases sort last in either direction; ids break ties with
  // byte order so paging is stable.
  return Prisma.sql`ORDER BY ${column} ${Prisma.raw(direction)} NULLS LAST, id COLLATE "C" ASC`;
}

/**
 * One page of release ids (and whether each is a group-less post), with the
 * total number of matching releases on every row.
 */
export function buildReleaseListPageSql(
  query: ReleaseGroupListQuery,
  { limit, offset }: ReleaseListPageParams,
): Prisma.Sql {
  return Prisma.sql`WITH ${releaseRowsCte(query)}
SELECT id, "isSynthetic", count(*) OVER() AS "totalDocs"
FROM release_rows
${releaseConditions(query)}
${orderBy(query)}
LIMIT ${limit} OFFSET ${offset}`;
}

/** Total matching releases; only needed when the requested page is empty. */
export function buildReleaseListCountSql(
  query: ReleaseGroupListQuery,
): Prisma.Sql {
  return Prisma.sql`WITH ${releaseRowsCte(query)}
SELECT count(*) AS "totalDocs"
FROM release_rows
${releaseConditions(query)}`;
}
