import { AgentProactiveToolHandler } from '@api/services/agent-orchestrator/tools/agent-proactive-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deployment = vi.hoisted(() => ({ cloud: true }));
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => deployment.cloud,
}));

/**
 * The week calendar over an in-memory post store that evaluates every filter
 * the handler sends (tenant scope, brand relation, state, date window, paging).
 * Only the database is faked; counts, rows and gap days are the handler's own.
 */

type Row = Record<string, unknown>;

const ORG = 'org-1';
const BRAND_A = 'brand-a';
const BRAND_B = 'brand-b';
const NOW = new Date('2026-11-16T10:00:00.000Z');
const HOUR = 3_600_000;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'brand') {
      const allowed = (
        (condition as { is: { id: { in: string[] } } }).is.id.in ?? []
      ).includes(String(row.brandId));
      return allowed;
    }
    const value = row[key];
    if (condition === null) return value === null || value === undefined;
    if (condition instanceof Date || typeof condition !== 'object') {
      return value === condition;
    }
    const ops = condition as Record<string, unknown>;
    if ('in' in ops) return (ops.in as unknown[]).includes(value);
    if (value === null || value === undefined) return false;
    const actual = new Date(value as string).getTime();
    if ('gte' in ops && actual < (ops.gte as Date).getTime()) return false;
    if ('lt' in ops && actual >= (ops.lt as Date).getTime()) return false;
    return true;
  });
}

function createPostsService(rows: Row[]) {
  return {
    findAll: vi.fn(
      async (
        input: { orderBy?: Record<string, 1 | -1>; where: Row },
        options: { limit?: number; page?: number; pagination?: boolean },
      ) => {
        const matched = rows.filter((row) => matches(row, input.where));
        const [field = 'id', direction = 1] =
          Object.entries(input.orderBy ?? {})[0] ?? [];
        const sortKey = (row: Row) =>
          row[field] instanceof Date
            ? (row[field] as Date).toISOString()
            : String(row[field] ?? '');
        matched.sort(
          (a, b) =>
            direction * sortKey(a).localeCompare(sortKey(b)) ||
            String(a.id).localeCompare(String(b.id)),
        );
        const limit = options.limit ?? 20;
        const page = options.page ?? 1;
        const docs =
          options.pagination === false
            ? matched.slice(0, limit)
            : matched.slice((page - 1) * limit, page * limit);
        return {
          docs,
          hasNextPage:
            options.pagination !== false && page * limit < matched.length,
          totalDocs:
            options.pagination === false ? docs.length : matched.length,
        };
      },
    ),
  };
}

let sequence = 0;
function post(overrides: Row): Row {
  sequence += 1;
  return {
    brandId: BRAND_A,
    description: `Post ${sequence}`,
    groupId: null,
    id: `post-${String(sequence).padStart(3, '0')}`,
    isDeleted: false,
    organizationId: ORG,
    parentId: null,
    platform: 'twitter',
    scheduledDate: null,
    targetExecutionState: TargetExecutionState.DRAFT,
    timezone: 'UTC',
    ...overrides,
  };
}

/** `perDay` X posts a day from today 00:00Z for 7 days; 6 a day is one every 4 hours. */
function weekOfPosts(brandId: string, perDay: number): Row[] {
  const start = Date.parse('2026-11-16T00:00:00.000Z');
  return Array.from({ length: 7 * perDay }, (_, index) =>
    post({
      brandId,
      groupId: `release-${brandId}-${index}`,
      scheduledDate: new Date(
        start +
          Math.floor(index / perDay) * 24 * HOUR +
          (index % perDay) * (24 / perDay) * HOUR,
      ),
      targetExecutionState: TargetExecutionState.SCHEDULED,
    }),
  );
}

function seed(): Row[] {
  return [
    // Brand A: 42 X posts plus a carousel a day = 49 scheduled in the week.
    ...weekOfPosts(BRAND_A, 6),
    ...Array.from({ length: 7 }, (_, day) =>
      post({
        brandId: BRAND_A,
        groupId: `carousel-${day}`,
        scheduledDate: new Date(
          Date.parse('2026-11-16T09:00:00.000Z') + day * 24 * HOUR,
        ),
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ),
    // Brand B: one a day.
    ...weekOfPosts(BRAND_B, 1),
    // 15 drafts of any age across both brands.
    ...Array.from({ length: 10 }, () => post({ brandId: BRAND_A })),
    ...Array.from({ length: 5 }, () => post({ brandId: BRAND_B })),
  ];
}

function createHandler(
  rows: Row[],
  options: {
    allowedBrandIds?: string[];
    hasBrandAccess?: boolean;
    isUnlimited?: boolean;
  } = {},
) {
  const postsService = createPostsService(rows);
  const predicate = vi
    .fn()
    .mockResolvedValue(
      options.isUnlimited
        ? { isDeleted: false, organizationId: ORG }
        : { id: { in: options.allowedBrandIds ?? [BRAND_A, BRAND_B] } },
    );
  const brands = [BRAND_A, BRAND_B].map((id) => ({ id }));
  const prisma = {
    brand: {
      findFirst: vi.fn(
        async ({ where }: { where: { AND?: Row[]; id?: string } }) => {
          const id = where.id ?? (where.AND ?? [])[0]?.id;
          const allowed = options.allowedBrandIds ?? [BRAND_A, BRAND_B];
          return brands.find((brand) => brand.id === id) &&
            allowed.includes(String(id))
            ? { id }
            : null;
        },
      ),
    },
  };
  const handler = new AgentProactiveToolHandler(
    {} as never,
    postsService as never,
    undefined,
    undefined,
    undefined,
    prisma as never,
    undefined,
    options.hasBrandAccess === false ? undefined : ({ predicate } as never),
  );
  return { handler, postsService };
}

const ctx: ToolExecutionContext = { organizationId: ORG, userId: 'user-1' };

type Calendar = {
  draftsCount: number;
  drafts?: Row[];
  draftsHasMore?: boolean;
  dayKeys: string[];
  gapDays: string[];
  gapsVerified: boolean;
  hasMore: boolean;
  scheduled: Array<Row & { brandId: string; releaseId: string | null }>;
  scheduledCount: number;
  timezone: string;
  totalCount: number;
};

async function readCalendar(
  handler: AgentProactiveToolHandler,
  params: Record<string, unknown>,
): Promise<Calendar> {
  const result = await handler.getContentCalendar(params, ctx);
  expect(result.error).toBeUndefined();
  expect(result.success).toBe(true);
  return result.data as unknown as Calendar;
}

describe('AgentProactiveToolHandler.getContentCalendar (#10133)', () => {
  beforeEach(() => {
    deployment.cloud = true;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts 49 scheduled posts and returns all of them across pages', async () => {
    const { handler } = createHandler(seed());

    const first = await readCalendar(handler, { brandId: BRAND_A, days: 7 });
    expect(first).toMatchObject({
      draftsCount: 10,
      hasMore: false,
      scheduledCount: 49,
      totalCount: 49,
    });
    expect(first.scheduled).toHaveLength(49);
  });

  it('pages rows with a stated limit until hasMore is false', async () => {
    const { handler } = createHandler(seed());

    const pages: string[][] = [];
    let hasMore = true;
    for (let page = 1; hasMore; page += 1) {
      const calendar = await readCalendar(handler, {
        brandId: BRAND_A,
        days: 7,
        limit: 20,
        page,
      });
      pages.push(calendar.scheduled.map((row) => String(row.id)));
      expect(calendar.scheduledCount).toBe(49);
      hasMore = calendar.hasMore;
    }

    expect(pages.map((ids) => ids.length)).toEqual([20, 20, 9]);
    expect(new Set(pages.flat()).size).toBe(49);
  });

  it('does not let drafts take rows from scheduled posts and lists them only when asked', async () => {
    const { handler } = createHandler(seed());

    const withoutDrafts = await readCalendar(handler, { days: 7 });
    expect(withoutDrafts.drafts).toBeUndefined();
    expect(withoutDrafts.draftsCount).toBe(15);
    expect(
      withoutDrafts.scheduled.every(
        (row) => row.state === TargetExecutionState.SCHEDULED,
      ),
    ).toBe(true);

    const withDrafts = await readCalendar(handler, {
      days: 7,
      includeDrafts: true,
      limit: 10,
    });
    expect(withDrafts.drafts).toHaveLength(10);
    expect(withDrafts.draftsHasMore).toBe(true);
    expect(withDrafts.draftsCount).toBe(15);
  });

  it('returns only the requested brand', async () => {
    const { handler } = createHandler(seed());

    const calendar = await readCalendar(handler, {
      brandId: BRAND_B,
      days: 7,
      includeDrafts: true,
    });

    expect(calendar.scheduledCount).toBe(7);
    expect(calendar.scheduled.map((row) => row.brandId)).toEqual(
      Array(7).fill(BRAND_B),
    );
    expect(calendar.draftsCount).toBe(5);
    expect(calendar.drafts?.map((row) => row.brandId)).toEqual(
      Array(5).fill(BRAND_B),
    );
  });

  it('returns none of a brand the caller cannot access, in the counts too', async () => {
    const { handler } = createHandler(seed(), { allowedBrandIds: [BRAND_B] });

    const calendar = await readCalendar(handler, {
      days: 7,
      includeDrafts: true,
    });

    expect(calendar.scheduledCount).toBe(7);
    expect(new Set(calendar.scheduled.map((row) => row.brandId))).toEqual(
      new Set([BRAND_B]),
    );
    expect(calendar.draftsCount).toBe(5);

    const denied = await handler.getContentCalendar(
      { brandId: BRAND_A, days: 7 },
      ctx,
    );
    expect(denied.success).toBe(false);
  });

  it('fails closed on cloud when brand access cannot be resolved', async () => {
    const { handler } = createHandler(seed(), { hasBrandAccess: false });

    const result = await handler.getContentCalendar({ days: 7 }, ctx);

    expect(result.success).toBe(false);
  });

  it('gives every scheduled row the release id and brand to act on', async () => {
    const { handler } = createHandler(seed());

    const calendar = await readCalendar(handler, { brandId: BRAND_B, days: 7 });

    expect(calendar.scheduled.map((row) => row.releaseId)).toEqual(
      Array.from({ length: 7 }, (_, index) => `release-brand-b-${index}`),
    );
  });

  it('explains a failed post and does not count it as a filled day', async () => {
    const rows = [
      post({
        brandId: BRAND_A,
        groupId: 'release-failed',
        scheduledDate: new Date('2026-11-17T09:00:00.000Z'),
        targetError: {
          code: 'rate_limited',
          message: 'X rate limit reached',
        },
        targetExecutionState: TargetExecutionState.FAILED,
      }),
    ];
    const { handler } = createHandler(rows);

    const calendar = await readCalendar(handler, { days: 3 });

    expect(calendar.scheduled[0]).toMatchObject({
      error: { code: 'rate_limited', message: 'X rate limit reached' },
      releaseId: 'release-failed',
      state: TargetExecutionState.FAILED,
    });
    expect(calendar.scheduledCount).toBe(0);
    expect(calendar.gapDays).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
    ]);
  });

  it('does not list a day as a gap when a post lands on it in the requested timezone', async () => {
    // 23:30Z on the 17th is 00:30 on the 18th in Malta (UTC+1).
    const rows = [
      post({
        scheduledDate: new Date('2026-11-17T23:30:00.000Z'),
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ];
    const { handler } = createHandler(rows);

    const utc = await readCalendar(handler, { days: 3, timezone: 'UTC' });
    const malta = await readCalendar(handler, {
      days: 3,
      timezone: 'Europe/Malta',
    });

    expect(utc.gapDays).toEqual(['2026-11-16', '2026-11-18']);
    expect(malta.gapDays).toEqual(['2026-11-16', '2026-11-17']);
    expect(malta.scheduled[0]).toMatchObject({ localDate: '2026-11-18' });
  });

  it('reports no gaps, not false ones, when the day scan hit its cap', async () => {
    // 2000 posts fill the 16th and the scan stops there, so the 18th's only
    // post is never seen and its day must not be reported as empty.
    const rows = [
      ...Array.from({ length: 2000 }, () =>
        post({
          scheduledDate: new Date('2026-11-16T12:00:00.000Z'),
          targetExecutionState: TargetExecutionState.SCHEDULED,
        }),
      ),
      post({
        id: 'post-zzz',
        scheduledDate: new Date('2026-11-18T12:00:00.000Z'),
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ];
    const { handler } = createHandler(rows);

    const calendar = await readCalendar(handler, { days: 3, timezone: 'UTC' });

    expect(calendar.gapsVerified).toBe(false);
    expect(calendar.gapDays).toEqual([]);
    expect(calendar.dayKeys).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
    ]);
  });

  it('names every day of the window and verifies the gaps of a complete scan', async () => {
    const { handler } = createHandler([
      post({
        scheduledDate: new Date('2026-11-17T12:00:00.000Z'),
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ]);

    const calendar = await readCalendar(handler, { days: 3, timezone: 'UTC' });

    expect(calendar.gapsVerified).toBe(true);
    expect(calendar.dayKeys).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
    ]);
    expect(calendar.gapDays).toEqual(['2026-11-16', '2026-11-18']);
  });

  it('defaults the day buckets to the timezone the posts were scheduled in', async () => {
    const rows = [
      post({
        scheduledDate: new Date('2026-11-17T23:30:00.000Z'),
        targetExecutionState: TargetExecutionState.SCHEDULED,
        timezone: 'Europe/Malta',
      }),
    ];
    const { handler } = createHandler(rows);

    const calendar = await readCalendar(handler, { days: 3 });

    expect(calendar.timezone).toBe('Europe/Malta');
    expect(calendar.gapDays).toEqual(['2026-11-16', '2026-11-17']);
  });

  it('rejects a timezone that does not exist and an oversized page', async () => {
    const { handler } = createHandler(seed());

    expect(
      (
        await handler.getContentCalendar(
          { days: 7, timezone: 'Not/AZone' },
          ctx,
        )
      ).success,
    ).toBe(false);
    expect(
      (await handler.getContentCalendar({ days: 7, limit: 500 }, ctx)).success,
    ).toBe(false);
  });

  it('applies no brand filter on a self-hosted install', async () => {
    deployment.cloud = false;
    const { handler } = createHandler(seed(), { hasBrandAccess: false });

    const calendar = await readCalendar(handler, { days: 7 });

    expect(calendar.scheduledCount).toBe(56);
  });

  it('applies no brand filter on a self-hosted install whose key has no brand limit', async () => {
    deployment.cloud = false;
    const { handler } = createHandler(seed(), { isUnlimited: true });

    const calendar = await readCalendar(handler, { days: 7 });

    expect(calendar.scheduledCount).toBe(56);
  });

  it('keeps a self-hosted key limited to one brand to that brand', async () => {
    deployment.cloud = false;
    const { handler } = createHandler(seed(), { allowedBrandIds: [BRAND_B] });

    const calendar = await readCalendar(handler, { days: 7 });

    expect(calendar.scheduledCount).toBe(7);
    expect(new Set(calendar.scheduled.map((row) => row.brandId))).toEqual(
      new Set([BRAND_B]),
    );
  });
});
