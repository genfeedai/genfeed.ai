import { AgentProactiveToolHandler } from '@api/services/agent-orchestrator/tools/agent-proactive-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { AgentStalledItemsResult } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;
type Query = {
  orderBy?: Array<Record<string, 'asc' | 'desc'>>;
  take?: number;
  where?: Row;
};

const DAY_MS = 86_400_000;
const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

/** Evaluates the equality, `in` and `lte` shapes the stalled query uses. */
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition instanceof Date) {
      return value instanceof Date && value.getTime() === condition.getTime();
    }
    if (condition !== null && typeof condition === 'object') {
      const ops = condition as { in?: unknown[]; lte?: Date };
      if (ops.in && !ops.in.includes(value)) return false;
      if (ops.lte && !(value instanceof Date && value <= ops.lte)) return false;
      return true;
    }
    return value === condition;
  });
}

function createHandler(rows: Row[], brands: Row[] = [{ id: 'brand-1' }]) {
  const prisma = {
    brand: {
      findFirst: async ({ where }: Query) =>
        brands.find((brand) => matches(brand, where)) ?? null,
    },
    post: {
      findMany: async ({ orderBy = [], take, where }: Query) => {
        const found = rows
          .filter((row) => matches(row, where))
          .sort((a, b) => {
            for (const order of orderBy) {
              const [[field]] = Object.entries(order);
              const left = a[field] as Date | string;
              const right = b[field] as Date | string;
              if (left < right) return -1;
              if (left > right) return 1;
            }
            return 0;
          });
        return found.slice(0, take ?? found.length);
      },
    },
  };
  return new AgentProactiveToolHandler(
    {} as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    prisma as never,
  );
}

function row(id: string, overrides: Row = {}): Row {
  return {
    brandId: 'brand-1',
    createdAt: daysAgo(30),
    description: `Post ${id}`,
    id,
    isDeleted: false,
    lastAttemptAt: null,
    organizationId: ORG,
    parentId: null,
    platform: 'twitter',
    reviewDecision: null,
    reviewedAt: null,
    scheduledDate: null,
    targetExecutionState: TargetExecutionState.DRAFT,
    userId: 'user-1',
    ...overrides,
  };
}

const context: ToolExecutionContext = {
  organizationId: ORG,
  userId: 'user-1',
};

function itemsOf(data: unknown): AgentStalledItemsResult {
  return data as AgentStalledItemsResult;
}

describe('AgentProactiveToolHandler.listStalledItems', () => {
  it('lists stalled posts of every kind with their last event', async () => {
    const handler = createHandler([
      row('draft'),
      row('sent-back', {
        reviewDecision: 'REQUEST_CHANGES',
        reviewedAt: daysAgo(20),
      }),
      row('overdue', {
        scheduledDate: daysAgo(16),
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
      row('failed', {
        lastAttemptAt: daysAgo(15),
        targetExecutionState: TargetExecutionState.FAILED,
      }),
    ]);
    const result = await handler.listStalledItems({}, context);

    expect(result.success).toBe(true);
    const data = itemsOf(result.data);
    expect(
      Object.fromEntries(data.items.map((item) => [item.postId, item.kind])),
    ).toEqual({
      draft: 'draft_unreviewed',
      failed: 'publish_failed',
      overdue: 'schedule_overdue',
      'sent-back': 'changes_not_actioned',
    });
    expect(data).toMatchObject({ isScanLimited: false, windowDays: 14 });
  });

  it('keeps an edited draft stalled and drops one touched by a real event', async () => {
    const handler = createHandler([
      // Edited yesterday, never reviewed: only an incidental change.
      row('edited', { updatedAt: daysAgo(1) }),
      // Reviewed yesterday: the review is a meaningful event.
      row('reviewed', {
        reviewDecision: 'APPROVED',
        reviewedAt: daysAgo(1),
      }),
    ]);
    const data = itemsOf((await handler.listStalledItems({}, context)).data);
    expect(data.items.map((item) => item.postId)).toEqual(['edited']);
  });

  it('never returns another organization, deleted posts or thread children', async () => {
    const handler = createHandler([
      row('mine'),
      row('foreign', { organizationId: OTHER_ORG }),
      row('deleted', { isDeleted: true }),
      row('reply', { parentId: 'mine' }),
    ]);
    const data = itemsOf((await handler.listStalledItems({}, context)).data);
    expect(data.items.map((item) => item.postId)).toEqual(['mine']);
  });

  it('scopes to the conversation brand and refuses a different one', async () => {
    const handler = createHandler([
      row('one', { brandId: 'brand-1' }),
      row('two', { brandId: 'brand-2' }),
    ]);
    const scoped = await handler.listStalledItems(
      {},
      { ...context, brandId: 'brand-2' },
    );
    expect(itemsOf(scoped.data).items.map((item) => item.postId)).toEqual([
      'two',
    ]);

    const mismatch = await handler.listStalledItems(
      { brandId: 'brand-1' },
      { ...context, brandId: 'brand-2' },
    );
    expect(mismatch).toMatchObject({
      error: 'brandId does not match this conversation',
      success: false,
    });
  });

  it('checks a requested brand belongs to the organization', async () => {
    const handler = createHandler([row('one')], []);
    expect(
      await handler.listStalledItems({ brandId: 'brand-9' }, context),
    ).toMatchObject({
      error: 'Brand was not found in this organization',
      success: false,
    });
  });

  it('honours the window and the limit, and says when it truncated', async () => {
    const handler = createHandler([
      row('old', { createdAt: daysAgo(100) }),
      row('mid', { createdAt: daysAgo(40) }),
      row('recent', { createdAt: daysAgo(20) }),
    ]);
    const wide = itemsOf(
      (await handler.listStalledItems({ limit: 2, windowDays: 30 }, context))
        .data,
    );
    expect(wide.items.map((item) => item.postId)).toEqual(['old', 'mid']);
    expect(wide.isTruncated).toBe(false);

    const narrow = itemsOf(
      (await handler.listStalledItems({ limit: 2 }, context)).data,
    );
    expect(narrow.items.map((item) => item.postId)).toEqual(['old', 'mid']);
    expect(narrow.isTruncated).toBe(true);
  });

  it('says so when the scan hit its read cap', async () => {
    const rows = Array.from({ length: 501 }, (_, index) =>
      row(`p${String(index).padStart(3, '0')}`, {
        createdAt: daysAgo(500 - index / 10),
      }),
    );
    const data = itemsOf(
      (await createHandler(rows).listStalledItems({}, context)).data,
    );
    expect(data.isScanLimited).toBe(true);
  });

  it.each([
    [{ windowDays: 0 }, 'windowDays must be an integer from 1 to 365'],
    [{ windowDays: 1.5 }, 'windowDays must be an integer from 1 to 365'],
    [{ windowDays: 366 }, 'windowDays must be an integer from 1 to 365'],
    [{ limit: 0 }, 'limit must be an integer from 1 to 50'],
    [{ limit: 51 }, 'limit must be an integer from 1 to 50'],
    [{ limit: '5' }, 'limit must be an integer from 1 to 50'],
  ])('rejects %j', async (params, error) => {
    expect(await createHandler([]).listStalledItems(params, context)).toEqual({
      creditsUsed: 0,
      error,
      success: false,
    });
  });
});
