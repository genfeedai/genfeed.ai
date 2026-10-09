import { isDeepStrictEqual } from 'node:util';
import { VisualProjectBillingService } from '@api/collections/visual-projects/services/visual-project-billing.service';
import { VisualProjectDispatchService } from '@api/collections/visual-projects/services/visual-project-dispatch.service';
import type {
  IVisualCodeQuoteSnapshot,
  IVisualCodeReceipt,
} from '@genfeedai/contracts/interfaces';
import type { VisualRevision } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

const quote: IVisualCodeQuoteSnapshot = {
  unit: 'credits',
  modelKey: 'openai/test',
  provider: 'openai',
  isByok: false,
  inputCostPerMillion: 1,
  outputCostPerMillion: 2,
  authoringCredits: 3,
  inspectionCredits: 1,
  renderCredits: 2,
  maximumCredits: 6,
  maximumAuthoringCalls: 3,
  maximumInspectionCalls: 3,
  maximumRepairs: 2,
  maximumRenderJobs: 4,
  renderDeadlineSeconds: 120,
  rendererVersion: '4.0.530',
  creditsPerSecond: 1 / 240,
  settings: { width: 640, height: 360, fps: 30, durationFrames: 30 },
  outputRequests: [{ format: 'mp4' }],
};
function fixture() {
  const revision = {
    id: 'revision',
    projectId: 'project',
    organizationId: 'org',
    brandId: 'brand',
    userId: 'user',
    workflowExecutionId: null,
    status: 'queued',
    maximumCredits: 6,
    consumedCredits: 0,
    reservationId: 'hold',
    cancelRequestedAt: null,
    receipts: [],
    diagnostics: [],
  } as unknown as VisualRevision;
  const prisma = {
    visualRevision: {
      findFirstOrThrow: vi.fn(async () => structuredClone(revision)),
      updateMany: vi.fn(async ({ where, data }) => {
        if (where.userId && where.userId !== revision.userId)
          return { count: 0 };
        if (
          where.OR &&
          !where.OR.some(
            (row: { workflowExecutionId: string | null }) =>
              row.workflowExecutionId === revision.workflowExecutionId,
          )
        )
          return { count: 0 };
        if (
          where.workflowExecutionId &&
          where.workflowExecutionId !== revision.workflowExecutionId
        )
          return { count: 0 };
        if (where.status && where.status !== revision.status)
          return { count: 0 };
        if (
          where.receipts &&
          !isDeepStrictEqual(where.receipts.equals, revision.receipts)
        )
          return { count: 0 };
        Object.assign(revision, structuredClone(data));
        return { count: 1 };
      }),
    },
    workflowNodeClaim: {
      findFirst: vi.fn(
        async (): Promise<{ leaseOwnerId: string } | null> => null,
      ),
    },
    creditReservation: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'hold',
        status: 'RESERVED',
        amount: 6,
        expiresAt: new Date(Date.now() + 3600000),
      }),
    },
  };
  const credits = {
    releaseReservation: vi.fn().mockResolvedValue({}),
    settleReservation: vi.fn().mockResolvedValue({}),
  };
  const renderer = { recoverStopped: vi.fn() };
  const billing = new VisualProjectBillingService(
    prisma as never,
    credits as never,
    {} as never,
    {} as never,
    {} as never,
    renderer as never,
  );
  revision.receipts = [billing.quoteReceipt(quote)] as never;
  const authorization = { authorizeBrand: vi.fn() };
  const queue = { withdrawUnstartedSystemWorkflowJob: vi.fn() };
  const service = new VisualProjectDispatchService(
    prisma as never,
    authorization as never,
    billing,
    {} as never,
    queue as never,
  );
  const ownership = vi.fn().mockResolvedValue(undefined);
  const run = () =>
    service.reconcileFailedExecution(revision, 'original', ownership);
  return {
    run,
    service,
    prisma,
    revision,
    credits,
    renderer,
    billing,
    ownership,
    authorization,
    queue,
  };
}

describe('admitted Motion failure reconciliation', () => {
  it('releases an unspent admitted hold once through the real billing service and preserves the original execution binding', async () => {
    const f = fixture();
    await f.run();
    await f.run();
    expect(f.revision).toMatchObject({
      status: 'failed',
      workflowExecutionId: 'original',
      consumedCredits: 0,
    });
    expect(f.credits.releaseReservation).toHaveBeenCalledTimes(1);
    expect(f.credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org',
      reservationId: 'hold',
      reason: 'release',
    });
    expect(f.credits.settleReservation).not.toHaveBeenCalled();
    expect(f.renderer.recoverStopped).not.toHaveBeenCalled();
    expect(f.queue.withdrawUnstartedSystemWorkflowJob).not.toHaveBeenCalled();
    expect(f.authorization.authorizeBrand).not.toHaveBeenCalled();
    expect(f.revision.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'settlement', state: 'confirmed' }),
      ]),
    );
  });
  it('settles confirmed incurred cost once and preserves an already completed result', async () => {
    const f = fixture();
    f.revision.status = 'completed';
    f.revision.receipts = [
      ...(f.revision.receipts as unknown as IVisualCodeReceipt[]),
      {
        id: 'author',
        kind: 'authoring',
        state: 'confirmed',
        credits: 2,
        operatorCredits: 0,
        boundCredits: 3,
        isResultApplied: true,
      },
    ] as never;
    await f.run();
    await f.run();
    expect(f.revision.status).toBe('completed');
    expect(f.credits.settleReservation).toHaveBeenCalledTimes(1);
    expect(f.credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualAmount: 2,
        actorUserId: 'user',
        brandId: 'brand',
      }),
    );
    expect(f.credits.releaseReservation).not.toHaveBeenCalled();
  });
  it.each(['started', 'indeterminate'] as const)(
    'preserves uncertain provider receipt %s without releasing the hold',
    async (state) => {
      const f = fixture();
      f.revision.receipts = [
        ...(f.revision.receipts as unknown as IVisualCodeReceipt[]),
        {
          id: 'provider',
          kind: 'authoring',
          state,
          credits: 0,
          operatorCredits: 3,
          boundCredits: 3,
          isResultApplied: false,
        },
      ] as never;
      await expect(f.run()).rejects.toThrow(
        'visual_dispatch_recovery_required',
      );
      expect(f.revision.status).toBe('queued');
      expect(f.credits.releaseReservation).not.toHaveBeenCalled();
      expect(f.credits.settleReservation).not.toHaveBeenCalled();
      expect(f.renderer.recoverStopped).not.toHaveBeenCalled();
    },
  );
  it('rejects another live owner before binding or settlement', async () => {
    const f = fixture();
    f.prisma.workflowNodeClaim.findFirst.mockResolvedValue({
      leaseOwnerId: 'live-original',
    });
    await expect(f.run()).rejects.toThrow('visual_dispatch_owner_active');
    expect(f.prisma.visualRevision.updateMany).not.toHaveBeenCalled();
    expect(f.credits.releaseReservation).not.toHaveBeenCalled();
  });
  it('detects an original owner appearing after the initial proof before stopping or settlement', async () => {
    const f = fixture();
    f.prisma.workflowNodeClaim.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ leaseOwnerId: 'late-original' });
    await expect(f.run()).rejects.toThrow('visual_dispatch_owner_active');
    expect(f.revision.status).toBe('queued');
    expect(f.credits.releaseReservation).not.toHaveBeenCalled();
  });
  it('rejects stale binding, failed lease and changed receipt CAS without touching credits', async () => {
    const f = fixture();
    f.revision.workflowExecutionId = 'other';
    await expect(f.run()).rejects.toThrow('visual_worker_binding_invalid');
    f.revision.workflowExecutionId = null;
    f.ownership.mockRejectedValueOnce(new Error('lost lease'));
    await expect(f.run()).rejects.toThrow('lost lease');
    const original = f.prisma.visualRevision.updateMany.getMockImplementation();
    f.prisma.visualRevision.updateMany.mockImplementation(async (query) =>
      query.where.receipts ? { count: 0 } : (original?.(query) ?? { count: 0 }),
    );
    await expect(f.run()).rejects.toThrow('visual_dispatch_state_changed');
    expect(f.credits.releaseReservation).not.toHaveBeenCalled();
    expect(f.credits.settleReservation).not.toHaveBeenCalled();
  });
  it('keeps pending cancellation as cancelled while releasing only the unspent hold', async () => {
    const f = fixture();
    f.revision.cancelRequestedAt = new Date();
    await f.run();
    expect(f.revision.status).toBe('cancelled');
    expect(f.credits.releaseReservation).toHaveBeenCalledTimes(1);
  });
});
