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
