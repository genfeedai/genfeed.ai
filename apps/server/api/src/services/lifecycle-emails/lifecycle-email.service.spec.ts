vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();
  return { ...actual, isSelfHostedDeployment: () => false };
});

import type {
  SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LifecycleEmailDeliveryStatus } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { LifecycleEmailService } from './lifecycle-email.service';
import {
  LIFECYCLE_SCHEDULING_ACTION_IDS,
  LIFECYCLE_SCHEDULING_WORKFLOW_DEFINITIONS,
  LIFECYCLE_SCHEDULING_WORKFLOW_IDS,
} from './lifecycle-email-scheduling-workflow-definition';
import type { LifecycleEmailWorkflowService } from './lifecycle-email-workflow.service';

type Row = Record<string, unknown>;
type ActionPayload = Parameters<SystemWorkflowActionExecutor>[0];

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
    const deliveries: Row[] = [];
    const scheduled: Array<{ at: Date; email: Row }> = [];
    const runs: Row[] = [];
    const registeredWorkflows: unknown[] = [];

    const sameDelivery = (row: Row, data: Row) =>
      row.userId === data.userId &&
      row.sequence === data.sequence &&
      row.step === data.step &&
      row.triggerKey === data.triggerKey;

    const prisma = {
      lifecycleEmailDelivery: {
        create: async ({ data }: { data: Row }) => {
          if (deliveries.some((row) => sameDelivery(row, data))) {
            throw { code: 'P2002' };
          }
          const row = { ...data, id: `delivery-${deliveries.length + 1}` };
          deliveries.push(row);
          return row;
        },
        findFirst: async ({
          where,
        }: {
          where: Row & { status?: { in: string[] } };
        }) =>
          deliveries.find(
            (row) =>
              sameDelivery(row, where) &&
              (where.status === undefined ||
                where.status.in.includes(String(row.status))),
          ) ?? null,
        updateMany: async () => ({ count: 0 }),
      },
      member: {
        findFirst: async () => ({ organizationId: 'org-1' }),
      },
      user: {
        findFirst: async () => ({
          email: 'founder@example.com',
          firstName: 'Vincent',
          id: 'user-1',
          isDeleted: false,
        }),
      },
    };
    const runner = {
      registerAction: (id: string, executor: SystemWorkflowActionExecutor) => {
        actions.set(id, executor);
      },
      registerWorkflow: (definition: unknown) => {
        registeredWorkflows.push(definition);
      },
      runWorkflow: async (input: Row) => {
        runs.push(input);
        return { result: undefined };
      },
    };
    const service = new LifecycleEmailService(
      prisma as unknown as PrismaService,
      {
        scheduleEmail: async (email: Row, at: Date) => {
          scheduled.push({ at, email });
        },
      } as unknown as LifecycleEmailWorkflowService,
      runner as unknown as SystemWorkflowRunnerService,
      { warn: () => undefined } as unknown as LoggerService,
    );
    service.onModuleInit();

    const run = (
      actionId: string,
      request: unknown,
      organizationId = 'org-1',
    ) =>
      actions.get(actionId)?.({
        context: { organizationId } as unknown as ActionPayload['context'],
        input: { request },
        provenance: {} as ActionPayload['provenance'],
      });

    return {
      actions,
      deliveries,
      registeredWorkflows,
      run,
      runs,
      scheduled,
      service,
    };
  };

  it('registers every scheduling action and immutable graph', () => {
    const { actions, registeredWorkflows } = createService();

    expect([...actions.keys()]).toEqual(
      expect.arrayContaining(Object.values(LIFECYCLE_SCHEDULING_ACTION_IDS)),
    );
    expect(registeredWorkflows).toEqual(
      LIFECYCLE_SCHEDULING_WORKFLOW_DEFINITIONS,
    );
  });

  it('routes signup scheduling through the tenant workflow', async () => {
    const { runs, service } = createService();

    await service.scheduleSignupLifecycle('user-1');

    expect(runs).toEqual([
      expect.objectContaining({
        canonicalId: LIFECYCLE_SCHEDULING_WORKFLOW_IDS.SCHEDULE,
        inputValues: {
          request: { operation: 'signup', userId: 'user-1' },
        },
        organizationId: 'org-1',
      }),
    ]);
  });

  it('plans the six conditional signup deliveries without persisting or queueing them', async () => {
    const { deliveries, run, scheduled } = createService();

    const result = await run(LIFECYCLE_SCHEDULING_ACTION_IDS.PLAN, {
      operation: 'signup',
      userId: 'user-1',
    });

    expect((result as { deliveryItems: unknown[] }).deliveryItems).toHaveLength(
      6,
    );
    expect(deliveries).toEqual([]);
    expect(scheduled).toEqual([]);
  });

  it('persists a delivery without queueing it in the persistence action', async () => {
    const { deliveries, run, scheduled } = createService();

    const result = await run(
      LIFECYCLE_SCHEDULING_ACTION_IDS.PERSIST_DELIVERY,
      deliveryItem,
    );

    expect(result).toEqual({ items: [deliveryItem] });
    expect(deliveries).toEqual([
      expect.objectContaining({
        scheduledFor: new Date(deliveryItem.scheduledFor),
        status: LifecycleEmailDeliveryStatus.SCHEDULED,
        step: 'welcome-day-0',
        triggerKey: 'signup-user-1',
        userId: 'user-1',
      }),
    ]);
    expect(scheduled).toEqual([]);
  });

  it('queues a persisted delivery without writing it again', async () => {
    const { deliveries, run, scheduled } = createService();

    await run(LIFECYCLE_SCHEDULING_ACTION_IDS.ENQUEUE_DELIVERY, deliveryItem);

    expect(scheduled).toEqual([
      {
        at: new Date(deliveryItem.scheduledFor),
        email: expect.objectContaining({
          organizationId: 'org-1',
          triggerKey: deliveryItem.triggerKey,
          userId: deliveryItem.userId,
        }),
      },
    ]);
    expect(deliveries).toEqual([]);
  });

  it('re-enqueues persisted scheduled rows when the scheduling graph retries', async () => {
    const { deliveries, run } = createService();
    await run(LIFECYCLE_SCHEDULING_ACTION_IDS.PERSIST_DELIVERY, deliveryItem);

    const retried = await run(
      LIFECYCLE_SCHEDULING_ACTION_IDS.PERSIST_DELIVERY,
      deliveryItem,
    );

    expect(retried).toEqual({ items: [deliveryItem] });
    expect(deliveries).toHaveLength(1);
  });

  it('does not re-enqueue a delivery that was already sent', async () => {
    const { deliveries, run } = createService();
    await run(LIFECYCLE_SCHEDULING_ACTION_IDS.PERSIST_DELIVERY, deliveryItem);
    (deliveries[0] as Row).status = LifecycleEmailDeliveryStatus.SENT;

    const retried = await run(
      LIFECYCLE_SCHEDULING_ACTION_IDS.PERSIST_DELIVERY,
      deliveryItem,
    );

    expect(retried).toEqual({ items: [] });
  });

  it('refuses a delivery planned for another organization', async () => {
    const { deliveries, run, scheduled } = createService();

    await expect(
      run(
        LIFECYCLE_SCHEDULING_ACTION_IDS.PERSIST_DELIVERY,
        deliveryItem,
        'org-2',
      ),
    ).rejects.toThrow('Lifecycle scheduling organization mismatch');
    await expect(
      run(
        LIFECYCLE_SCHEDULING_ACTION_IDS.ENQUEUE_DELIVERY,
        deliveryItem,
        'org-2',
      ),
    ).rejects.toThrow('Lifecycle scheduling organization mismatch');
    expect(deliveries).toEqual([]);
    expect(scheduled).toEqual([]);
  });
});
