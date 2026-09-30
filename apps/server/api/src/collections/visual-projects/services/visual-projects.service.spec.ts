import { isDeepStrictEqual } from 'node:util';
import { VisualProjectsService } from '@api/collections/visual-projects/services/visual-projects.service';
import {
  parseCreate,
  visualInputHash,
} from '@api/collections/visual-projects/utils/visual-code-validation.util';
import { VisualCodeStatus } from '@genfeedai/contracts';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const revision = {
    id: 'revision',
    projectId: 'project',
    number: 1,
    organizationId: 'org',
    brandId: 'brand',
    userId: 'user',
    status: VisualCodeStatus.QUEUED,
    cancelRequestedAt: null as Date | null,
    workflowExecutionId: 'execution',
    receipts: [] as unknown[],
  };
  const project = { id: 'project', brandId: 'brand', currentRevision: 1 };
  const prisma = {
    visualProject: { findFirst: vi.fn() },
    visualRevision: {
      updateMany: vi.fn(async ({ where, data }) => {
        if (where.cancelRequestedAt === null && revision.cancelRequestedAt)
          return { count: 0 };
        if (where.status?.notIn?.includes(revision.status)) return { count: 0 };
        if (
          where.receipts &&
          !isDeepStrictEqual(where.receipts.equals, revision.receipts)
        )
          return { count: 0 };
        Object.assign(revision, data);
        return { count: 1 };
      }),
      findFirstOrThrow: vi.fn(async () => revision),
      findMany: vi.fn(async () => [revision]),
    },
    workflowExecution: {
      findFirst: vi.fn(async () => ({ id: 'execution' })),
      findFirstOrThrow: vi.fn(async () => ({
        result: { metadata: { dispatchClass: 'interactive' } },
      })),
    },
    workflowNodeClaim: {
      findFirst: vi.fn(
        async (): Promise<{ leaseOwnerId: string } | null> => null,
      ),
    },
  };
  const authorization = {
    project: vi.fn(async () => project),
    revision: vi.fn(async () => revision),
    authorizeBrand: vi.fn(),
  };
  const billing = {
    reconcileStopped: vi.fn(),
    recoverReservation: vi.fn(async (value) => value),
    reserve: vi.fn(async (): Promise<string | null> => 'hold'),
  };
  const queue = {
    withdrawUnstartedSystemWorkflowJob: vi.fn(async () => 'absent'),
  };
  const workflows = {
    registerAction: vi.fn(),
    enqueueWorkflow: vi.fn(async () => ({ executionId: 'execution' })),
  };
  const service = new VisualProjectsService(
    prisma as never,
    authorization as never,
    {} as never,
    billing as never,
    workflows as never,
    queue as never,
  );
  const user = {
    id: 'user',
    userId: 'user',
    organizationId: 'org',
    brandId: 'brand',
  };
  return { revision, prisma, billing, queue, service, user, workflows };
}
describe('visual cancellation queue ownership', () => {
  it('settles a definitely unstarted revision after withdrawing its deterministic job', async () => {
    const f = fixture();
    await f.service.cancel(f.user, 'project', { revision: 1 });
    expect(f.queue.withdrawUnstartedSystemWorkflowJob).toHaveBeenCalledWith(
      'system-workflow-execution',
    );
    expect(f.revision.status).toBe(VisualCodeStatus.CANCELLED);
    expect(f.billing.reconcileStopped).toHaveBeenCalledOnce();
  });
  it('leaves a started queue owner responsible for confirmed pending provider costs', async () => {
    const f = fixture();
    f.queue.withdrawUnstartedSystemWorkflowJob.mockResolvedValue('started');
    await f.service.cancel(f.user, 'project', { revision: 1 });
    expect(f.revision.cancelRequestedAt).toBeInstanceOf(Date);
    expect(f.revision.status).toBe(VisualCodeStatus.QUEUED);
    expect(f.billing.reconcileStopped).not.toHaveBeenCalled();
  });
  it('does not settle while a durable engine lease remains live even after queue absence', async () => {
    const f = fixture();
    f.prisma.workflowNodeClaim.findFirst.mockResolvedValue({
      leaseOwnerId: 'owner',
    });
    await f.service.cancel(f.user, 'project', { revision: 1 });
    expect(f.billing.reconcileStopped).not.toHaveBeenCalled();
  });
  it('keeps bookkeeping retryable when queue ownership cannot be read', async () => {
    const f = fixture();
    f.queue.withdrawUnstartedSystemWorkflowJob.mockRejectedValue(
      new Error('redis unavailable'),
    );
    await expect(
      f.service.cancel(f.user, 'project', { revision: 1 }),
    ).rejects.toThrow('redis unavailable');
    expect(f.revision.status).toBe(VisualCodeStatus.QUEUED);
    expect(f.billing.reconcileStopped).not.toHaveBeenCalled();
  });
});

describe('visual action and HTTP service parity', () => {
  it.each([false, true])(
    'delegates the approved ceiling once and preserves proactive=%s dispatch',
    async (isProactive) => {
      const f = fixture();
      const create = vi
        .spyOn(f.service, 'create')
        .mockResolvedValue({ id: 'project', revisions: [] } as never);
      const input = {
        requestId: 'same-request',
        brandId: 'brand',
        maximumCredits: 10,
        sourceCode: 'exact source',
      };
      const result = await f.service.executeAgentAction(
        'generate_visual_code',
        input,
        {
          organizationId: 'org',
          userId: 'user',
          brandId: 'brand',
          isProactive,
        },
      );
      expect(create).toHaveBeenCalledWith(
        f.user,
        input,
        isProactive
          ? SystemWorkflowDispatchClass.BACKGROUND
          : SystemWorkflowDispatchClass.INTERACTIVE,
      );
      expect(result).toMatchObject({
        creditsUsed: 0,
        isBillingDelegated: true,
        success: true,
      });
    },
  );
  it.each([
    SystemWorkflowDispatchClass.INTERACTIVE,
    SystemWorkflowDispatchClass.BACKGROUND,
  ])(
    'inherits workflow dispatch class %s from the owned execution',
    async (dispatchClass) => {
      const f = fixture();
      f.prisma.workflowExecution.findFirstOrThrow.mockResolvedValue({
        result: { metadata: { dispatchClass } },
      });
      f.service.onModuleInit();
      const create = vi
        .spyOn(f.service, 'create')
        .mockResolvedValue({ id: 'project', revisions: [] } as never);
      const handler = f.workflows.registerAction.mock.calls.find(
        ([name]) => name === 'visual-code.generate',
      )?.[1];
      expect(handler).toBeDefined();
      await handler({
        input: { requestId: 'same-request', maximumCredits: 10 },
        context: { organizationId: 'org', userId: 'user', brandId: 'brand' },
        provenance: { executionId: 'parent-execution' },
      });
      expect(create).toHaveBeenCalledWith(
        f.user,
        { requestId: 'same-request', maximumCredits: 10 },
        dispatchClass,
      );
      expect(f.prisma.workflowExecution.findFirstOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'parent-execution',
            organizationId: 'org',
            userId: 'user',
            isDeleted: false,
          },
        }),
      );
    },
  );
});

describe('durable visual dispatch admission', () => {
  const input = {
    requestId: 'request',
    brandId: 'brand',
    label: 'Visual',
    sourceCode: 'export const VisualComposition=()=>null;',
    settings: { width: 640, height: 360, fps: 30, durationFrames: 30 },
    maximumCredits: 10,
  };
  it('cancellation during reserve cannot enqueue late work or lose the admission record', async () => {
    const f = fixture();
    f.prisma.visualProject.findFirst.mockResolvedValue({
      id: 'project',
      inputHash: visualInputHash(parseCreate(input)),
    });
    let finish: (value: string) => void = () => {};
    f.billing.reserve.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const creating = f.service.create(f.user, input);
    const rejected = expect(creating).rejects.toThrow(
      'visual_admission_cancelled',
    );
    await vi.waitFor(() => expect(f.billing.reserve).toHaveBeenCalledOnce());
    expect(f.revision.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'admission', state: 'started' }),
      ]),
    );
    await f.service.cancel(f.user, 'project', { revision: 1 });
    expect(f.billing.recoverReservation).toHaveBeenCalled();
    finish('hold');
    await rejected;
    expect(f.workflows.enqueueWorkflow).not.toHaveBeenCalled();
    expect(f.revision.status).toBe(VisualCodeStatus.CANCELLED);
  });
  it('rejects the seventeenth dispatch before wallet or queue access', async () => {
    const f = fixture();
    f.prisma.visualProject.findFirst.mockResolvedValue({
      id: 'project',
      inputHash: visualInputHash(parseCreate(input)),
    });
    f.revision.receipts = Array.from({ length: 16 }, (_, index) => ({
      id: `admission-${index}`,
      kind: 'admission',
      state: 'confirmed',
    }));
    await expect(f.service.create(f.user, input)).rejects.toThrow(
      'visual_admission_attempt_limit',
    );
    expect(f.billing.reserve).not.toHaveBeenCalled();
    expect(f.workflows.enqueueWorkflow).not.toHaveBeenCalled();
  });
});
