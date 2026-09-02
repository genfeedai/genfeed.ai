vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();
  return { ...actual, isSelfHostedDeployment: () => false };
});

import type { SystemWorkflowActionExecutor } from '@api/collections/workflows/system-workflow-runner.service';
import { LifecycleEmailService } from './lifecycle-email.service';
import {
  LIFECYCLE_SCHEDULING_ACTION_IDS,
  LIFECYCLE_SCHEDULING_WORKFLOW_DEFINITIONS,
  LIFECYCLE_SCHEDULING_WORKFLOW_IDS,
} from './lifecycle-email-scheduling-workflow-definition';

describe('LifecycleEmailService', () => {
  const deliveryItem = {
    email: 'founder@example.com',
    organizationId: 'org-1',
    scheduledFor: '2026-08-28T12:00:00.000Z',
    sequence: 'welcome',
    step: 'welcome-day-0',
    triggerKey: 'signup-user-1',
    userId: 'user-1',
  } as const;

  const createService = () => {
    const actions = new Map<string, SystemWorkflowActionExecutor>();
    const prisma = {
      lifecycleEmailDelivery: {
        create: vi.fn().mockResolvedValue({ id: 'delivery-1' }),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
      member: {
        findFirst: vi.fn().mockResolvedValue({ organizationId: 'org-1' }),
      },
      user: {
        findFirst: vi.fn().mockResolvedValue({
          email: 'founder@example.com',
          firstName: 'Vincent',
          id: 'user-1',
          isDeleted: false,
        }),
      },
    };
    const workflowService = { scheduleEmail: vi.fn() };
    const runner = {
      registerAction: vi.fn(
        (id: string, executor: SystemWorkflowActionExecutor) => {
          actions.set(id, executor);
        },
      ),
      registerWorkflow: vi.fn(),
      runWorkflow: vi.fn().mockResolvedValue({ result: undefined }),
    };
    const service = new LifecycleEmailService(
      prisma as never,
      workflowService as never,
      runner as never,
      { warn: vi.fn() } as never,
    );
    service.onModuleInit();
    return { actions, prisma, runner, service, workflowService };
  };

  it('registers every scheduling action and immutable graph', () => {
    const { actions, runner } = createService();

    expect([...actions.keys()]).toEqual(
      expect.arrayContaining(Object.values(LIFECYCLE_SCHEDULING_ACTION_IDS)),
    );
    expect(runner.registerWorkflow).toHaveBeenCalledTimes(
      LIFECYCLE_SCHEDULING_WORKFLOW_DEFINITIONS.length,
    );
  });

  it('routes signup scheduling through the tenant workflow', async () => {
    const { runner, service } = createService();

    await service.scheduleSignupLifecycle('user-1');

    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: LIFECYCLE_SCHEDULING_WORKFLOW_IDS.SCHEDULE,
        inputValues: {
          request: { operation: 'signup', userId: 'user-1' },
        },
        organizationId: 'org-1',
      }),
    );
  });

  it('plans the four signup deliveries without persisting or queueing them', async () => {
    const { actions, prisma, workflowService } = createService();
    const plan = actions.get(LIFECYCLE_SCHEDULING_ACTION_IDS.PLAN);

    const result = await plan?.({
      context: { organizationId: 'org-1' } as never,
      input: { request: { operation: 'signup', userId: 'user-1' } },
      provenance: {} as never,
    });

    expect((result as { deliveryItems: unknown[] }).deliveryItems).toHaveLength(
      4,
    );
    expect(prisma.lifecycleEmailDelivery.create).not.toHaveBeenCalled();
    expect(workflowService.scheduleEmail).not.toHaveBeenCalled();
  });

  it('persists a delivery without queueing it in the persistence action', async () => {
    const { actions, prisma, workflowService } = createService();

    await actions.get(LIFECYCLE_SCHEDULING_ACTION_IDS.PERSIST_DELIVERY)?.({
      context: { organizationId: 'org-1' } as never,
      input: { request: deliveryItem },
      provenance: {} as never,
    });

    expect(prisma.lifecycleEmailDelivery.create).toHaveBeenCalledOnce();
    expect(workflowService.scheduleEmail).not.toHaveBeenCalled();
  });

  it('queues a persisted delivery without writing it again', async () => {
    const { actions, prisma, workflowService } = createService();

    await actions.get(LIFECYCLE_SCHEDULING_ACTION_IDS.ENQUEUE_DELIVERY)?.({
      context: { organizationId: 'org-1' } as never,
      input: { request: deliveryItem },
      provenance: {} as never,
    });

    expect(workflowService.scheduleEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        triggerKey: deliveryItem.triggerKey,
        userId: deliveryItem.userId,
      }),
      new Date(deliveryItem.scheduledFor),
    );
    expect(prisma.lifecycleEmailDelivery.create).not.toHaveBeenCalled();
  });
});
