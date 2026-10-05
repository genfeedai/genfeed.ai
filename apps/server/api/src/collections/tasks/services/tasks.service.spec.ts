vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { TasksService } from '@api/collections/tasks/services/tasks.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { expectCloudGuardPasses } from '@api/shared/testing/cloud-guard-assertions';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';

describe('TasksService tenant scoping', () => {
  const taskRow = {
    config: {},
    createdAt: new Date('2026-09-01T00:00:00Z'),
    id: 'task-1',
    isDeleted: false,
    organizationId: 'org-1',
    status: 'backlog',
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  };
  const task = {
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  let service: TasksService;

  beforeEach(() => {
    vi.clearAllMocks();
    task.findFirst.mockResolvedValue(taskRow);
    task.update.mockResolvedValue(taskRow);
    service = new TasksService(
      { task } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('resolves the patch pre-read under the request tenant', async () => {
    await runWithTenantContext({ organizationId: 'org-1' }, () =>
      service.patch('task-1', { config: { note: 'x' } } as never),
    );

    expect(task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task-1', isDeleted: false, organizationId: 'org-1' },
      }),
    );
    expectCloudGuardPasses('Task', 'findFirst', task.findFirst);
  });

  it('claims the rollup lease and counts the attempt, only within the cap and for a free lease', async () => {
    const now = new Date('2026-10-05T12:00:00.000Z');
    const transaction = {
      task: {
        findFirst: vi.fn().mockResolvedValue({ rollupAttempts: 2 }),
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
    };
    const leasing = new TasksService(
      {
        $transaction: vi.fn(async (run: (client: unknown) => unknown) =>
          run(transaction),
        ),
        task,
      } as unknown as PrismaService,
      {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      {} as never,
      {} as never,
      {} as never,
    );
    const input = {
      maxAttempts: 3,
      now,
      organizationId: 'org-1',
      taskId: 'task-1',
      ttlMs: 60_000,
    };

    await expect(
      leasing.acquireRollupLease({ ...input, owner: 'owner-a' }),
    ).resolves.toBe(2);
    await expect(
      leasing.acquireRollupLease({ ...input, owner: 'owner-b' }),
    ).resolves.toBeNull();

    expect(transaction.task.updateMany).toHaveBeenNthCalledWith(1, {
      data: {
        rollupAttempts: { increment: 1 },
        rollupLeaseExpiresAt: new Date('2026-10-05T12:01:00.000Z'),
        rollupLeaseOwner: 'owner-a',
      },
      where: {
        id: 'task-1',
        isDeleted: false,
        OR: [
          { rollupLeaseExpiresAt: null },
          { rollupLeaseExpiresAt: { lte: now } },
        ],
        organizationId: 'org-1',
        rollupAttempts: { lt: 3 },
        rolledUpAt: null,
        status: 'in_progress',
      },
    });
  });

  it('writes a conditional patch only while the task still matches', async () => {
    const transaction = {
      task: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ config: { request: 'apple' } })
          .mockResolvedValueOnce(taskRow)
          .mockResolvedValueOnce(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (run: (client: unknown) => unknown) =>
        run(transaction),
      ),
      task,
    };
    const conditional = new TasksService(
      prisma as unknown as PrismaService,
      {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      {} as never,
      {} as never,
      {} as never,
    );
    const expected = {
      rollupLeaseOwner: 'owner-a',
      status: 'in_progress' as const,
    };

    await expect(
      conditional.patchIfMatches('task-1', 'org-1', expected, {
        config: { qualityAssessment: { gate: 'pass' } },
        rollupLeaseOwner: null,
        status: 'in_review',
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'task-1' }));
    expect(transaction.task.updateMany).toHaveBeenCalledWith({
      data: {
        config: { qualityAssessment: { gate: 'pass' }, request: 'apple' },
        rollupLeaseOwner: null,
        status: 'in_review',
      },
      where: {
        id: 'task-1',
        isDeleted: false,
        organizationId: 'org-1',
        rollupLeaseOwner: 'owner-a',
        status: 'in_progress',
      },
    });

    // The row no longer matches (another holder, or already rolled up).
    await expect(
      conditional.patchIfMatches('task-1', 'org-1', expected, {
        progress: { stage: 'running' },
      }),
    ).resolves.toBeNull();
    expect(transaction.task.updateMany).toHaveBeenCalledOnce();
  });

  it('looks up tasks by identifier within the organization only', async () => {
    await runWithTenantContext({ organizationId: 'org-1' }, () =>
      service.findByIdentifier('GENA-18', 'org-1'),
    );

    expect(task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          identifier: 'GENA-18',
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    expectCloudGuardPasses('Task', 'findFirst', task.findFirst);
  });
});
