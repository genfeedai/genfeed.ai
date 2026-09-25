import { EmailDeliveryError } from '@api/services/notifications/notifications.service';
import { formatAgentError } from '@genfeedai/agent/server';
import { WorkflowNotificationDeliveryService } from './workflow-notification-delivery.service';

describe('WorkflowNotificationDeliveryService', () => {
  it('marks delivery complete only after Resend returns its message id', async () => {
    const prisma = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          attemptCount: 1,
          channel: 'email',
          topic: 'workflow.status',
          event: {
            sourceType: 'workflow_execution',
            payload: {
              error: null,
              executionId: 'execution-1',
              status: 'completed',
              trigger: 'agent',
              version: 1,
              workflowId: 'workflow-1',
              workflowLabel: 'Daily Posts',
            },
          },
          idempotencyKey: 'workflow-status/execution-1/completed',
          organizationId: 'org-1',
          user: { email: 'owner@example.com', isDeleted: false },
          userId: 'owner-1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: {
        findFirst: vi.fn().mockResolvedValue({ isEnabled: true }),
      },
    };
    const notifications = {
      deliverEmail: vi.fn().mockResolvedValue('resend-message-1'),
    };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      notifications as never,
      { enqueue: vi.fn() } as never,
      { warn: vi.fn() } as never,
    );

    await service.deliver('delivery-1');

    expect(notifications.deliverEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'workflow-status/execution-1/completed',
        subject: 'Workflow completed: Daily Posts',
        to: 'owner@example.com',
      }),
    );
    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        providerMessageId: 'resend-message-1',
        status: 'delivered',
      }),
      where: {
        id: 'delivery-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('skips delivery when the owner disabled the topic', async () => {
    const prisma = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          channel: 'email',
          topic: 'workflow.status',
          event: {
            sourceType: 'workflow_execution',
            payload: {},
          },
          organizationId: 'org-1',
          user: { email: 'owner@example.com', isDeleted: false },
          userId: 'owner-1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const notifications = { deliverEmail: vi.fn() };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      notifications as never,
      { enqueue: vi.fn() } as never,
      { warn: vi.fn() } as never,
    );

    await service.deliver('delivery-1');

    expect(notifications.deliverEmail).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ status: 'skipped' }),
      where: {
        id: 'delivery-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('retries a transient notifications gateway failure', async () => {
    const prisma = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          attemptCount: 1,
          channel: 'email',
          topic: 'workflow.status',
          event: {
            sourceType: 'workflow_execution',
            payload: {
              error: 'invalid recipient',
              executionId: 'execution-1',
              status: 'failed',
              trigger: 'agent',
              version: 1,
              workflowId: 'workflow-1',
              workflowLabel: 'Daily Posts',
            },
          },
          idempotencyKey: 'workflow-status/execution-1/failed',
          organizationId: 'org-1',
          user: { email: 'owner@example.com', isDeleted: false },
          userId: 'owner-1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: {
        findFirst: vi.fn().mockResolvedValue({ isEnabled: true }),
      },
    };
    const notifications = {
      deliverEmail: vi
        .fn()
        .mockRejectedValue(new EmailDeliveryError(true, 502)),
    };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      notifications as never,
      { enqueue: vi.fn() } as never,
      { warn: vi.fn() } as never,
    );

    await service.deliver('delivery-1');

    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        nextAttemptAt: expect.any(Date),
        status: 'retry_pending',
      }),
      where: {
        id: 'delivery-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('marks a transient delivery failure final after retry exhaustion', async () => {
    const prisma = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          attemptCount: 5,
          channel: 'email',
          topic: 'workflow.status',
          event: {
            sourceType: 'workflow_execution',
            payload: {
              error: 'provider unavailable',
              executionId: 'execution-1',
              status: 'failed',
              trigger: 'agent',
              version: 1,
              workflowId: 'workflow-1',
              workflowLabel: 'Daily Posts',
            },
          },
          idempotencyKey: 'workflow-status/execution-1/failed',
          organizationId: 'org-1',
          user: { email: 'owner@example.com', isDeleted: false },
          userId: 'owner-1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: {
        findFirst: vi.fn().mockResolvedValue({ isEnabled: true }),
      },
    };
    const notifications = {
      deliverEmail: vi
        .fn()
        .mockRejectedValue(new EmailDeliveryError(true, 503)),
    };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      notifications as never,
      { enqueue: vi.fn() } as never,
      { warn: vi.fn() } as never,
    );

    await service.deliver('delivery-1');

    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        nextAttemptAt: expect.any(Date),
        status: 'failed',
      }),
      where: {
        id: 'delivery-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('does not resend a stale claim after the retry ceiling', async () => {
    const prisma = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          attemptCount: 6,
          channel: 'email',
          topic: 'workflow.status',
          event: {
            sourceType: 'workflow_execution',
            payload: {
              error: 'provider unavailable',
              executionId: 'execution-1',
              status: 'failed',
              trigger: 'agent',
              version: 1,
              workflowId: 'workflow-1',
              workflowLabel: 'Daily Posts',
            },
          },
          idempotencyKey: 'workflow-status/execution-1/failed',
          organizationId: 'org-1',
          user: { email: 'owner@example.com', isDeleted: false },
          userId: 'owner-1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: {
        findFirst: vi.fn().mockResolvedValue({ isEnabled: true }),
      },
    };
    const notifications = { deliverEmail: vi.fn() };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      notifications as never,
      { enqueue: vi.fn() } as never,
      { warn: vi.fn() } as never,
    );

    await service.deliver('delivery-1');

    expect(notifications.deliverEmail).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        lastError: 'Retry limit exceeded after interrupted delivery',
        status: 'failed',
      }),
      where: {
        id: 'delivery-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('continues a recovery sweep when one queue publish fails', async () => {
    const prisma = {
      notificationDelivery: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'delivery-1' },
            { id: 'delivery-2' },
            { id: 'delivery-3' },
          ]),
      },
    };
    const queue = {
      enqueue: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Redis unavailable'))
        .mockResolvedValueOnce(undefined),
    };
    const logger = { error: vi.fn(), warn: vi.fn() };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      { deliverEmail: vi.fn() } as never,
      queue as never,
      logger as never,
    );

    await expect(service.recoverDueDeliveries()).resolves.toBe(2);

    expect(prisma.notificationDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { nextAttemptAt: 'asc' } }),
    );
    expect(queue.enqueue).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      'Durable notification recovery enqueue failed',
      expect.objectContaining({ message: 'Redis unavailable' }),
      expect.objectContaining({ deliveryId: 'delivery-2' }),
    );
  });
});

describe('agent failure delivery', () => {
  function setup(
    enabled = true,
    topic = 'agent.status',
    sourceType = 'agent_run',
  ) {
    const prisma = {
      member: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ role: { key: 'owner' }, brands: [] }),
      },
      agentStrategy: {
        findFirst: vi.fn().mockResolvedValue({ id: 'strategy' }),
      },
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          channel: 'email',
          topic,
          attemptCount: 1,
          event: {
            sourceType,
            payload: {
              version: 1,
              executionId: 'run',
              workflowId: 'workflow',
              workflowLabel: '<Daily>',
              status: 'failed',
              error: 'secret raw error',
              failure: formatAgentError('insufficient credits'),
            },
          },
          idempotencyKey: 'stable-key',
          organizationId: 'org',
          userId: 'owner',
          user: { email: 'owner@example.com', isDeleted: false },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: {
        findFirst: vi
          .fn()
          .mockResolvedValue(enabled ? { isEnabled: true } : null),
      },
    };
    const notifications = {
      deliverEmail: vi
        .fn<(input: { text: string }) => Promise<string>>()
        .mockResolvedValue('message'),
    };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      notifications as never,
      { enqueue: vi.fn() } as never,
      { warn: vi.fn() } as never,
    );
    return { prisma, notifications, service };
  }
  it('honors agent preference and renders classification without raw errors', async () => {
    const { prisma, notifications, service } = setup();
    await service.deliver('delivery');
    expect(prisma.notificationPreference.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ topic: 'agent.status' }),
      }),
    );
    expect(notifications.deliverEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Agent run failed: <Daily>',
        text: expect.stringContaining('Not enough credits'),
        idempotencyKey: 'stable-key',
      }),
    );
    expect(notifications.deliverEmail.mock.calls[0][0].text).not.toContain(
      'secret',
    );
  });
  it('preserves workflow email wording and error when classified data is present', async () => {
    const { prisma, notifications, service } = setup(
      true,
      'workflow.status',
      'workflow_execution',
    );
    await service.deliver('delivery');
    expect(prisma.notificationPreference.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ topic: 'workflow.status' }),
      }),
    );
    expect(notifications.deliverEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Workflow failed: <Daily>',
        text: 'Your workflow <Daily> failed: secret raw error',
        html: expect.stringContaining(
          'Your workflow <strong>&lt;Daily&gt;</strong> failed: secret raw error',
        ),
      }),
    );
  });
  it('skips opted-out agent notifications', async () => {
    const { prisma, notifications, service } = setup(false);
    await service.deliver('delivery');
    expect(notifications.deliverEmail).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'skipped' }),
      }),
    );
  });
  it('rejects a mismatched source and topic', async () => {
    const { prisma, notifications, service } = setup(true, 'workflow.status');
    await service.deliver('delivery');
    expect(notifications.deliverEmail).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });
  it('keeps agent delivery retryable after a transient provider failure', async () => {
    const { prisma, notifications, service } = setup();
    notifications.deliverEmail.mockRejectedValue(
      new EmailDeliveryError(true, 503),
    );
    await service.deliver('delivery');
    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'retry_pending' }),
      }),
    );
  });
});

describe('agent completion and review notifications', () => {
  function setup(
    payload: Record<string, unknown>,
    sourceType = 'agent_run',
    eventKey = 'workflow.execution.completed',
  ) {
    const prisma = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          channel: 'email',
          topic: 'agent.status',
          attemptCount: 1,
          event: {
            sourceType,
            eventKey,
            sourceId: sourceType === 'agent_strategy' ? 'strategy' : 'run',
            payload,
          },
          idempotencyKey: 'stable',
          organizationId: 'org',
          userId: 'owner',
          user: { email: 'owner@example.com', isDeleted: false },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: {
        findFirst: vi.fn().mockResolvedValue({ isEnabled: true }),
      },
      member: {
        findFirst: vi.fn().mockResolvedValue({
          role: { key: 'member' },
          brands: [{ id: 'brand' }],
        }),
      },
      agentStrategy: {
        findFirst: vi.fn().mockResolvedValue({ id: 'strategy' }),
      },
    };
    const notifications = {
      deliverEmail: vi.fn().mockResolvedValue('message'),
    };
    const config = { get: vi.fn().mockReturnValue('https://app.example.com') };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      notifications as never,
      { enqueue: vi.fn() } as never,
      { warn: vi.fn() } as never,
      undefined,
      config as never,
    );
    return { prisma, notifications, service, config };
  }
  const completion = {
    version: 1,
    executionId: 'run',
    workflowId: 'workflow',
    workflowLabel: 'Agent <safe>',
    status: 'completed',
    failure: null,
    summary: '3 drafts <ready>',
    sourcePath: '/acme/main/automation/agents/strategy',
    strategyId: 'strategy',
  };
  it('delivers a safe completed agent report using the agent preference and current scoped membership', async () => {
    const { service, notifications, prisma } = setup(completion);
    await service.deliver('delivery');
    expect(prisma.notificationPreference.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          topic: 'agent.status',
          userId: 'owner',
          isEnabled: true,
        }),
      }),
    );
    expect(prisma.agentStrategy.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'strategy',
          organizationId: 'org',
          userId: 'owner',
          isDeleted: false,
          OR: expect.arrayContaining([
            expect.objectContaining({
              brand: {
                is: {
                  id: { in: ['brand'] },
                  organizationId: 'org',
                  isDeleted: false,
                },
              },
            }),
          ]),
        }),
      }),
    );
    expect(notifications.deliverEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Agent run completed: Agent <safe>',
        html: expect.stringContaining('3 drafts &lt;ready&gt;'),
        text: expect.stringContaining(
          'https://app.example.com/acme/main/automation/agents/strategy',
        ),
        idempotencyKey: 'stable',
      }),
    );
  });
  it.each(['preference', 'membership', 'strategy'] as const)(
    'skips after %s revocation without sending',
    async (kind) => {
      const { service, notifications, prisma } = setup(completion);
      if (kind === 'preference')
        prisma.notificationPreference.findFirst.mockResolvedValue(null);
      if (kind === 'membership')
        prisma.member.findFirst.mockResolvedValue(null);
      if (kind === 'strategy')
        prisma.agentStrategy.findFirst.mockResolvedValue(null);
      await service.deliver('delivery');
      expect(notifications.deliverEmail).not.toHaveBeenCalled();
      expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'skipped' }),
        }),
      );
    },
  );
  it.each([
    '//evil.example/path',
    '/\n/evil.example/path',
    '/\\evil.example/path',
  ])(
    'does not render an external or control-character source path: %s',
    async (sourcePath) => {
      const { service, notifications } = setup({ ...completion, sourcePath });
      await service.deliver('delivery');
      expect(notifications.deliverEmail).toHaveBeenCalledOnce();
      expect(notifications.deliverEmail.mock.calls[0][0].html).not.toContain(
        'evil.example',
      );
    },
  );
  it.each([false, true])(
    'delivers genuine strategy review events without execution IDs (expired=%s)',
    async (expired) => {
      const payload = {
        version: 1,
        kind: 'agent_review',
        strategyId: 'strategy',
        strategyLabel: 'Daily agent',
        postId: 'post',
        platform: 'linkedin',
        autoPublishEnabled: !expired,
        approvalStreak: 5,
        expired,
        summary: expired
          ? 'Draft expired without publishing.'
          : 'Auto-publishing enabled.',
        sourcePath: '/acme/main/automation/agents/strategy',
      };
      const { service, notifications, prisma } = setup(
        payload,
        'agent_strategy',
        expired ? 'agent.review.expired' : 'agent.review.changed',
      );
      await service.deliver('delivery');
      expect(notifications.deliverEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: `${expired ? 'Agent review expired' : 'Agent review updated'}: Daily agent`,
          text: expect.stringContaining(payload.summary),
        }),
      );
      expect(
        prisma.agentStrategy.findFirst.mock.calls[0][0].where,
      ).not.toHaveProperty('userId');
    },
  );
  it('rejects strategy payloads in an execution envelope', async () => {
    const { service, notifications, prisma } = setup({
      version: 1,
      kind: 'agent_review',
      strategyId: 'strategy',
      strategyLabel: 'Agent',
      postId: 'post',
      platform: 'linkedin',
      autoPublishEnabled: true,
      approvalStreak: 5,
      expired: false,
      summary: 'Enabled.',
    });
    await service.deliver('delivery');
    expect(notifications.deliverEmail).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });
});

describe('agent messaging report delivery', () => {
  function setup(channel: 'telegram' | 'discord') {
    const payload = {
      version: 1,
      strategyId: 'strategy',
      summary: 'Two drafts ready.',
    };
    const prisma = {
      notificationDelivery: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          channel,
          topic: 'agent.status',
          attemptCount: 1,
          organizationId: 'org',
          userId: 'owner',
          user: { email: null, isDeleted: false },
          idempotencyKey: `report/${channel}`,
          event: { sourceType: 'agent_run', payload },
        }),
      },
      notificationPreference: { findFirst: vi.fn() },
    };
    const notifications = { deliverEmail: vi.fn() };
    const reports = {
      deliver: vi.fn().mockResolvedValue({
        status: 'delivered',
        providerMessageId: 'provider-message',
      }),
    };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      notifications as never,
      { enqueue: vi.fn() } as never,
      { warn: vi.fn() } as never,
      undefined,
      undefined,
      reports as never,
    );
    return { service, prisma, notifications, reports, payload };
  }
  it.each(['telegram', 'discord'] as const)(
    'delivers %s through binding consent without requiring an email address',
    async (channel) => {
      const { service, prisma, notifications, reports, payload } =
        setup(channel);
      await service.deliver('delivery');
      expect(reports.deliver).toHaveBeenCalledWith({
        organizationId: 'org',
        userId: 'owner',
        channel,
        idempotencyKey: `report/${channel}`,
        payload,
      });
      expect(notifications.deliverEmail).not.toHaveBeenCalled();
      expect(prisma.notificationPreference.findFirst).not.toHaveBeenCalled();
      expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org' }),
          data: expect.objectContaining({
            status: 'delivered',
            providerMessageId: 'provider-message',
          }),
        }),
      );
    },
  );
  it('records missing binding consent as skipped', async () => {
    const { service, prisma, reports } = setup('telegram');
    reports.deliver.mockResolvedValue({
      status: 'skipped',
      reason: 'binding_not_opted_in',
    });
    await service.deliver('delivery');
    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'skipped',
          lastError: 'binding_not_opted_in',
        }),
      }),
    );
  });
  it('preserves durable retries when the messaging provider fails', async () => {
    const { service, prisma, reports } = setup('discord');
    reports.deliver.mockRejectedValue(
      new Error('Agent report delivery failed'),
    );
    await service.deliver('delivery');
    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'retry_pending' }),
      }),
    );
  });
  it('does not call a provider without obtaining the lease', async () => {
    const { service, prisma, reports } = setup('telegram');
    prisma.notificationDelivery.updateMany.mockResolvedValue({ count: 0 });
    await service.deliver('delivery');
    expect(reports.deliver).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.findUnique).not.toHaveBeenCalled();
  });
});

describe('scoped agent report action', () => {
  it('refuses missing, cross-organization or wrong-channel deliveries before claiming', async () => {
    const prisma = {
      notificationDelivery: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn(),
      },
    };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.deliverAgentReport('org', 'delivery', 'telegram'),
    ).rejects.toThrow('Agent report delivery unavailable');
    expect(prisma.notificationDelivery.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'delivery',
          organizationId: 'org',
          isDeleted: false,
          topic: 'agent.status',
          channel: 'telegram',
          event: {
            sourceType: 'agent_run',
            organizationId: 'org',
            isDeleted: false,
          },
        }),
      }),
    );
    expect(prisma.notificationDelivery.updateMany).not.toHaveBeenCalled();
  });
  it('returns the persisted status after delivery instead of claiming success', async () => {
    const prisma = {
      notificationDelivery: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: 'delivery' })
          .mockResolvedValueOnce({ status: 'skipped' }),
      },
    };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const deliver = vi.spyOn(service, 'deliver').mockResolvedValue();
    await expect(
      service.deliverAgentReport('org', 'delivery', 'discord'),
    ).resolves.toEqual({ deliveryId: 'delivery', status: 'skipped' });
    expect(deliver).toHaveBeenCalledWith('delivery');
  });
});
