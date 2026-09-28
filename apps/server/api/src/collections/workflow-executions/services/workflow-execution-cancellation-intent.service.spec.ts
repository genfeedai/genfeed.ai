import { WorkflowExecutionCancellationIntentService } from '@api/collections/workflow-executions/services/workflow-execution-cancellation-intent.service';
import { WorkflowExecutionStatus as PrismaWorkflowExecutionStatus } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

describe('WorkflowExecutionCancellationIntentService (#5450)', () => {
  function makeService() {
    const workflowExecution = {
      findUnique: vi.fn().mockResolvedValue({ organizationId: 'org-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn() };
    const service = new WorkflowExecutionCancellationIntentService(
      { workflowExecution } as never,
      logger as never,
    );
    return { service, workflowExecution };
  }

  it('records the intent on a non-terminal execution, scoped to its organization and not deleted', async () => {
    const { service, workflowExecution } = makeService();

    const isRecorded = await service.requestCancellation('execution-1');

    expect(isRecorded).toBe(true);
    expect(workflowExecution.updateMany).toHaveBeenCalledWith({
      data: { cancelRequestedAt: expect.any(Date) },
      where: {
        id: 'execution-1',
        isDeleted: false,
        organizationId: 'org-1',
        status: {
          in: [
            PrismaWorkflowExecutionStatus.PENDING,
            PrismaWorkflowExecutionStatus.RUNNING,
          ],
        },
      },
    });
  });

  it('reports nothing recorded for a missing or already terminal execution', async () => {
    const { service, workflowExecution } = makeService();
    workflowExecution.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.requestCancellation('execution-1')).toBe(false);

    workflowExecution.findUnique.mockResolvedValue(null);
    expect(await service.requestCancellation('missing')).toBe(false);
  });

  it('propagates a database failure so the drain leaves the job queued', async () => {
    const { service, workflowExecution } = makeService();
    workflowExecution.findUnique.mockRejectedValue(new Error('db unavailable'));

    await expect(service.requestCancellation('execution-1')).rejects.toThrow(
      'db unavailable',
    );
  });

  it('clears a recorded intent, scoped to its organization and not deleted', async () => {
    const { service, workflowExecution } = makeService();

    await service.clearCancellationRequest('execution-1');

    expect(workflowExecution.updateMany).toHaveBeenCalledWith({
      data: { cancelRequestedAt: null },
      where: {
        cancelRequestedAt: { not: null },
        id: 'execution-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });
});
