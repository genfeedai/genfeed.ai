import { SECOND_ORDER_TARGETS } from '@api/collections/brands/constants/brand-org-cascade.constants';
import {
  assertNoOrgOnlyChildOrphans,
  type CascadeDelegate,
  findStaleSecondOrderChildren,
  resolveSecondOrderFilters,
} from '@api/collections/brands/utils/brand-relocation-cascade.util';
import type { Prisma } from '@genfeedai/prisma';
import { InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

function target(delegate: string) {
  const found = SECOND_ORDER_TARGETS.find(
    (entry) => entry.delegate === delegate,
  );
  if (!found) throw new Error(`no second-order target ${delegate}`);
  return found;
}

function delegates(
  parents: Record<string, string[]>,
  counts: Record<string, number> = {},
): Record<string, CascadeDelegate> {
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        const key = String(name);
        return {
          count: vi.fn().mockResolvedValue(counts[key] ?? 0),
          findMany: vi
            .fn()
            .mockResolvedValue((parents[key] ?? []).map((id) => ({ id }))),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        };
      },
    },
  ) as Record<string, CascadeDelegate>;
}

describe('resolveSecondOrderFilters', () => {
  it('follows the parent by its scalar foreign key', async () => {
    const client = delegates({ workflow: ['wf_1', 'wf_2'] });

    await expect(
      resolveSecondOrderFilters(
        client,
        target('workflowVersion'),
        'brand',
        new Map(),
      ),
    ).resolves.toEqual([[{ workflowId: { in: ['wf_1', 'wf_2'] } }]]);
  });

  it('reaches the brand through a relation when the parent has no brand key', async () => {
    const client = {
      workflowExecution: {
        count: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ id: 'ex_1' }]),
        updateMany: vi.fn(),
      },
    } as unknown as Record<string, CascadeDelegate>;

    await expect(
      resolveSecondOrderFilters(
        client,
        target('workflowNodeClaim'),
        'brand',
        new Map(),
      ),
    ).resolves.toEqual([[{ executionId: { in: ['ex_1'] } }]]);
    expect(client.workflowExecution.findMany).toHaveBeenCalledWith({
      select: { id: true },
      where: { workflow: { brandId: 'brand' } },
    });
  });

  it('splits a brand with very many parents so no list nears the bind-parameter limit', async () => {
    const ids = Array.from({ length: 12_001 }, (_, index) => `wf_${index}`);
    const client = delegates({ workflow: ids });

    const [filters] = await resolveSecondOrderFilters(
      client,
      target('workflowVersion'),
      'brand',
      new Map(),
    );

    expect(filters).toHaveLength(3);
    expect(
      filters.map(
        (filter) => (filter.workflowId as { in: string[] }).in.length,
      ),
    ).toEqual([5000, 5000, 2001]);
  });

  it('reads each parent once for all the children that share it', async () => {
    const client = delegates({ workflowExecution: ['ex_1'] });
    const parentIds = new Map<string, Promise<string[]>>();

    for (const delegate of [
      'workflowExecutionNodeResult',
      'workflowArtifact',
      'workflowNodeClaim',
      'workflowNodeContinuation',
    ]) {
      await resolveSecondOrderFilters(
        client,
        target(delegate),
        'brand',
        parentIds,
      );
    }

    expect(parentIds.size).toBe(1);
  });

  it('keeps one group per parent when a child has several', async () => {
    const client = delegates({
      botActivity: ['activity_1'],
      monitoredAccount: ['account_1'],
      replyBotConfig: ['config_1'],
    });

    const groups = await resolveSecondOrderFilters(
      client,
      target('processedTweet'),
      'brand',
      new Map(),
    );

    expect(groups).toEqual([
      [{ replyBotConfigId: { in: ['config_1'] } }],
      [{ monitoredAccountId: { in: ['account_1'] } }],
      [{ botActivityId: { in: ['activity_1'] } }],
    ]);
  });
});

describe('org-only child orphan audit', () => {
  it('names every configured child that kept the source organization', async () => {
    const client = delegates(
      { post: ['post_1'], workflowExecution: ['ex_1'] },
      { postPublishFinalization: 1, workflowNodeClaim: 4 },
    );

    await expect(
      findStaleSecondOrderChildren(client, 'brand', 'org-dest'),
    ).resolves.toEqual([
      'workflowNodeClaim (4)',
      'postPublishFinalization (1)',
    ]);
  });

  it('is quiet when the cascade moved every child', async () => {
    const client = delegates({ post: ['post_1'], workflowExecution: ['ex_1'] });

    await expect(
      findStaleSecondOrderChildren(client, 'brand', 'org-dest'),
    ).resolves.toEqual([]);
  });

  it('ignores catalog rows for tables the cascade knows or deliberately leaves alone', async () => {
    const tx = {
      ...delegates({}),
      $queryRaw: vi.fn().mockResolvedValue([
        {
          child_table: 'workflow_node_claims',
          fk_column: 'executionId',
          org_column: 'organizationId',
          parent_table: 'workflow_executions',
        },
        {
          child_table: 'subscription_attributions',
          fk_column: 'sourceContentId',
          org_column: 'organizationId',
          parent_table: 'posts',
        },
      ]),
    };

    await expect(
      assertNoOrgOnlyChildOrphans(
        new Proxy(tx, {
          get: (target, name) =>
            name in target
              ? Reflect.get(target, name)
              : delegates({})[String(name)],
        }) as unknown as Prisma.TransactionClient,
        'brand',
        'org-dest',
      ),
    ).resolves.toBeUndefined();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });

  it('refuses an unknown table with rows left in the source organization', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          child_table: 'future_children',
          fk_column: 'postId',
          org_column: 'organizationId',
          parent_table: 'posts',
        },
      ])
      .mockResolvedValueOnce([{ n: 2 }]);
    const tx = new Proxy(
      { $queryRaw: queryRaw },
      {
        get: (target, name) =>
          name in target
            ? Reflect.get(target, name)
            : delegates({})[String(name)],
      },
    ) as unknown as Prisma.TransactionClient;

    await expect(
      assertNoOrgOnlyChildOrphans(tx, 'brand', 'org-dest'),
    ).rejects.toThrow(InternalServerErrorException);
    const [sql] = queryRaw.mock.calls[1];
    expect(sql.sql).toContain('"future_children"');
    expect(sql.sql).toContain('IS DISTINCT FROM');
    expect(sql.values).toEqual(['brand', 'org-dest']);
  });

  it('never interpolates an identifier that is not a plain name', async () => {
    const queryRaw = vi.fn().mockResolvedValueOnce([
      {
        child_table: 'x"; DROP TABLE posts; --',
        fk_column: 'postId',
        org_column: 'organizationId',
        parent_table: 'posts',
      },
    ]);
    const tx = new Proxy(
      { $queryRaw: queryRaw },
      {
        get: (target, name) =>
          name in target
            ? Reflect.get(target, name)
            : delegates({})[String(name)],
      },
    ) as unknown as Prisma.TransactionClient;

    await expect(
      assertNoOrgOnlyChildOrphans(tx, 'brand', 'org-dest'),
    ).resolves.toBeUndefined();
    expect(queryRaw).toHaveBeenCalledOnce();
  });
});
