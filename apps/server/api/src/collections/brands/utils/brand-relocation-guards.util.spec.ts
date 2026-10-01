import {
  assertNoBrandedGenerationReceiptHistory,
  assertNoCrunGenerationHistory,
  assertNoOpenVisualProjects,
  assertNoSecurityAuditHistory,
} from '@api/collections/brands/utils/brand-relocation-guards.util';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

describe('security audit relocation history', () => {
  for (const model of [
    'agentPublishAudit',
    'agentUntrustedContentAudit',
  ] as const) {
    const paths =
      model === 'agentPublishAudit'
        ? ['direct', 'execution', 'postGroup']
        : ['direct', 'execution'];
    for (const path of paths) {
      it.each([false, true])(
        `${model} finds ${path} history with isDeleted=%s`,
        async (isDeleted) => {
          const reference =
            path === 'direct'
              ? { brandId: 'brand' }
              : path === 'execution'
                ? { workflowExecutionId: { in: ['execution'] } }
                : { postGroupId: { in: ['post-group'] } };
          const findAudit = vi.fn(
            async (args: {
              where: { organizationId: string; OR: unknown[] };
            }) => {
              expect(args.where.organizationId).toBe('org');
              expect(args.where).not.toHaveProperty('isDeleted');
              expect(args.where.OR).toContainEqual(reference);
              return {
                id: 'audit',
                brandId: path === 'direct' ? 'brand' : null,
                isDeleted,
              };
            },
          );
          const client = {
            workflow: {
              findMany: vi.fn().mockResolvedValue([{ id: 'workflow' }]),
            },
            workflowExecution: {
              findMany: vi.fn().mockResolvedValue([{ id: 'execution' }]),
            },
            postGroup: {
              findMany: vi.fn().mockResolvedValue([{ id: 'post-group' }]),
            },
            agentPublishAudit: { findFirst: vi.fn().mockResolvedValue(null) },
            agentUntrustedContentAudit: {
              findFirst: vi.fn().mockResolvedValue(null),
            },
          };
          client[model].findFirst = findAudit;
          await expect(
            assertNoSecurityAuditHistory(
              client as unknown as Prisma.TransactionClient,
              'brand',
              'org',
            ),
          ).rejects.toThrow(/security audit history/);
          expect(client.workflow.findMany).toHaveBeenCalledWith({
            where: { organizationId: 'org', brandId: 'brand' },
            select: { id: true },
          });
          expect(client.workflowExecution.findMany).toHaveBeenCalledWith({
            where: { organizationId: 'org', workflowId: { in: ['workflow'] } },
            select: { id: true },
          });
          expect(client.postGroup.findMany).toHaveBeenCalledWith({
            where: { organizationId: 'org', brandId: 'brand' },
            select: { id: true },
          });
        },
      );
    }
  }

  it('permits a brand without audit history', async () => {
    const client = {
      workflow: { findMany: vi.fn().mockResolvedValue([]) },
      workflowExecution: { findMany: vi.fn().mockResolvedValue([]) },
      postGroup: { findMany: vi.fn().mockResolvedValue([]) },
      agentPublishAudit: { findFirst: vi.fn().mockResolvedValue(null) },
      agentUntrustedContentAudit: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    await expect(
      assertNoSecurityAuditHistory(
        client as unknown as Prisma.TransactionClient,
        'brand',
        'org',
      ),
    ).resolves.toBeUndefined();
  });
});

describe('visual revision relocation holds', () => {
  it('scopes outstanding work and excludes only confirmed settlement or terminal free work without a hold', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await expect(
      assertNoOpenVisualProjects(
        {
          visualRevision: { findFirst },
        } as unknown as Prisma.TransactionClient,
        'brand',
        'org',
      ),
    ).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        brandId: 'brand',
        isDeleted: false,
        OR: [
          { status: { notIn: ['completed', 'failed', 'cancelled'] } },
          {
            AND: [
              {
                receipts: {
                  not: {
                    array_contains: [
                      { kind: 'settlement', state: 'confirmed' },
                    ],
                  },
                },
              },
              {
                OR: [
                  { reservationId: { not: null } },
                  {
                    receipts: {
                      not: {
                        array_contains: [
                          { kind: 'quote', quote: { maximumCredits: 0 } },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      select: { id: true },
    });
  });
  it('refuses a paid terminal revision while its hold remains unsettled', async () => {
    const client = {
      visualRevision: {
        findFirst: vi.fn().mockResolvedValue({ id: 'terminal-unsettled' }),
      },
    };
    await expect(
      assertNoOpenVisualProjects(
        client as unknown as Prisma.TransactionClient,
        'brand',
        'org',
      ),
    ).rejects.toThrow(/unfinished visual work/);
  });
});

interface ReceiptHistoryQuery {
  where: { organizationId: string; brandId: string };
  select: { id: boolean };
}

interface ReceiptHistoryRow {
  id: string;
  organizationId: string;
  brandId: string;
  isDeleted: boolean;
}

describe('saved generation relocation history', () => {
  const conflict =
    'Cannot move a brand with saved generation history. Receipts and receipt events, including deleted records, must remain in their original organization.';
  const scope = { organizationId: 'org', brandId: 'brand' };
  const query = { where: scope, select: { id: true } };

  it.each([
    ['brandedGenerationReceipt', false],
    ['brandedGenerationReceipt', true],
    ['brandedGenerationReceiptEvent', false],
    ['brandedGenerationReceiptEvent', true],
  ] as const)(
    'rejects %s history with isDeleted=%s',
    async (model, isDeleted) => {
      const client = {
        brandedGenerationReceipt: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        brandedGenerationReceiptEvent: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      client[model].findFirst.mockResolvedValue({
        id: 'history',
        ...scope,
        isDeleted,
      });
      await expect(
        assertNoBrandedGenerationReceiptHistory(
          client as unknown as Prisma.TransactionClient,
          'brand',
          'org',
        ),
      ).rejects.toThrow(conflict);
      for (const delegate of Object.values(client)) {
        expect(delegate.findFirst).toHaveBeenCalledExactlyOnceWith(query);
        expect(delegate.findFirst.mock.calls[0][0].where).not.toHaveProperty(
          'isDeleted',
        );
      }
    },
  );

  it.each(['none', 'foreign organization', 'foreign brand'] as const)(
    'permits %s history without leaking another scope',
    async (scenario) => {
      const rows: ReceiptHistoryRow[] =
        scenario === 'none'
          ? []
          : [
              {
                id: 'foreign-history',
                organizationId:
                  scenario === 'foreign organization' ? 'other-org' : 'org',
                brandId: scenario === 'foreign brand' ? 'other-brand' : 'brand',
                isDeleted: true,
              },
            ];
      const findHistory = (args: ReceiptHistoryQuery) =>
        Promise.resolve(
          rows.find(
            (row) =>
              row.organizationId === args.where.organizationId &&
              row.brandId === args.where.brandId,
          ) ?? null,
        );
      const client = {
        brandedGenerationReceipt: { findFirst: vi.fn(findHistory) },
        brandedGenerationReceiptEvent: { findFirst: vi.fn(findHistory) },
      };
      await expect(
        assertNoBrandedGenerationReceiptHistory(
          client as unknown as Prisma.TransactionClient,
          'brand',
          'org',
        ),
      ).resolves.toBeUndefined();
      for (const delegate of Object.values(client))
        expect(delegate.findFirst).toHaveBeenCalledExactlyOnceWith(query);
    },
  );
});

describe('immutable Crun generation financial history', () => {
  const ingredientQuery = {
    where: {
      organizationId: 'org',
      brandId: 'brand',
      isDeleted: { in: [false, true] },
    },
    select: { id: true },
  };
  const taskQuery = {
    where: {
      organizationId: 'org',
      isDeleted: { in: [false, true] },
      OR: [{ brandId: 'brand' }, { ingredientId: { in: ['ingredient'] } }],
    },
    select: { id: true },
  };
  for (const path of ['direct', 'ingredient'] as const) {
    for (const state of [
      'prepared',
      'submitting',
      'pending',
      'running',
      'provider-success',
      'provider-failed',
      'recovery-required',
      'finalized',
      'completed',
      'failed',
      'cancelled',
    ]) {
      it.each([false, true])(
        `refuses ${path} ${state} financial history with deleted=%s`,
        async (isDeleted) => {
          const row = {
            id: 'task',
            organizationId: 'org',
            brandId: path === 'direct' ? 'brand' : null,
            ingredientId: 'ingredient',
            isDeleted,
            state,
            fundingBinding: { kind: 'byok', organizationId: 'org' },
            quoteSnapshot: { quoteId: 'immutable-quote' },
          };
          const before = JSON.stringify(row);
          const client = {
            ingredient: {
              findMany: vi.fn().mockResolvedValue([{ id: 'ingredient' }]),
            },
            crunGenerationTask: {
              findFirst: vi.fn().mockResolvedValue(row),
              update: vi.fn(),
              updateMany: vi.fn(),
            },
          };
          await expect(
            assertNoCrunGenerationHistory(
              client as unknown as Prisma.TransactionClient,
              'brand',
              'org',
            ),
          ).rejects.toThrow(/retained Crun generation financial history/);
          expect(client.ingredient.findMany).toHaveBeenCalledExactlyOnceWith(
            ingredientQuery,
          );
          expect(
            client.crunGenerationTask.findFirst,
          ).toHaveBeenCalledExactlyOnceWith(taskQuery);
          expect(client.crunGenerationTask.update).not.toHaveBeenCalled();
          expect(client.crunGenerationTask.updateMany).not.toHaveBeenCalled();
          expect(JSON.stringify(row)).toBe(before);
        },
      );
    }
  }
  it.each(['none', 'foreign organization', 'foreign brand'] as const)(
    'permits %s without crossing ownership scope',
    async (scenario) => {
      const rows =
        scenario === 'none'
          ? []
          : [
              {
                id: 'foreign',
                organizationId:
                  scenario === 'foreign organization' ? 'other-org' : 'org',
                brandId: scenario === 'foreign brand' ? 'other-brand' : 'brand',
                ingredientId: 'foreign-ingredient',
                isDeleted: true,
              },
            ];
      const client = {
        ingredient: {
          findMany: vi.fn().mockResolvedValue([{ id: 'ingredient' }]),
        },
        crunGenerationTask: {
          findFirst: vi.fn(
            async (args: typeof taskQuery) =>
              rows.find(
                (row) =>
                  row.organizationId === args.where.organizationId &&
                  args.where.isDeleted.in.includes(row.isDeleted) &&
                  args.where.OR.some(
                    (scope) =>
                      ('brandId' in scope && scope.brandId === row.brandId) ||
                      ('ingredientId' in scope &&
                        scope.ingredientId?.in.includes(row.ingredientId)),
                  ),
              ) ?? null,
          ),
        },
      };
      await expect(
        assertNoCrunGenerationHistory(
          client as unknown as Prisma.TransactionClient,
          'brand',
          'org',
        ),
      ).resolves.toBeUndefined();
      expect(client.ingredient.findMany).toHaveBeenCalledExactlyOnceWith(
        ingredientQuery,
      );
      expect(
        client.crunGenerationTask.findFirst,
      ).toHaveBeenCalledExactlyOnceWith(taskQuery);
    },
  );
});
