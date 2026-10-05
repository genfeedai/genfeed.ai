import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Test } from '@nestjs/testing';
import { WorkspaceInboxReadService } from './workspace-inbox-read.service';

const updatedAt = new Date('2026-10-05T10:00:00.000Z');
const version = { taskId: 'task-1', seenUpdatedAt: updatedAt.toISOString() };
async function setup() {
  const reads = {
    findMany: vi.fn().mockResolvedValue([]),
    createMany: vi.fn(),
    updateMany: vi.fn(),
  };
  const prisma = {
    workspaceInboxRead: reads,
    task: {
      findMany: vi.fn().mockResolvedValue([{ id: 'task-1', updatedAt }]),
    },
    $transaction: vi.fn(async (callback) =>
      callback({ workspaceInboxRead: reads }),
    ),
  };
  const module = await Test.createTestingModule({
    providers: [
      WorkspaceInboxReadService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return { prisma, reads, service: module.get(WorkspaceInboxReadService) };
}
describe('WorkspaceInboxReadService', () => {
  it('scopes read history to the user, organization and live tasks', async () => {
    const { service, reads } = await setup();
    await service.list('org-1', 'user-1');
    expect(reads.findMany).toHaveBeenCalledWith({
      select: { taskId: true, seenUpdatedAt: true },
      where: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        isDeleted: false,
        task: { organizationId: 'org-1', isDeleted: false },
      }),
    });
  });
  it('records displayed versions without modifying tasks and never regresses a read version', async () => {
    const { service, prisma, reads } = await setup();
    await service.markRead('org-1', 'user-1', [version]);
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      select: { id: true, updatedAt: true },
      where: expect.objectContaining({
        organizationId: 'org-1',
        isDeleted: false,
        id: { in: ['task-1'] },
      }),
    });
    expect(reads.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: 'org-1',
          userId: 'user-1',
          taskId: 'task-1',
          seenUpdatedAt: updatedAt,
        },
      ],
      skipDuplicates: true,
    });
    expect(reads.updateMany).toHaveBeenCalledWith({
      data: { seenUpdatedAt: updatedAt },
      where: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        taskId: 'task-1',
        isDeleted: false,
        seenUpdatedAt: { lt: updatedAt },
      }),
    });
  });
  it('counts unread tasks from all live inbox tasks and returns saved versions', async () => {
    const { service, prisma, reads } = await setup();
    reads.findMany.mockResolvedValue([
      { taskId: 'task-1', seenUpdatedAt: updatedAt },
    ]);
    prisma.task.findMany.mockResolvedValue([
      { id: 'task-1', updatedAt },
      { id: 'task-2', updatedAt },
    ]);
    expect(await service.list('org-1', 'user-1')).toEqual({
      id: 'org-1',
      unreadCount: 1,
      reads: [version],
    });
  });
  it('marks all inbox tasks read, including tasks outside any table page', async () => {
    const { service, prisma } = await setup();
    const markRead = vi
      .spyOn(service, 'markRead')
      .mockResolvedValue({ id: 'org-1', unreadCount: 0, reads: [version] });
    await service.markAllRead('org-1', 'user-1');
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      select: { id: true, updatedAt: true },
      where: expect.objectContaining({
        organizationId: 'org-1',
        isDeleted: false,
        dismissedAt: null,
        reviewState: { not: 'dismissed' },
      }),
    });
    expect(markRead).toHaveBeenCalledWith('org-1', 'user-1', [version]);
  });
  it('rejects cross-organization or missing tasks atomically', async () => {
    const { service, prisma } = await setup();
    prisma.task.findMany.mockResolvedValue([]);
    await expect(
      service.markRead('org-1', 'user-1', [version]),
    ).rejects.toThrow('Invalid workspace inbox task version');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects future versions but acknowledges older versions without consuming a newer update', async () => {
    const { service, prisma, reads } = await setup();
    await expect(
      service.markRead('org-1', 'user-1', [
        { ...version, seenUpdatedAt: '2026-10-05T10:01:00.000Z' },
      ]),
    ).rejects.toThrow('Invalid workspace inbox task version');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await service.markRead('org-1', 'user-1', [
      { ...version, seenUpdatedAt: '2026-10-05T09:59:00.000Z' },
    ]);
    expect(reads.createMany.mock.calls[0][0].data[0].seenUpdatedAt).toEqual(
      new Date('2026-10-05T09:59:00.000Z'),
    );
  });
});
