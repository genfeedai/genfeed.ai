import type { ReleaseGroupListQuery } from '@api/collections/post-groups/services/post-group.types';
import {
  buildReleaseListCountSql,
  buildReleaseListPageSql,
  resolveReleaseListSort,
  toContainsPattern,
} from '@api/collections/post-groups/services/post-group-release-list.query';
import {
  CredentialPlatform,
  PostCategory,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/contracts';

type BuiltSql = { sql: string; values: unknown[] };

function page(
  query: Partial<ReleaseGroupListQuery> = {},
  params = { limit: 20, offset: 0 },
): BuiltSql {
  return buildReleaseListPageSql(
    { organizationId: 'org-1', ...query },
    params,
  ) as unknown as BuiltSql;
}

describe('release list SQL', () => {
  it('binds every tenant read to the organization and excludes soft-deleted rows', () => {
    const { sql, values } = page();

    expect(sql.match(/"organizationId" = \?/g)).toHaveLength(3);
    expect(sql.match(/"isDeleted" = FALSE/g)).toHaveLength(3);
    expect(values.filter((value) => value === 'org-1')).toHaveLength(3);
  });

  it('pages in SQL with the total on every row', () => {
    const { sql, values } = page({}, { limit: 5, offset: 10 });

    expect(sql).toContain('count(*) OVER() AS "totalDocs"');
    expect(sql).toMatch(/LIMIT \? OFFSET \?$/);
    expect(values.slice(-2)).toEqual([5, 10]);
  });

  it('adds no filter conditions for an unfiltered list', () => {
    const { sql } = page();

    expect(sql).not.toMatch(/FROM release_rows\s+WHERE/);
    expect(sql).not.toContain('ILIKE');
  });

  it('narrows groups, targets and group-less posts by brand and campaign', () => {
    const { sql, values } = page({ brandId: 'brand-1', campaignId: 'cmp-1' });

    expect(sql).toContain('AND p."brandId" = ?');
    expect(sql).toContain('AND g."brandId" = ?');
    expect(sql).toContain('AND p."campaignId" = ?');
    expect(sql).toContain('AND g."campaignId" = ?');
    expect(values.filter((value) => value === 'brand-1')).toHaveLength(3);
    expect(values.filter((value) => value === 'cmp-1')).toHaveLength(2);
  });

  it('filters on the derived release status, not the persisted group status', () => {
    const { sql, values } = page({
      statuses: [ReleaseStatus.SCHEDULED, ReleaseStatus.FAILED],
    });

    expect(sql).toContain('WHERE status IN (?::text,?::text)');
    expect(values).toEqual(
      expect.arrayContaining([ReleaseStatus.SCHEDULED, ReleaseStatus.FAILED]),
    );
    expect(sql).not.toContain('g."status"');
  });

  it('requires one target to satisfy all target facets at once', () => {
    const { sql, values } = page({
      categories: [PostCategory.VIDEO],
      credentialIds: ['credential-1'],
      executionStates: [TargetExecutionState.FAILED],
      platforms: [CredentialPlatform.INSTAGRAM],
      sources: [ReleaseTargetSource.AGENT],
    });

    expect(sql).toContain('p."category"::text IN (?::text)');
    expect(sql).toContain('p."credentialId" IN (?::text)');
    expect(sql).toContain('p."targetExecutionState" IN (?::text)');
    expect(sql).toContain('p."platform" IN (?::text)');
    expect(sql).toContain('bool_or("isFacetMatch")');
    expect(sql).toContain('"isFacetMatch"\nORDER BY');
    expect(values).toEqual(
      expect.arrayContaining([
        PostCategory.VIDEO,
        'credential-1',
        TargetExecutionState.FAILED,
        CredentialPlatform.INSTAGRAM,
        ReleaseTargetSource.AGENT,
      ]),
    );
  });

  it('matches the schedule window on the release or any of its targets, inclusive', () => {
    const start = new Date('2026-07-20T00:00:00.000Z');
    const end = new Date('2026-07-27T00:00:00.000Z');
    const { sql, values } = page({ endDate: end, startDate: start });

    expect(sql).toContain('p."scheduledDate" >= ?::timestamp');
    expect(sql).toContain('g."scheduledAt" <= ?::timestamp');
    expect(sql).toContain('OR r."isInWindow"');
    expect(values).toEqual(expect.arrayContaining([start, end]));
  });

  it('binds search terms with LIKE metacharacters escaped', () => {
    const { sql, values } = page({ search: '100%_off\\' });

    expect(sql).toContain('g."title" ILIKE ?');
    expect(sql).toContain('p."label" ILIKE ?');
    expect(sql).not.toContain('100%');
    expect(values).toContain('%100\\%\\_off\\\\%');
    expect(toContainsPattern('a_b')).toBe('%a\\_b%');
  });

  it('keeps caller input out of the SQL text', () => {
    const hostile = "x'; DROP TABLE posts; --";
    const { sql, values } = page({
      brandId: hostile,
      campaignId: hostile,
      credentialIds: [hostile],
      search: hostile,
    });

    expect(sql).not.toContain('DROP TABLE');
    expect(values).toContain(hostile);
  });

  it('filters posted and not-posted on a published target', () => {
    expect(page({ publicationState: 'posted' }).sql).toContain(
      '"isPublished"\nORDER BY',
    );
    expect(page({ publicationState: 'not-posted' }).sql).toContain(
      'NOT "isPublished"',
    );
  });

  it('mirrors the status roll-up table row for row and fails closed on unknown states', () => {
    const { sql } = page();

    const order = [
      'r."invalidCount" > 0',
      'r."publishingCount" > 0',
      'r."draftCount" = r."total"',
      'r."publishedCount" = r."total"',
      'r."cancelledCount" + r."skippedCount" = r."total"',
      'r."pausedCount" = r."total"',
      'r."publishedCount" > 0',
      'r."failedCount" + r."cancelledCount" + r."skippedCount" = r."total"',
    ];
    const positions = order.map((fragment) => sql.indexOf(fragment));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('sorts unscheduled releases last and breaks ties by id in byte order', () => {
    expect(page({ sort: 'updatedAt: 1' }).sql).toContain(
      'ORDER BY "updatedAt" ASC NULLS LAST, id COLLATE "C" ASC',
    );
    expect(page({ sort: 'scheduledDate: -1' }).sql).toContain(
      'ORDER BY "effectiveScheduledAt" DESC NULLS LAST, id COLLATE "C" ASC',
    );
  });

  it('counts the same release set for out-of-range pages', () => {
    const query = { organizationId: 'org-1', statuses: [ReleaseStatus.DRAFT] };
    const count = buildReleaseListCountSql(query) as unknown as BuiltSql;

    expect(count.sql).toContain('SELECT count(*) AS "totalDocs"');
    expect(count.sql).toContain('WHERE status IN (?::text)');
    expect(count.sql).not.toContain('LIMIT');
  });
});

describe('resolveReleaseListSort', () => {
  it('defaults to newest first, or earliest scheduled for a calendar window', () => {
    expect(resolveReleaseListSort({})).toEqual({
      direction: 'DESC',
      field: 'createdAt',
    });
    expect(
      resolveReleaseListSort({
        endDate: new Date('2026-07-27T00:00:00.000Z'),
        startDate: new Date('2026-07-20T00:00:00.000Z'),
      }),
    ).toEqual({ direction: 'ASC', field: 'scheduledDate' });
  });

  it('honours an explicit sort', () => {
    expect(resolveReleaseListSort({ sort: 'updatedAt: -1' })).toEqual({
      direction: 'DESC',
      field: 'updatedAt',
    });
  });
});
