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
    agentThreadEvent: { findMany: vi.fn().mockResolvedValue([]) },
    agentStrategy: { findMany: vi.fn().mockResolvedValue([]) },
    brand: { findMany: vi.fn().mockResolvedValue([]) },
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
      sourceHref: '/acme/~/workspace/activity',
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
      sourceHref: '/acme/~/workspace/activity',
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
    prisma.agentThreadEvent.findMany.mockResolvedValue([
      {
        runId: 'run-1',
        thread: { id: 'thread-1', title: 'My task', brand: { slug: 'brand' } },
      },
    ]);
    expect((await service.list('org', 'recipient')).docs[0].sourceHref).toBe(
      '/acme/brand/agent/thread-1',
    );
    expect(prisma.agentThreadEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          isDeleted: false,
          runId: { in: ['run-1'] },
          thread: {
            is: expect.objectContaining({
              userId: 'recipient',
              organizationId: 'org',
              isDeleted: false,
            }),
          },
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
        ingredients: [],
      },
    ]);
    expect((await service.list('org', 'recipient')).docs[0]).toMatchObject({
      sourceHref: '/acme/brand/workspace/activity',
      sourceLabel: null,
    });
    prisma.workflowExecution.findMany.mockResolvedValue([
      {
        id: 'run-1',
        workflowId: 'workflow-1',
        workflow: { label: 'Brandless', metadata: null, brand: null },
        ingredients: [],
      },
    ]);
    expect((await service.list('org', 'recipient')).docs[0].sourceHref).toBe(
      '/acme/~/workspace/activity',
    );
  });

  it('opens the latest library asset for a hidden system workflow run', async () => {
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
    prisma.workflowExecution.findMany.mockResolvedValue([
      {
        id: 'run-1',
        workflowId: 'workflow-1',
        workflow: {
          label: 'Internal agent workflow',
          metadata: { systemWorkflow: { visibility: 'hidden' } },
          brand: { slug: 'brand' },
        },
        ingredients: [
          {
            id: 'img-1',
            category: 'IMAGE',
            brand: { slug: 'brand' },
          },
        ],
      },
    ]);
    const page = await service.list('org', 'recipient');
    expect(page.docs[0]).toMatchObject({
      sourceHref:
        '/acme/brand/library/assets?categories=IMAGE&categories=IMAGE_EDIT&asset=img-1',
      sourceLabel: null,
    });
    expect(JSON.stringify(page)).not.toMatch(/Internal agent workflow/);
  });

  it('opens a visible workflow execution when no asset exists', async () => {
    const { service, prisma } = await setup();
    prisma.notificationInboxItem.findMany.mockResolvedValue([fixture(1)]);
    prisma.workflowExecution.findMany.mockResolvedValue([
      {
        id: 'run-1',
        workflowId: 'workflow-1',
        workflow: {
          label: 'Daily Posts',
          metadata: null,
          brand: { slug: 'brand' },
        },
        ingredients: [],
      },
    ]);
    expect((await service.list('org', 'recipient')).docs[0]).toMatchObject({
      sourceHref: '/acme/brand/automation/workflows/workflow-1?execution=run-1',
      sourceLabel: 'Daily Posts',
    });
  });

  it('loads executions for the actor or workflow owner, including agent runs', async () => {
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
    await service.list('org', 'recipient');
    expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          isDeleted: false,
          id: { in: ['run-1'] },
          OR: [
            { userId: 'recipient' },
            {
              workflow: {
                is: {
                  userId: 'recipient',
                  organizationId: 'org',
                  isDeleted: false,
                },
              },
            },
          ],
        }),
      }),
    );
  });

  it('links a completed proactive notification to the currently accessible strategy instead of an unrelated asset brand', async () => {
    const { service, prisma } = await setup();
    prisma.notificationInboxItem.findMany.mockResolvedValue([
      fixture(1, {
        topic: 'agent.status',
        event: {
          sourceId: 'run-1',
          sourceType: 'agent_run',
          eventKey: 'workflow.execution.completed',
          payload: {
            strategyId: 'strategy',
            sourcePath: '//untrusted.example',
          },
        },
      }),
    ]);
    prisma.agentThreadEvent.findMany.mockResolvedValue([
      {
        runId: 'run-1',
        thread: {
          id: 'thread',
          title: 'Thread',
          agentStrategyId: 'strategy',
          brand: { slug: 'main' },
        },
      },
    ]);
    prisma.workflowExecution.findMany.mockResolvedValue([
      {
        id: 'run-1',
        workflowId: 'workflow',
        workflow: { metadata: null, brand: null },
        ingredients: [
          { id: 'asset', category: 'IMAGE', brand: { slug: 'other' } },
        ],
      },
    ]);
    prisma.agentStrategy.findMany.mockResolvedValue([
      { id: 'strategy', label: 'Daily Agent', brand: { slug: 'main' } },
    ]);
    expect((await service.list('org', 'recipient')).docs[0]).toMatchObject({
      outcome: 'completed',
      sourceLabel: 'Daily Agent',
      sourceHref: '/acme/main/automation/agents/strategy',
      failure: null,
    });
  });
  it.each([false, true])(
    'resolves review event strategy source without treating it as an execution (expired=%s)',
    async (expired) => {
      const { service, prisma } = await setup();
      prisma.notificationInboxItem.findMany.mockResolvedValue([
        fixture(1, {
          topic: 'agent.status',
          event: {
            sourceId: 'strategy',
            sourceType: 'agent_strategy',
            eventKey: expired ? 'agent.review.expired' : 'agent.review.changed',
            payload: { kind: 'agent_review', strategyId: 'strategy' },
          },
        }),
      ]);
      prisma.agentStrategy.findMany.mockResolvedValue([
        { id: 'strategy', label: 'Agent', brand: { slug: 'main' } },
      ]);
      expect((await service.list('org', 'recipient')).docs[0]).toMatchObject({
        outcome: expired ? 'failed' : 'completed',
        sourceHref: '/acme/main/automation/agents/strategy',
      });
      expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: [] } }),
        }),
      );
      expect(prisma.agentStrategy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org',
            isDeleted: false,
            AND: [
              { OR: [{ userId: 'recipient' }, { id: { in: ['strategy'] } }] },
            ],
          }),
        }),
      );
    },
  );
  it('does not use a revoked strategy or payload route to reveal its home', async () => {
    const { service, prisma } = await setup();
    prisma.notificationInboxItem.findMany.mockResolvedValue([
      fixture(1, {
        topic: 'agent.status',
        event: {
          sourceId: 'strategy',
          sourceType: 'agent_strategy',
          eventKey: 'agent.review.changed',
          payload: {
            strategyId: 'strategy',
            sourcePath: '/secret/main/automation/agents/strategy',
            summary: 'private summary',
          },
        },
      }),
    ]);
    expect((await service.list('org', 'recipient')).docs[0]).toMatchObject({
      sourceHref: '/acme/~/workspace/activity',
      sourceLabel: null,
    });
  });
  it('renders social replies with a Messages link on an accessible brand', async () => {
    const { service, prisma } = await setup();
    prisma.notificationInboxItem.findMany.mockResolvedValue([
      fixture(1, {
        topic: 'social.reply',
        event: {
          sourceId: 'credential-1',
          sourceType: 'social_credential',
          eventKey: 'social.reply.received',
          payload: {
            kind: 'social_reply',
            brandId: 'brand-1',
            accountHandle: 'acme',
            replyCount: 3,
          },
        },
      }),
    ]);
    prisma.brand.findMany.mockResolvedValue([
      { id: 'brand-1', slug: 'acme-brand' },
    ]);

    const page = await service.list('org', 'recipient');

    expect(prisma.brand.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['brand-1'] },
        isDeleted: false,
        organizationId: 'org',
      },
      select: { id: true, slug: true },
    });
    expect(page.docs).toEqual([
      expect.objectContaining({
        topic: 'social.reply',
        outcome: 'completed',
        sourceHref: '/acme/acme-brand/messages',
        sourceLabel: null,
        failure: null,
        socialReply: { accountHandle: 'acme', replyCount: 3 },
      }),
    ]);
  });
  it('deep-links a version 2 social reply to its newest conversation', async () => {
    const { service, prisma } = await setup();
    prisma.notificationInboxItem.findMany.mockResolvedValue([
      fixture(1, {
        topic: 'social.reply',
        event: {
          sourceId: 'credential-1',
          sourceType: 'social_credential',
          eventKey: 'social.reply.received',
          payload: {
            version: 2,
            kind: 'social_reply',
            brandId: 'brand-1',
            accountHandle: 'acme',
            replyCount: 2,
            newestConversationId: 'conversation/b',
            conversationIds: ['conversation/b', 'conversation-a'],
          },
        },
      }),
    ]);
    prisma.brand.findMany.mockResolvedValue([
      { id: 'brand-1', slug: 'acme-brand' },
    ]);

    const page = await service.list('org', 'recipient');

    expect(page.docs[0]).toEqual(
      expect.objectContaining({
        sourceHref:
          '/acme/acme-brand/messages?socialConversation=conversation%2Fb',
        socialReply: { accountHandle: 'acme', replyCount: 2 },
      }),
    );
  });
  it('does not link a social reply for a brand the member is not assigned to', async () => {
    const { service, prisma } = await setup();
    prisma.member.findFirst.mockResolvedValue({
      ...member,
      role: { key: 'member' },
      brands: [{ id: 'brand-other' }],
    });
    prisma.notificationInboxItem.findMany.mockResolvedValue([
      fixture(1, {
        topic: 'social.reply',
        event: {
          sourceId: 'credential-1',
          sourceType: 'social_credential',
          eventKey: 'social.reply.received',
          payload: {
            kind: 'social_reply',
            brandId: 'brand-1',
            accountHandle: null,
            replyCount: 1,
          },
        },
      }),
    ]);

    const page = await service.list('org', 'recipient');

    expect(prisma.brand.findMany).not.toHaveBeenCalled();
    expect(page.docs[0]).toEqual(
      expect.objectContaining({
        sourceHref: null,
        socialReply: { accountHandle: null, replyCount: 1 },
      }),
    );
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
