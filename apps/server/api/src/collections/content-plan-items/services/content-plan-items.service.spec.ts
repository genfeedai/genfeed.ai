import { ContentPlanItemsService } from '@api/collections/content-plan-items/services/content-plan-items.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentPlanItemStatus } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

const matches = (row: Row, where: Row) =>
  Object.entries(where).every(([key, value]) => row[key] === value);

/** In-memory content_plan_items ordered by `scheduledAt`, then `createdAt`. */
function buildService(rows: Row[]) {
  const contentPlanItem = {
    findFirst: async ({ where }: { where: Row }) =>
      rows.find((row) => matches(row, where)) ?? null,
    findMany: async ({ where }: { where: Row }) =>
      rows
        .filter((row) => matches(row, where))
        .sort(
          (a, b) =>
            Number(a.scheduledAt) - Number(b.scheduledAt) ||
            Number(a.createdAt) - Number(b.createdAt),
        ),
    update: async ({ data, where }: { data: Row; where: Row }) => {
      const row = rows.find((item) => matches(item, where));
      if (!row) throw new Error('Record to update not found.');
      Object.assign(row, data);
      return { ...row };
    },
  };
  const silent = () => undefined;
  return new ContentPlanItemsService(
    { contentPlanItem } as unknown as PrismaService,
    {
      debug: silent,
      error: silent,
      log: silent,
      warn: silent,
    } as unknown as LoggerService,
  );
}

function itemRow(id: string, overrides: Row = {}): Row {
  return {
    createdAt: new Date(1),
    data: { platforms: ['linkedin'], prompt: 'Old prompt', topic: 'Old' },
    id,
    isDeleted: false,
    organizationId: 'org-1',
    planId: 'plan-1',
    scheduledAt: new Date(10),
    status: ContentPlanItemStatus.PENDING,
    ...overrides,
  };
}

describe('ContentPlanItemsService scalar filters', () => {
  const rows = () => [
    itemRow('late', { scheduledAt: new Date(30) }),
    itemRow('early', {
      scheduledAt: new Date(10),
      status: ContentPlanItemStatus.COMPLETED,
    }),
    itemRow('early-second', {
      createdAt: new Date(2),
      scheduledAt: new Date(10),
    }),
    itemRow('other-plan', { planId: 'plan-2' }),
    itemRow('other-org', { organizationId: 'org-2' }),
    itemRow('deleted', { isDeleted: true }),
  ];

  it('lists a plan by scheduledAt, then creation, within the organization', async () => {
    const items = await buildService(rows()).listByPlan('org-1', 'plan-1');

    expect(items.map((item) => item.id)).toEqual([
      'early',
      'early-second',
      'late',
    ]);
  });

  it('filters pending items on the typed status column', async () => {
    const items = await buildService(rows()).listPendingByPlan(
      'org-1',
      'plan-1',
    );

    expect(items.map((item) => item.id)).toEqual(['early-second', 'late']);
  });
});

describe('ContentPlanItemsService.updateContent', () => {
  it('merges an operator edit into the item payload, org-scoped', async () => {
    const rows = [itemRow('item-1')];

    const item = await buildService(rows).updateContent('org-1', 'item-1', {
      topic: 'Cash flow is designed',
    });

    expect(rows[0].data).toEqual({
      platforms: ['linkedin'],
      prompt: 'Old prompt',
      topic: 'Cash flow is designed',
    });
    expect(item.topic).toBe('Cash flow is designed');
  });

  it('refuses to edit an item in another organization', async () => {
    const rows = [itemRow('item-1', { organizationId: 'org-2' })];

    await expect(
      buildService(rows).updateContent('org-1', 'item-1', { topic: 'Nope' }),
    ).rejects.toThrow();
    expect(rows[0].data).toMatchObject({ topic: 'Old' });
  });
});
