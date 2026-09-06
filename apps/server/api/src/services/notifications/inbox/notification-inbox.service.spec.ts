import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Test } from '@nestjs/testing';
import { NotificationInboxService } from './notification-inbox.service';

const member = {
  role: { key: 'owner' },
  brands: [],
  organization: { slug: 'acme' },
};
function fixture(index: number, overrides = {}) {
  return {
    id: `item-${index}`,
    topic: 'workflow.status',
    occurredAt: new Date('2026-09-05T10:00:00.000Z'),
    readAt: null,
    event: {
      sourceId: `run-${index}`,
      sourceType: 'workflow_execution',
      eventKey: 'workflow.execution.failed',
      payload: { error: 'secret_api_key', workflowLabel: 'private title' },
    },
    ...overrides,
  };
}
async function setup() {
  const prisma = {
    member: { findFirst: vi.fn().mockResolvedValue(member) },
    notificationInboxItem: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(2),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    workflowExecution: { findMany: vi.fn().mockResolvedValue([]) },
    agentThreadEvent: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const module = await Test.createTestingModule({
    providers: [
      NotificationInboxService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return { prisma, service: module.get(NotificationInboxService) };
}

describe('NotificationInboxService', () => {
  it('rejects revoked membership for history, count, and both mutations', async () => {
    const { service, prisma } = await setup();
    prisma.member.findFirst.mockResolvedValue(null);
    for (const action of [
      () => service.list('org', 'recipient'),
      () => service.count('org', 'recipient'),
      () => service.markRead('org', 'recipient', ['item']),
      () => service.markRead('org', 'recipient', null),
    ])
      await expect(action()).rejects.toThrow('Active membership required');
    expect(prisma.notificationInboxItem.findMany).not.toHaveBeenCalled();
    expect(prisma.notificationInboxItem.count).not.toHaveBeenCalled();
    expect(prisma.notificationInboxItem.updateMany).not.toHaveBeenCalled();
  });
  it('bounds stable history and scopes counts to current recipient and membership', async () => {
    const { service, prisma } = await setup();
    prisma.notificationInboxItem.findMany.mockResolvedValue(
      Array.from({ length: 31 }, (_, i) => fixture(i)),
    );
    const page = await service.list('org', 'recipient');
    expect(page.docs).toHaveLength(30);
    expect(page.nextCursor).toBe('2026-09-05T10:00:00.000Z|item-29');
    await service.list('org', 'recipient', page.nextCursor ?? undefined);
    expect(prisma.notificationInboxItem.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        take: 31,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        where: expect.objectContaining({
          organizationId: 'org',
          userId: 'recipient',
          isDeleted: false,
          OR: expect.any(Array),
          organization: expect.objectContaining({
            members: expect.any(Object),
          }),
        }),
      }),
    );
    await service.count('org', 'recipient');
    expect(prisma.notificationInboxItem.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: 'org',
        userId: 'recipient',
        isDeleted: false,
        readAt: null,
      }),
    });
  });
  it('rejects malformed, oversized, and non-string cursors', async () => {
    const { service } = await setup();
    for (const cursor of [
      'bad',
      'x'.repeat(401),
      '2026-09-05|item',
      ['bad'] as never,
    ])
      await expect(service.list('org', 'recipient', cursor)).rejects.toThrow(
        'Invalid inbox cursor',
      );
  });
  it('does not expose raw payload or inaccessible labels and links', async () => {
    const { service, prisma } = await setup();
    prisma.notificationInboxItem.findMany.mockResolvedValue([fixture(1)]);
    const page = await service.list('org', 'recipient');
    expect(page.docs[0]).toMatchObject({
      sourceHref: null,
      sourceLabel: null,
      failure: null,
    });
    expect(JSON.stringify(page)).not.toMatch(/secret_api_key|private title/);
  });
  it('keeps safe shared agent guidance when the source is gone and excludes raw detail', async () => {
    const { service, prisma } = await setup();
    prisma.notificationInboxItem.findMany.mockResolvedValue([
      fixture(1, {
        topic: 'agent.status',
        event: {
          sourceId: 'run-1',
          sourceType: 'agent_run',
          eventKey: 'workflow.execution.failed',
          payload: {
            failure: {
              title: 'Run failed',
              summary: 'The run stopped.',
              recovery: null,
              detail: 'secret_api_key',
            },
          },
        },
      }),
    ]);
    const page = await service.list('org', 'recipient');
    expect(page.docs[0]).toMatchObject({
      sourceHref: null,
      sourceLabel: null,
      failure: {
        title: 'Run failed',
        summary: 'The run stopped.',
        recovery: null,
      },
    });
    expect(JSON.stringify(page)).not.toContain('secret_api_key');
  });
  it('links agent failures only through an owned accessible thread', async () => {
    const { service, prisma } = await setup();
    prisma.notificationInboxItem.findMany.mockResolvedValue([
      fixture(1, {
        topic: 'agent.status',
        event: {
          sourceId: 'run-1',
          sourceType: 'agent_run',
          eventKey: 'workflow.execution.failed',
          payload: {},
        },
      }),
    ]);
    prisma.agentThreadEvent.findFirst.mockResolvedValue({
      runId: 'run-1',
      thread: { id: 'thread-1', title: 'My task', brand: { slug: 'brand' } },
    });
    expect((await service.list('org', 'recipient')).docs[0].sourceHref).toBe(
      '/acme/brand/agent/thread-1',
    );
    expect(prisma.agentThreadEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          isDeleted: false,
          runId: 'run-1',
          thread: expect.objectContaining({
            userId: 'recipient',
            organizationId: 'org',
            isDeleted: false,
          }),
        }),
      }),
    );
  });
  it('does not link hidden or brandless workflow definitions', async () => {
    const { service, prisma } = await setup();
    prisma.notificationInboxItem.findMany.mockResolvedValue([fixture(1)]);
    prisma.workflowExecution.findMany.mockResolvedValue([
      {
        id: 'run-1',
        workflowId: 'workflow-1',
        workflow: {
          label: 'Internal agent workflow',
          metadata: { systemWorkflow: { visibility: 'hidden' } },
          brand: { slug: 'brand' },
        },
      },
    ]);
    expect(
      (await service.list('org', 'recipient')).docs[0].sourceHref,
    ).toBeNull();
    prisma.workflowExecution.findMany.mockResolvedValue([
      {
        id: 'run-1',
        workflowId: 'workflow-1',
        workflow: { label: 'Brandless', metadata: null, brand: null },
      },
    ]);
    expect(
      (await service.list('org', 'recipient')).docs[0].sourceHref,
    ).toBeNull();
  });

  it('writes only unread owned rows and propagates failed mutations', async () => {
    const { service, prisma } = await setup();
    await service.markRead('org', 'recipient', ['item-1']);
    expect(prisma.notificationInboxItem.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: 'org',
        userId: 'recipient',
        readAt: null,
        id: { in: ['item-1'] },
      }),
      data: { readAt: expect.any(Date) },
    });
    prisma.notificationInboxItem.updateMany.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(service.markRead('org', 'recipient', null)).rejects.toThrow(
      'database unavailable',
    );
  });
});
