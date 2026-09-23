import { assertNoSecurityAuditHistory } from '@api/collections/brands/utils/brand-relocation-guards.util';
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
