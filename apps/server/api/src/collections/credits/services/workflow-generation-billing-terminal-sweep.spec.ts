import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { WorkflowGenerationBillingService } from '@api/collections/credits/services/workflow-generation-billing.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditReservationStatus } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const now = new Date('2026-10-26T10:00:00.000Z');

function hold(id: string, workloadId: string, organizationId = 'org-a') {
  return { id, organizationId, workloadId };
}

describe('WorkflowGenerationBillingService.reconcileTerminalExecutions', () => {
  let findHolds: ReturnType<typeof vi.fn>;
  let findExecution: ReturnType<typeof vi.fn>;
  let logger: { error: ReturnType<typeof vi.fn> };
  let service: WorkflowGenerationBillingService;
  let closeExecution: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    findHolds = vi.fn().mockResolvedValue([]);
    findExecution = vi.fn().mockResolvedValue(null);
    logger = { error: vi.fn() };
    service = new WorkflowGenerationBillingService(
      {
        creditReservation: { findMany: findHolds },
        workflowExecution: { findFirst: findExecution },
      } as unknown as PrismaService,
      {} as CreditsUtilsService,
      logger as unknown as LoggerService,
    );
    closeExecution = vi
      .spyOn(service, 'closeExecution')
      .mockResolvedValue(undefined);
  });

  it('only scans RESERVED workflow holds older than the grace period', async () => {
    await service.reconcileTerminalExecutions(now);

    expect(findHolds).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { lte: new Date('2026-10-26T09:50:00.000Z') },
          isDeleted: false,
          status: CreditReservationStatus.RESERVED,
          workloadType: 'workflow-generation',
        }),
      }),
    );
  });

  it('closes a terminal execution inside its own organization', async () => {
    findHolds.mockResolvedValue([hold('h1', 'exec-1', 'org-b')]);
    findExecution.mockResolvedValue({ id: 'exec-1' });

    await expect(service.reconcileTerminalExecutions(now)).resolves.toBe(1);

    expect(findExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'exec-1',
          isDeleted: false,
          organizationId: 'org-b',
          status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] },
        }),
      }),
    );
    expect(closeExecution).toHaveBeenCalledWith('exec-1', 'org-b');
  });

  it('never closes the hold of an execution that is still running', async () => {
    findHolds.mockResolvedValue([hold('h1', 'exec-1')]);
    findExecution.mockResolvedValue(null);

    await expect(service.reconcileTerminalExecutions(now)).resolves.toBe(0);

    expect(closeExecution).not.toHaveBeenCalled();
  });

  it('keeps closing the rest when one close fails', async () => {
    findHolds.mockResolvedValue([hold('h1', 'exec-1'), hold('h2', 'exec-2')]);
    findExecution.mockResolvedValue({ id: 'x' });
    const failure = new Error('Unable to start a transaction');
    closeExecution.mockRejectedValueOnce(failure).mockResolvedValue(undefined);

    await expect(service.reconcileTerminalExecutions(now)).resolves.toBe(1);

    expect(closeExecution).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      'Workflow hold terminal close failed',
      failure,
      { executionId: 'exec-1', organizationId: 'org-a' },
    );
  });

  it('pages past a full page of running executions', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      hold(`h${index}`, `running-${index}`),
    );
    findHolds
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([hold('h-late', 'ended-1')]);
    findExecution.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where.id === 'ended-1' ? { id: 'ended-1' } : null,
    );

    await expect(service.reconcileTerminalExecutions(now)).resolves.toBe(1);

    expect(findHolds).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: { id: 'h99' }, skip: 1 }),
    );
    expect(closeExecution).toHaveBeenCalledWith('ended-1', 'org-a');
  });

  it('stops once the close limit is reached', async () => {
    findHolds.mockResolvedValue([hold('h1', 'e1'), hold('h2', 'e2')]);
    findExecution.mockResolvedValue({ id: 'x' });

    await expect(service.reconcileTerminalExecutions(now, 1)).resolves.toBe(1);

    expect(closeExecution).toHaveBeenCalledTimes(1);
  });

  it('closeTerminal logs a failed close and resolves so the caller continues', async () => {
    const failure = new Error('Unable to start a transaction');
    closeExecution.mockRejectedValueOnce(failure);

    await expect(
      service.closeTerminal('exec-1', 'org-a'),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('billing close failed'),
      failure,
      { executionId: 'exec-1', organizationId: 'org-a' },
    );
  });
});
