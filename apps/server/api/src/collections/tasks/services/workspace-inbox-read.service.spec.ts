import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Test } from '@nestjs/testing';
import { WorkspaceInboxReadService } from './workspace-inbox-read.service';

const updatedAt = new Date('2026-10-05T10:00:00.000Z');
const version = { taskId: 'task-1', seenUpdatedAt: updatedAt.toISOString() };
async function setup() {
  const prisma = {
    workspaceInboxRead: { findMany: vi.fn().mockResolvedValue([]) },
    task: {
      findMany: vi.fn().mockResolvedValue([{ id: 'task-1', updatedAt }]),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([{ unreadCount: 1 }]),
  };
  const module = await Test.createTestingModule({
    providers: [
      WorkspaceInboxReadService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return { prisma, service: module.get(WorkspaceInboxReadService) };
}
describe('WorkspaceInboxReadService', () => {
  it('scopes read history to the user, organization and live tasks', async () => {
    const { service, prisma } = await setup();
    await service.list('org-1', 'user-1');
    expect(prisma.workspaceInboxRead.findMany).toHaveBeenCalledWith({
      select: { taskId: true, seenUpdatedAt: true },
      where: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        isDeleted: false,
        task: expect.objectContaining({
          organizationId: 'org-1',
          isDeleted: false,
        }),
      }),
    });
  });
  it('validates displayed versions before writing', async () => {
    const { service, prisma } = await setup();
    await service.markRead('org-1', 'user-1', [version]);
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      select: { id: true, updatedAt: true },
      where: expect.objectContaining({
        organizationId: 'org-1',
        isDeleted: false,
        id: { in: ['task-1'] },
      }),
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw.mock.calls[0][0].values).toContainEqual(
      updatedAt,
    );
  });
  it('returns the database count and saved versions', async () => {
    const { service, prisma } = await setup();
    prisma.workspaceInboxRead.findMany.mockResolvedValue([
      { taskId: 'task-1', seenUpdatedAt: updatedAt },
    ]);
    expect(await service.list('org-1', 'user-1')).toEqual({
      id: 'org-1',
      unreadCount: 1,
      reads: [version],
    });
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });
  it('marks all read with one database write independent of queue size', async () => {
    const { service, prisma } = await setup();
    await service.markAllRead('org-1', 'user-1');
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });
  it('rejects cross-organization or missing tasks atomically', async () => {
    const { service, prisma } = await setup();
    prisma.task.findMany.mockResolvedValue([]);
    await expect(
      service.markRead('org-1', 'user-1', [version]),
    ).rejects.toThrow('Invalid workspace inbox task version');
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
  it('rejects future versions but acknowledges older displayed versions', async () => {
    const { service, prisma } = await setup();
    await expect(
      service.markRead('org-1', 'user-1', [
        { ...version, seenUpdatedAt: '2026-10-05T10:01:00.000Z' },
      ]),
    ).rejects.toThrow('Invalid workspace inbox task version');
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    await service.markRead('org-1', 'user-1', [
      { ...version, seenUpdatedAt: '2026-10-05T09:59:00.000Z' },
    ]);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
