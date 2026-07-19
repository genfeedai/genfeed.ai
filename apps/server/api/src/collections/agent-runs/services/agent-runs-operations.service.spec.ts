import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import {
  type AgentRunOperationScope,
  AgentRunsOperationsService,
} from '@api/collections/agent-runs/services/agent-runs-operations.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';

describe('AgentRunsOperationsService', () => {
  const scope: AgentRunOperationScope = {
    brandId: '507f1f77bcf86cd799439013',
    organizationId: '507f1f77bcf86cd799439012',
    userId: '507f1f77bcf86cd799439014',
  };
  const agentRunsService = {
    cancel: vi.fn(),
    prepareRetry: vi.fn(),
    rollbackRetry: vi.fn(),
  };
  const queueService = { queueRun: vi.fn() };
  const threadEngineService = { appendEvent: vi.fn() };
  const loggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  let service: AgentRunsOperationsService;

  beforeEach(() => {
    service = new AgentRunsOperationsService(
      agentRunsService as unknown as AgentRunsService,
      loggerService as unknown as LoggerService,
      threadEngineService as unknown as AgentThreadEngineService,
      queueService as unknown as AgentRunQueueService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('cancelRun', () => {
    it('cancels an agent run with the supplied scope', async () => {
      const run = { id: 'run1', status: 'cancelled' };
      agentRunsService.cancel.mockResolvedValue(run);

      await expect(service.cancelRun('run1', scope)).resolves.toBe(run);
      expect(agentRunsService.cancel).toHaveBeenCalledWith(
        'run1',
        scope.organizationId,
        scope.brandId,
      );
      expect(threadEngineService.appendEvent).not.toHaveBeenCalled();
    });

    it('appends a run.cancelled event from the scalar thread id', async () => {
      agentRunsService.cancel.mockResolvedValue({
        id: 'run1',
        status: 'cancelled',
        thread: undefined,
        threadId: 'thread1',
      });
      threadEngineService.appendEvent.mockResolvedValue({});

      await service.cancelRun('run1', scope);

      expect(threadEngineService.appendEvent).toHaveBeenCalledWith({
        commandId: 'run-cancelled:run1',
        organizationId: scope.organizationId,
        payload: {
          detail: 'The active run was cancelled by the user.',
          label: 'Run cancelled',
          status: 'cancelled',
        },
        runId: 'run1',
        threadId: 'thread1',
        type: 'run.cancelled',
        userId: scope.userId,
      });
    });

    it('falls back to the populated thread id', async () => {
      agentRunsService.cancel.mockResolvedValue({
        id: 'run1',
        status: 'cancelled',
        thread: { id: 'legacy-thread1' },
        threadId: null,
      });
      threadEngineService.appendEvent.mockResolvedValue({});

      await service.cancelRun('run1', scope);

      expect(threadEngineService.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'run1',
          threadId: 'legacy-thread1',
          type: 'run.cancelled',
        }),
      );
    });

    it('throws when the run is missing', async () => {
      agentRunsService.cancel.mockResolvedValue(null);

      await expect(service.cancelRun('missing', scope)).rejects.toThrow(
        NotFoundException,
      );
      expect(threadEngineService.appendEvent).not.toHaveBeenCalled();
    });
  });

  describe('retryRun', () => {
    const preparation = {
      jobData: {
        organizationId: scope.organizationId,
        runId: 'run1',
        userId: 'user_run_owner',
      },
      previousStatus: 'FAILED',
      rollback: {
        claimedAt: new Date('2026-07-10T00:00:00.000Z'),
        state: { error: 'original failure', status: 'FAILED' },
      },
      run: { id: 'run1', retryCount: 1, status: 'PENDING' },
    };

    it('resets and requeues the run with the supplied scope', async () => {
      agentRunsService.prepareRetry.mockResolvedValue(preparation);
      queueService.queueRun.mockResolvedValue('agent-run-run1');

      await expect(service.retryRun('run1', scope)).resolves.toBe(
        preparation.run,
      );
      expect(agentRunsService.prepareRetry).toHaveBeenCalledWith(
        'run1',
        scope.organizationId,
        { brandId: scope.brandId, retriedBy: scope.userId },
      );
      expect(queueService.queueRun).toHaveBeenCalledWith(preparation.jobData);
    });

    it('throws when the run is missing', async () => {
      agentRunsService.prepareRetry.mockResolvedValue(null);

      await expect(service.retryRun('missing', scope)).rejects.toThrow(
        NotFoundException,
      );
      expect(queueService.queueRun).not.toHaveBeenCalled();
    });

    it('restores the prior state when enqueueing fails', async () => {
      agentRunsService.prepareRetry.mockResolvedValue(preparation);
      queueService.queueRun.mockRejectedValue(new Error('redis down'));
      agentRunsService.rollbackRetry.mockResolvedValue(true);

      await expect(service.retryRun('run1', scope)).rejects.toThrow(
        'redis down',
      );
      expect(agentRunsService.rollbackRetry).toHaveBeenCalledWith(
        'run1',
        scope.organizationId,
        preparation.rollback,
        scope.brandId,
      );
    });

    it('preserves the enqueue error when rollback also fails', async () => {
      agentRunsService.prepareRetry.mockResolvedValue(preparation);
      queueService.queueRun.mockRejectedValue(new Error('redis down'));
      agentRunsService.rollbackRetry.mockRejectedValue(
        new Error('database unavailable'),
      );

      await expect(service.retryRun('run1', scope)).rejects.toThrow(
        'redis down',
      );
    });

    it('appends a run.retried event when the run has a thread', async () => {
      agentRunsService.prepareRetry.mockResolvedValue({
        ...preparation,
        run: { ...preparation.run, threadId: 'thread1' },
      });
      queueService.queueRun.mockResolvedValue('agent-run-run1');
      threadEngineService.appendEvent.mockResolvedValue({});

      await service.retryRun('run1', scope);

      expect(threadEngineService.appendEvent).toHaveBeenCalledWith({
        commandId: 'run-retried:run1:1',
        organizationId: scope.organizationId,
        payload: {
          detail: 'The run was requeued for retry by the user.',
          label: 'Run retried',
          status: 'pending',
        },
        runId: 'run1',
        threadId: 'thread1',
        type: 'run.retried',
        userId: scope.userId,
      });
    });

    it('does not fail when appending the thread event fails', async () => {
      const run = { ...preparation.run, threadId: 'thread1' };
      agentRunsService.prepareRetry.mockResolvedValue({ ...preparation, run });
      queueService.queueRun.mockResolvedValue('agent-run-run1');
      threadEngineService.appendEvent.mockRejectedValue(
        new Error('thread not found'),
      );

      await expect(service.retryRun('run1', scope)).resolves.toBe(run);
      expect(loggerService.warn).toHaveBeenCalledWith(
        'Failed to append run.retried thread event',
        expect.objectContaining({ runId: 'run1', threadId: 'thread1' }),
      );
    });

    it('throws when the queue is not wired', async () => {
      const queuelessService = new AgentRunsOperationsService(
        agentRunsService as unknown as AgentRunsService,
        loggerService as unknown as LoggerService,
      );

      await expect(queuelessService.retryRun('run1', scope)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(agentRunsService.prepareRetry).not.toHaveBeenCalled();
    });
  });
});
